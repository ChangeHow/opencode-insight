// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { GuestRequest, GuestRequestResult, SessionSnapshot } from "@openchamber/sdk";
import { createPanelController, parseResponse, type PanelState } from "./controller";

const session = (id = "one", directory = "/local") => ({
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
function harness(request?: (request: GuestRequest) => Promise<GuestRequestResult>) {
  let onSession: (session: SessionSnapshot | null) => void = () => {};
  let onDirectory: (directory: string | null) => void = () => {};
  const states: PanelState[] = [];
  const serviceRequest = vi.fn(
    request ??
      (async (request: GuestRequest) => {
        const body = JSON.parse(request.body!);
        return json(
          request.path === "/session"
            ? session(body.sessionID, body.directory)
            : { revision: 1, unchanged: false, points: [] },
        );
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

  test("fetches session and series initially, retains data on failure, retries", async () => {
    const h = harness();
    h.select();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.serviceRequest).toHaveBeenCalledTimes(2);
    expect(h.states.at(-1)?.session?.sessionID).toBe("one");
    h.serviceRequest.mockRejectedValue(new Error("Capture offline"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.states.at(-1)?.error).toContain("Capture offline");
    expect(h.states.at(-1)?.session?.sessionID).toBe("one");
    h.serviceRequest.mockImplementation(async (request) =>
      json(request.path === "/session" ? session() : { revision: 1, unchanged: true, points: [] }),
    );
    h.controller.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.states.at(-1)?.error).toBeUndefined();
    expect(h.states.at(-1)?.series?.revision).toBe(1);
    h.controller.dispose();
  });

  test("drops stale session results and never overlaps polling requests", async () => {
    const pending: (() => void)[] = [];
    const h = harness(
      (request) =>
        new Promise((resolve) => {
          const body = JSON.parse(request.body!);
          pending.push(() =>
            resolve(
              json(
                request.path === "/session"
                  ? session(body.sessionID, body.directory)
                  : { revision: 1, unchanged: false, points: [] },
              ),
            ),
          );
        }),
    );
    h.select();
    h.select("two");
    h.controller.retry();
    await vi.advanceTimersByTimeAsync(3000);
    expect(h.serviceRequest).toHaveBeenCalledTimes(2);
    pending.splice(0).forEach((resolve) => resolve());
    await vi.advanceTimersByTimeAsync(0);
    expect(h.serviceRequest).toHaveBeenCalledTimes(4);
    expect(h.states.at(-1)?.session).toBeUndefined();
    pending.splice(0).forEach((resolve) => resolve());
    await vi.advanceTimersByTimeAsync(0);
    expect(h.states.at(-1)?.session?.sessionID).toBe("two");
    h.directory("/other");
    expect(h.states.at(-1)?.session).toBeUndefined();
    h.controller.dispose();
    pending.splice(0).forEach((resolve) => resolve());
    await vi.advanceTimersByTimeAsync(0);
    expect(h.states.at(-1)?.session).toBeUndefined();
  });

  test("pauses hidden panels, drops pending results, resumes and disposes", async () => {
    const h = harness();
    h.select();
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(4000);
    expect(h.states.at(-1)?.session).toBeUndefined();
    expect(h.serviceRequest).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.states.at(-1)?.session?.sessionID).toBe("one");
    h.controller.dispose();
    const count = h.serviceRequest.mock.calls.length;
    await vi.advanceTimersByTimeAsync(4000);
    expect(h.serviceRequest).toHaveBeenCalledTimes(count);
    expect(h.unsubSession).toHaveBeenCalledOnce();
    expect(h.unsubDirectory).toHaveBeenCalledOnce();
  });

  test("rejects a mismatched session location", async () => {
    const h = harness(async (request) =>
      json(
        request.path === "/session"
          ? session("one", "/wrong")
          : { revision: 1, unchanged: false, points: [] },
      ),
    );
    h.select();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.states.at(-1)?.error).toContain("different session location");
    expect(h.states.at(-1)?.session).toBeUndefined();
    h.controller.dispose();
  });

  test("does not replace the chart DOM on unchanged idle polls", async () => {
    const h = harness(async (request) => {
      const body = JSON.parse(request.body!);
      return json(
        request.path === "/session"
          ? session()
          : {
              revision: 1,
              unchanged: body.after === 1,
              points: [],
            },
      );
    });
    h.select();
    await vi.advanceTimersByTimeAsync(0);
    const renders = h.states.length;
    await vi.advanceTimersByTimeAsync(3000);
    expect(h.serviceRequest).toHaveBeenCalledTimes(8);
    expect(h.states).toHaveLength(renders);
    h.controller.dispose();
  });

  test("pauses when the host hides its iframe without a document visibility event", async () => {
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
    await vi.advanceTimersByTimeAsync(0);
    intersection(false);
    await vi.advanceTimersByTimeAsync(4000);
    expect(h.serviceRequest).toHaveBeenCalledTimes(2);
    intersection(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.serviceRequest).toHaveBeenCalledTimes(4);
    h.controller.dispose();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
