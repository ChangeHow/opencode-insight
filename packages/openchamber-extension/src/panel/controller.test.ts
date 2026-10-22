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
        return unsubSession;
      },
      onDirectory(listener) {
        onDirectory = listener;
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
    await vi.advanceTimersByTimeAsync(1000);
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
    await vi.advanceTimersByTimeAsync(1000);
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

  test("pauses hidden panels, drops pending results, resumes and disposes", async () => {
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

  test("does not replace the chart DOM on unchanged idle polls", async () => {
    const h = harness(async (request) => json(response(request)));
    h.select();
    await vi.advanceTimersByTimeAsync(0);
    const renders = h.states.length;
    const initial = h.states.at(-1)!;
    await vi.advanceTimersByTimeAsync(3000);
    expect(h.serviceRequest).toHaveBeenCalledTimes(5);
    expect(
      h.serviceRequest.mock.calls.filter(([request]) => request.path === "/speed-window"),
    ).toHaveLength(1);
    expect(h.states).toHaveLength(renders);
    expect(h.states.at(-1)?.overview).toBe(initial.overview);
    expect(h.states.at(-1)?.speed).toBe(initial.speed);
    h.controller.dispose();
  });

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
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.states.at(-1)?.overview?.revision).toBe(1);
    expect(h.states.at(-1)?.speed?.revision).toBe(1);
    expect(h.states.at(-1)?.error).toContain("Snapshot offline");
    failSnapshot = false;
    await vi.advanceTimersByTimeAsync(1000);
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

  test("loads only after expansion, pauses on collapse and refreshes on reopening", async () => {
    let intersection: (value: boolean) => void = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(listener: IntersectionObserverCallback) {
          intersection = (value) =>
            listener(
              [{ isIntersecting: value } as IntersectionObserverEntry],
              this as unknown as IntersectionObserver,
            );
        }
        observe = vi.fn();
        disconnect = disconnect;
      },
    );
    const h = harness();
    h.select();
    await vi.advanceTimersByTimeAsync(4000);
    h.controller.retry();
    h.controller.requestSpeed();
    await expect(h.controller.loadTools({ group: "bash" })).rejects.toThrow("hidden");
    await vi.advanceTimersByTimeAsync(0);
    expect(h.serviceRequest).not.toHaveBeenCalled();
    intersection(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.serviceRequest).toHaveBeenCalledTimes(2);
    intersection(false);
    h.select("two", "/other");
    await vi.advanceTimersByTimeAsync(4000);
    expect(h.serviceRequest).toHaveBeenCalledTimes(2);
    intersection(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.serviceRequest).toHaveBeenCalledTimes(4);
    expect(h.states.at(-1)?.overview?.sessionID).toBe("two");
    expect(h.states.at(-1)?.speed?.sessionID).toBe("two");
    h.controller.dispose();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
