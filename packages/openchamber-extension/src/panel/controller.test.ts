// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { GuestRequest, GuestRequestResult, SessionSnapshot } from "@openchamber/sdk";
import {
  buildOverview,
  buildSpeedWindow,
  buildToolPage,
} from "@opencode-insight/telemetry/queries";
import type { SessionInsight } from "@opencode-insight/telemetry/schema";
import { createPanelController, parseResponse, type PanelState } from "./controller";

const session = (id = "one", directory = "/local"): SessionInsight => ({
  version: 1,
  sessionID: id,
  directory,
  updatedAt: 1,
  revision: 1,
  requests: [],
  tools: [],
  interruptedCapture: false,
});
const json = (value: unknown, status = 200) => ({ status, body: JSON.stringify(value) });
// Paint visibility may be false for usable frames under host decorative overlays.
function browserIntersection(initial = true, observeInitial = true) {
  let notify: (values?: boolean[]) => void = () => {};
  let intersecting = initial;
  const disconnect = vi.fn();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(listener: IntersectionObserverCallback) {
        notify = (values = [intersecting]) =>
          listener(
            values.map(
              (value) =>
                ({
                  isIntersecting: value,
                  isVisible: false,
                }) as unknown as IntersectionObserverEntry,
            ),
            this as unknown as IntersectionObserver,
          );
        this.observe = () => {
          if (observeInitial) notify();
        };
      }
      observe: () => void;
      disconnect = disconnect;
    },
  );
  return {
    disconnect,
    set(value: boolean) {
      intersecting = value;
      notify();
    },
    deliver(values: boolean[]) {
      intersecting = values.at(-1)!;
      notify(values);
    },
  };
}
function response(request: GuestRequest, raw = session()) {
  const body = JSON.parse(request.body!);
  if (request.path === "/overview")
    return body.after === raw.revision
      ? {
          sessionID: raw.sessionID,
          directory: raw.directory,
          revision: raw.revision,
          unchanged: true,
        }
      : buildOverview(raw);
  if (request.path === "/speed-window") return buildSpeedWindow(raw);
  if (request.path === "/tool-page") return buildToolPage(raw, body);
  throw new Error(`Unexpected legacy path: ${request.path}`);
}
function harness(
  request?: (request: GuestRequest) => Promise<GuestRequestResult>,
  surface: "panel" | "status" = "panel",
  replay = false,
) {
  let onSession: (session: SessionSnapshot | null) => void = () => {};
  let onDirectory: (directory: string | null) => void = () => {};
  const states: PanelState[] = [];
  const serviceRequest = vi.fn(
    request ??
      (async (request: GuestRequest) => {
        const body = JSON.parse(request.body!);
        return json(response(request, session(body.sessionID, body.directory)));
      }),
  );
  const unsubSession = vi.fn();
  const unsubDirectory = vi.fn();
  const controller = createPanelController(
    {
      onSession(listener) {
        onSession = listener;
        if (replay) listener({ id: "one", title: "one", busy: false });
        return unsubSession;
      },
      onDirectory(listener) {
        onDirectory = listener;
        if (replay) listener("/local");
        return unsubDirectory;
      },
      serviceRequest,
    },
    (state) => states.push(state),
    surface,
  );
  return {
    controller,
    states,
    serviceRequest,
    unsubSession,
    unsubDirectory,
    select(id = "one", directory = "/local") {
      onDirectory(directory);
      onSession({ id, title: id, busy: false });
    },
    directory(value: string) {
      onDirectory(value);
    },
  };
}

describe("panel controller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    browserIntersection();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("parses JSON and safely surfaces service errors", () => {
    expect(parseResponse(json({ ok: true }))).toEqual({ ok: true });
    expect(() => parseResponse(json({ error: "Session location unavailable" }, 404))).toThrow(
      "Session location unavailable",
    );
    expect(() => parseResponse({ status: 200, body: "not json" })).toThrow("invalid JSON");
    expect(() => parseResponse(json({}, 503))).toThrow("unavailable");
  });

  test("fetches overview and speed initially, retains data on failure, retries", async () => {
    const h = harness();
    h.select();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.serviceRequest).toHaveBeenCalledTimes(2);
    expect(h.states.at(-1)?.overview?.sessionID).toBe("one");
    h.serviceRequest.mockRejectedValue(new Error("Capture offline"));
    await vi.advanceTimersByTimeAsync(2999);
    expect(h.serviceRequest).toHaveBeenCalledTimes(2);
    expect(h.states.at(-1)?.error).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.states.at(-1)?.error).toContain("Capture offline");
    expect(h.states.at(-1)?.overview?.sessionID).toBe("one");
    h.serviceRequest.mockImplementation(async (request) => json(response(request)));
    h.controller.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.states.at(-1)?.error).toBeUndefined();
    expect(h.states.at(-1)?.speed?.revision).toBe(1);
    h.controller.dispose();
  });

  test("fetches only speed for the expanded Resources section", async () => {
    const h = harness(undefined, "status");
    h.select();
    await vi.advanceTimersByTimeAsync(999);
    expect(h.serviceRequest).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.serviceRequest).toHaveBeenCalledTimes(2);
    expect(h.serviceRequest.mock.calls.map(([request]) => request.path)).toEqual([
      "/speed-window",
      "/speed-window",
    ]);
    expect(h.states.at(-1)?.speed?.sessionID).toBe("one");
    expect(h.states.at(-1)?.overview).toBeUndefined();
    h.controller.dispose();
  });

  test("drops stale session results and never overlaps polling requests", async () => {
    const pending: (() => void)[] = [];
    const h = harness(
      (request) =>
        new Promise((resolve) => {
          const body = JSON.parse(request.body!);
          pending.push(() =>
            resolve(json(response(request, session(body.sessionID, body.directory)))),
          );
        }),
    );
    h.select();
    h.select("two");
    h.controller.retry();
    await vi.advanceTimersByTimeAsync(3000);
    expect(h.serviceRequest).toHaveBeenCalledTimes(1);
    pending.splice(0).forEach((resolve) => resolve());
    await vi.advanceTimersByTimeAsync(0);
    expect(h.serviceRequest).toHaveBeenCalledTimes(2);
    expect(h.states.at(-1)?.overview).toBeUndefined();
    pending.splice(0).forEach((resolve) => resolve());
    await vi.advanceTimersByTimeAsync(0);
    expect(h.serviceRequest).toHaveBeenCalledTimes(3);
    pending.splice(0).forEach((resolve) => resolve());
    await vi.advanceTimersByTimeAsync(0);
    expect(h.states.at(-1)?.overview?.sessionID).toBe("two");
    h.directory("/other");
    expect(h.states.at(-1)?.overview).toBeUndefined();
    h.controller.dispose();
    pending.splice(0).forEach((resolve) => resolve());
    await vi.advanceTimersByTimeAsync(0);
    expect(h.states.at(-1)?.overview).toBeUndefined();
  });

  test("works without IntersectionObserver and pauses hidden documents, drops pending results and disposes", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const h = harness();
    h.select();
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(4000);
    expect(h.states.at(-1)?.overview).toBeUndefined();
    expect(h.serviceRequest).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.states.at(-1)?.overview?.sessionID).toBe("one");
    h.controller.dispose();
    const count = h.serviceRequest.mock.calls.length;
    await vi.advanceTimersByTimeAsync(4000);
    expect(h.serviceRequest).toHaveBeenCalledTimes(count);
    expect(h.unsubSession).toHaveBeenCalledOnce();
    expect(h.unsubDirectory).toHaveBeenCalledOnce();
  });

  test("rejects a mismatched session location", async () => {
    const h = harness(async (request) => json(response(request, session("one", "/wrong"))));
    h.select();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.states.at(-1)?.error).toContain("different session location");
    expect(h.states.at(-1)?.overview).toBeUndefined();
    h.controller.dispose();
  });

  test.each(["panel", "status"] as const)(
    "%s freezes the idle viewport, resumes on activity and freezes again on completion",
    async (surface) => {
      vi.setSystemTime(30000);
      const raw = session();
      const h = harness(async (request) => json(response(request, raw)), surface);
      h.select();
      await vi.advanceTimersByTimeAsync(0);
      const initial = h.states.at(-1)!.speed!.generation!;
      const renders = h.states.length;
      await vi.advanceTimersByTimeAsync(3000);
      expect(h.states.at(-1)?.speed?.generation).toEqual(initial);
      if (surface === "panel") expect(h.states).toHaveLength(renders);

      raw.requests.push({
        id: "request",
        model: "model",
        startedAt: Date.now(),
        status: "running",
        reasoningMode: "unknown",
        capture: "live",
        buckets: [],
        context: [],
      });
      raw.updatedAt = Date.now();
      raw.revision++;
      await vi.advanceTimersByTimeAsync(3000);
      const running = h.states.at(-1)!.speed!.generation!;
      expect(running.end).toBeGreaterThan(initial.end);
      expect(running.end - running.start).toBe(900000);
      await vi.advanceTimersByTimeAsync(1000);
      expect(h.states.at(-1)!.speed!.generation!.end).toBe(running.end + 1000);

      Object.assign(raw.requests[0], {
        status: "completed",
        streamedAt: Date.now(),
        endedAt: Date.now(),
        usage: { input: 0, output: 20, reasoning: 80, cacheRead: 0, cacheWrite: 0 },
      });
      raw.updatedAt = Date.now();
      raw.revision++;
      await vi.advanceTimersByTimeAsync(3000);
      const completed = h.states.at(-1)!.speed!.generation!;
      expect(completed.tps).toBe(25);
      await vi.advanceTimersByTimeAsync(3000);
      expect(h.states.at(-1)?.speed?.generation).toEqual(completed);
      h.controller.dispose();
    },
  );

  test("retains failed overview data and fetches a changed revision after recovery", async () => {
    let revision = 1;
    let failSnapshot = false;
    const h = harness(async (request) => {
      if (request.path === "/overview") {
        if (failSnapshot) return json({ error: "Snapshot offline" }, 503);
        return json(response(request, { ...session(), revision }));
      }
      return json(response(request, { ...session(), revision }));
    });
    h.select();
    await vi.advanceTimersByTimeAsync(0);
    revision = 2;
    failSnapshot = true;
    await vi.advanceTimersByTimeAsync(3000);
    expect(h.states.at(-1)?.overview?.revision).toBe(1);
    expect(h.states.at(-1)?.speed?.revision).toBe(1);
    expect(h.states.at(-1)?.error).toContain("Snapshot offline");
    failSnapshot = false;
    await vi.advanceTimersByTimeAsync(3000);
    expect(h.states.at(-1)?.overview?.revision).toBe(2);
    expect(h.states.at(-1)?.error).toBeUndefined();
    expect(
      h.serviceRequest.mock.calls.filter(([request]) => request.path === "/overview"),
    ).toHaveLength(3);
    h.controller.dispose();
  });

  test("forces retry reads but refreshes speed independently at chart deadlines", async () => {
    vi.setSystemTime(0);
    const raw = {
      ...session(),
      requests: [
        {
          id: "request",
          model: "model",
          startedAt: 0,
          status: "running" as const,
          reasoningMode: "unknown" as const,
          capture: "live" as const,
          buckets: [],
          context: [],
        },
      ],
    };
    const h = harness(async (request) => json(response(request, raw)));
    h.select();
    await vi.advanceTimersByTimeAsync(0);
    const initial = h.states.at(-1)!.overview;
    await vi.advanceTimersByTimeAsync(14000);
    expect(
      h.serviceRequest.mock.calls.filter(([request]) => request.path === "/speed-window"),
    ).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(
      h.serviceRequest.mock.calls.filter(([request]) => request.path === "/speed-window"),
    ).toHaveLength(2);
    h.controller.requestSpeed();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.states.at(-1)?.overview).toBe(initial);
    expect(
      h.serviceRequest.mock.calls.filter(([request]) => request.path === "/speed-window"),
    ).toHaveLength(3);
    h.controller.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(JSON.parse(h.serviceRequest.mock.calls.at(-2)![0].body!)).not.toHaveProperty("after");
    expect(h.states.at(-1)?.overview).not.toBe(initial);
    expect(
      h.serviceRequest.mock.calls.filter(([request]) => request.path === "/speed-window"),
    ).toHaveLength(4);
    h.controller.dispose();
  });

  test("scopes tool disclosure to the current target and rejects stale details", async () => {
    let finish = () => {};
    const h = harness((request) => {
      const body = JSON.parse(request.body!);
      const raw = session(body.sessionID, body.directory);
      const result = json(response(request, raw));
      if (request.path === "/tool-page")
        return new Promise((resolve) => {
          finish = () => resolve(result);
        });
      return Promise.resolve(result);
    });
    h.select();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.serviceRequest.mock.calls.map(([request]) => request.path)).toEqual([
      "/overview",
      "/speed-window",
    ]);
    const pending = h.controller.loadTools({ group: "bash", limit: 20 });
    const rejected = expect(pending).rejects.toThrow("Session location changed");
    expect(JSON.parse(h.serviceRequest.mock.calls.at(-1)![0].body!)).toEqual({
      sessionID: "one",
      directory: "/local",
      group: "bash",
      limit: 20,
    });
    h.select("two", "/other");
    finish();
    await rejected;
    await vi.advanceTimersByTimeAsync(0);
    const current = h.controller.loadTools({ toolID: "missing" });
    expect(JSON.parse(h.serviceRequest.mock.calls.at(-1)![0].body!)).toEqual({
      sessionID: "two",
      directory: "/other",
      toolID: "missing",
    });
    finish();
    expect((await current).sessionID).toBe("two");
    h.controller.dispose();
  });

  test("waits for the first intersection and pauses offscreen until reopening", async () => {
    const intersection = browserIntersection(false, false);
    const h = harness();
    h.select();
    await vi.advanceTimersByTimeAsync(4000);
    h.controller.retry();
    h.controller.requestSpeed();
    await expect(h.controller.loadTools({ group: "bash" })).rejects.toThrow("hidden");
    await vi.advanceTimersByTimeAsync(0);
    expect(h.serviceRequest).not.toHaveBeenCalled();
    intersection.set(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.serviceRequest).toHaveBeenCalledTimes(2);
    intersection.set(false);
    h.select("two", "/other");
    await vi.advanceTimersByTimeAsync(4000);
    expect(h.serviceRequest).toHaveBeenCalledTimes(2);
    intersection.set(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.serviceRequest).toHaveBeenCalledTimes(4);
    expect(h.states.at(-1)?.overview?.sessionID).toBe("two");
    expect(h.states.at(-1)?.speed?.sessionID).toBe("two");
    h.controller.dispose();
    expect(intersection.disconnect).toHaveBeenCalledOnce();
  });

  test("loads intersecting Resources despite isVisible false without duplicate refreshes", async () => {
    const intersection = browserIntersection(false, false);
    // Reproduce a browser with IOv2 support, not just the legacy fallback path.
    Object.defineProperty(IntersectionObserver.prototype, "trackVisibility", { value: false });
    const h = harness(undefined, "status", true);
    await vi.advanceTimersByTimeAsync(4000);
    expect(h.serviceRequest).not.toHaveBeenCalled();
    intersection.set(true);
    intersection.set(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.serviceRequest.mock.calls.map(([request]) => request.path)).toEqual(["/speed-window"]);
    expect(h.states.at(-1)?.speed?.sessionID).toBe("one");
    h.controller.dispose();
  });

  test("uses the latest queued intersection without starting reads for an offscreen frame", async () => {
    const intersection = browserIntersection(false, false);
    const h = harness(undefined, "panel", true);
    intersection.deliver([true, false]);
    await vi.advanceTimersByTimeAsync(4000);
    expect(h.serviceRequest).not.toHaveBeenCalled();
    intersection.deliver([false, true]);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.serviceRequest).toHaveBeenCalledTimes(2);
    h.controller.dispose();
  });

  test("coalesces speed refresh callbacks and discards speed completed after leaving the viewport", async () => {
    const intersection = browserIntersection();
    let finish = () => {};
    const h = harness((request) => {
      const result = json(response(request));
      if (request.path !== "/speed-window") return Promise.resolve(result);
      return new Promise((resolve) => {
        finish = () => resolve(result);
      });
    });
    h.select();
    await vi.advanceTimersByTimeAsync(0);
    h.controller.requestSpeed();
    h.controller.requestSpeed();
    intersection.set(false);
    finish();
    await vi.advanceTimersByTimeAsync(4000);
    expect(h.serviceRequest).toHaveBeenCalledTimes(2);
    expect(h.states.at(-1)?.speed).toBeUndefined();
    intersection.set(true);
    await vi.advanceTimersByTimeAsync(0);
    h.controller.requestSpeed();
    finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.serviceRequest).toHaveBeenCalledTimes(4);
    expect(h.states.at(-1)?.speed?.sessionID).toBe("one");
    h.controller.dispose();
  });
});
