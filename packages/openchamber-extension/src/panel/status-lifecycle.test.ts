import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { afterEach, beforeAll, describe, expect, test } from "vitest";
import type { GuestMessage, GuestRequest, HostReadyContext, JsonValue } from "@openchamber/sdk";
import { buildOverview, buildSpeedWindow } from "@opencode-insight/telemetry/queries";
import type { SessionInsight } from "@opencode-insight/telemetry/schema";

const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (html: string, options: object) => { window: Window & typeof globalThis };
};
const html = readFileSync(new URL("../../panel/index.html", import.meta.url), "utf8").replace(
  /<script\b[^>]*>[\s\S]*?<\/script>/g,
  "",
);
let bundle: string;
const frames: Array<{ close(): void }> = [];
const turns = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
const speed = (
  scope = "source-one",
  revision = 1,
  sessionID = "ses_one",
  directory = "/local",
) => ({
  ...buildSpeedWindow(
    {
      version: 1,
      sessionID,
      directory,
      revision,
      updatedAt: 10000,
      interruptedCapture: false,
      tools: [],
      requests: [
        {
          id: "request",
          model: "model",
          startedAt: 0,
          streamedAt: 10000,
          endedAt: 10000,
          status: "completed",
          reasoningMode: "hidden",
          capture: "partial",
          context: [],
          buckets: [],
          usage: { input: 100, output: revision * 20, reasoning: 80, cacheRead: 0, cacheWrite: 0 },
        },
      ],
    } satisfies SessionInsight,
    undefined,
    30000,
  ),
  scope,
  measuredAt: 30000,
});

function mount(
  store = new Map<string, JsonValue>(),
  scope = "source-one",
  sessionID = "ses_one",
  directory = "/local",
  surface: "status" | "panel" = "status",
) {
  const { window: w } = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
  const requests: Array<{ id: string; request: GuestRequest }> = [];
  const heights: number[] = [];
  const cacheReads: Array<() => void> = [];
  let delayCache = false;
  let visible: IntersectionObserverCallback = () => {};
  let resize: ResizeObserverCallback = () => {};
  let nextFrame = 0;
  const animation = new Map<number, FrameRequestCallback>();
  const send = (message: object) =>
    w.dispatchEvent(
      new w.MessageEvent("message", {
        source: parent as unknown as Window,
        data: { channel: "openchamber.sdk", v: 1, ...message },
      }),
    );
  const result = (id: string, payload?: object) => send({ type: "result", id, ok: true, payload });
  const parent = {
    postMessage(message: GuestMessage) {
      if (message.type === "service-request")
        requests.push({ id: message.id, request: message.payload });
      else if (message.type === "resize") {
        heights.push(message.payload.height);
        queueMicrotask(() => result(message.id));
      } else if (message.type === "storage") {
        const input = message.payload;
        const stored = input.op === "get" ? structuredClone(store.get(input.key)) : undefined;
        const reply = () => {
          if (input.op === "get")
            result(message.id, {
              storage: true,
              op: "get",
              found: stored !== undefined,
              value: stored,
            });
          else if (input.op === "set") {
            store.set(input.key, structuredClone(input.value));
            result(message.id, { storage: true, op: "set" });
          }
        };
        if (input.op === "get" && delayCache) cacheReads.push(reply);
        else queueMicrotask(reply);
      }
    },
  };
  Object.defineProperty(w, "parent", { value: parent });
  // jsdom has no native popover API; these tests do not open the detail popovers.
  w.HTMLElement.prototype.hidePopover = () => {};
  w.TextEncoder = TextEncoder;
  w.Date.now = () => 30000;
  Object.defineProperty(w.HTMLElement.prototype, "offsetHeight", {
    get() {
      return this.style.minHeight ? Number.parseFloat(this.style.minHeight) : 260;
    },
  });
  w.IntersectionObserver = class {
    constructor(callback: IntersectionObserverCallback) {
      visible = callback;
    }
    observe() {}
    disconnect() {}
    unobserve() {}
    takeRecords() {
      return [];
    }
    root = null;
    rootMargin = "0px";
    scrollMargin = "0px";
    thresholds = [0];
  };
  w.ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) {
      resize = callback;
    }
    observe() {}
    disconnect() {}
    unobserve() {}
  };
  w.requestAnimationFrame = (callback) => {
    animation.set(++nextFrame, callback);
    return nextFrame;
  };
  w.cancelAnimationFrame = (id) => {
    animation.delete(id);
  };
  w.eval(bundle);
  const ready = {
    theme: {
      mode: "light",
      tokens: {
        background: "white",
        foreground: "black",
        font: "system-ui",
        mono: "monospace",
        radius: "6px",
      },
    },
    locale: "en",
    directory,
    session: { id: sessionID, title: sessionID, busy: false },
    surface,
    connection: { connected: false, account: "" },
    settings: {},
    item: null,
  } as HostReadyContext;
  send({ type: "ready", payload: ready });
  const root = w.document.querySelector<HTMLElement>("#app")!;
  const h = {
    w,
    root,
    store,
    requests,
    heights,
    cacheReads,
    delayCache() {
      delayCache = true;
    },
    show(value = true) {
      visible(
        [{ isIntersecting: value, isVisible: false } as unknown as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    },
    flushLayout() {
      const callbacks = [...animation.values()];
      animation.clear();
      callbacks.forEach((callback) => callback(0));
    },
    resize() {
      resize([], {} as ResizeObserver);
    },
    respond(path: string, value: unknown, status = 200) {
      const index = requests.findIndex((entry) => entry.request.path === path);
      expect(index, `pending ${path}`).toBeGreaterThanOrEqual(0);
      const [entry] = requests.splice(index, 1);
      result(entry.id, { status, body: JSON.stringify(value) });
    },
    scope() {
      h.respond("/speed-scope", { sessionID, directory, scope });
    },
    select(id: string, dir = directory) {
      send({ type: "directory", payload: { directory: dir } });
      send({ type: "session", payload: { session: { id, title: id, busy: false } } });
    },
    dispose() {
      w.dispatchEvent(new w.Event("pagehide"));
    },
    close() {
      h.dispose();
      w.close();
    },
  };
  frames.push(h);
  return h;
}

async function captured() {
  const a = mount();
  a.show();
  await turns();
  a.scope();
  a.respond("/speed-window", speed());
  await turns();
  a.flushLayout();
  await turns();
  expect(a.store.size).toBe(1);
  a.close();
  return a.store;
}

describe("Resources Speed document lifecycle", () => {
  beforeAll(async () => {
    bundle = (
      await build({
        entryPoints: [new URL("main.ts", import.meta.url).pathname],
        bundle: true,
        write: false,
        format: "iife",
        platform: "browser",
        logLevel: "silent",
      })
    ).outputFiles[0].text;
  });
  afterEach(() => {
    frames.splice(0).forEach((frame) => frame.close());
  });

  test.each(["status", "panel"] as const)(
    "%s entry waits for an observed chunk, labels its estimate and calibrates the same request",
    async (surface) => {
      const b = mount(undefined, undefined, undefined, undefined, surface);
      const raw: SessionInsight = {
        version: 1,
        sessionID: "ses_one",
        directory: "/local",
        revision: 1,
        updatedAt: 30000,
        interruptedCapture: false,
        tools: [],
        requests: [
          {
            id: "live",
            model: "model",
            startedAt: 0,
            status: "running",
            capture: "live",
            reasoningMode: "visible",
            context: [],
            buckets: [],
          },
        ],
      };
      const publish = async () => {
        b.show();
        await turns();
        if (surface === "panel") {
          b.respond("/overview", buildOverview(raw, 30000));
          await turns();
        } else b.scope();
        b.respond("/speed-window", {
          ...buildSpeedWindow(raw, undefined, 30000),
          scope: "source-one",
        });
        await turns();
      };
      const readout = () =>
        b.root.querySelector(
          surface === "status"
            ? ".speed-summary strong"
            : ".top-metrics .metric:nth-child(3) strong",
        )!.textContent;
      await publish();
      expect(readout()).toBe("Unavailable");
      expect(b.root.querySelector("path.speed")!.getAttribute("d")).toBe("");
      b.show(false);
      raw.revision++;
      raw.requests[0].firstDeltaAt = 5000;
      raw.requests[0].buckets = [{ at: 5000, output: 0, reasoning: 120, summary: 900 }];
      await publish();
      expect(readout()).toBe("≈4 tokens/s");
      const svg = b.root.querySelector("svg")!;
      svg.dispatchEvent(new b.w.KeyboardEvent("keydown", { key: "Home" }));
      expect(b.root.querySelector(".tooltip strong")?.textContent).toBe("≈4 tokens/s");
      b.show(false);
      raw.revision++;
      Object.assign(raw.requests[0], {
        status: "completed",
        streamedAt: 30000,
        endedAt: 30000,
        usage: { input: 100, output: 20, reasoning: 880, cacheRead: 0, cacheWrite: 0 },
      });
      await publish();
      expect(readout()).toBe("30 tokens/s");
      expect(b.root.querySelector(".tooltip strong")?.textContent).toBe("30 tokens/s");
      expect(b.root.querySelectorAll(".speed-points circle")).toHaveLength(1);
    },
  );

  test.each(["scope", "cache"])(
    "restores a captured chart after a first frame waiting for %s without height churn",
    async (delayed) => {
      const a = mount();
      a.flushLayout();
      expect(a.heights).toEqual([]);
      expect(a.requests).toHaveLength(0);
      a.show();
      await turns();
      a.scope();
      a.respond("/speed-window", speed());
      await turns();
      a.flushLayout();
      await turns();
      expect(a.root.querySelector(".speed-summary strong")?.textContent).toBe("10 tokens/s");
      expect(a.store.size).toBe(1);
      expect(a.heights).toEqual([260]);
      a.close();
      const b = mount(a.store);
      if (delayed === "cache") b.delayCache();
      b.show();
      await turns();
      if (delayed === "cache") b.scope();
      await turns();
      b.flushLayout();
      expect(b.heights).toEqual([]);
      expect(b.root.querySelector<HTMLElement>("section")?.hidden).toBe(true);
      if (delayed === "scope") b.scope();
      else b.cacheReads.splice(0).forEach((reply) => reply());
      await turns();
      b.flushLayout();
      expect(b.requests.map((entry) => entry.request.path)).toEqual(["/speed-window"]);
      expect(b.root.querySelector<HTMLElement>("section")?.hidden).toBe(false);
      expect(b.root.querySelector(".speed-summary strong")?.textContent).toBe("10 tokens/s");
      expect(b.heights).toEqual([260]);
      expect(b.root.querySelector(".speed-summary strong")?.hasAttribute("title")).toBe(true);
      b.resize();
      b.resize();
      b.flushLayout();
      expect(b.heights).toEqual([260]);
      b.respond("/speed-window", { error: "Offline" }, 503);
      await turns();
      b.flushLayout();
      expect(b.root.querySelector<HTMLElement>("section")?.hidden).toBe(false);
      expect(b.root.querySelector<HTMLButtonElement>("button")?.closest("[hidden]")).toBeNull();
      b.show(false);
      b.root.querySelector<HTMLButtonElement>("button")!.click();
      await turns();
      expect(b.requests).toHaveLength(0);
    },
  );

  test("ignores a slow cache after fresh telemetry and retains chart interaction", async () => {
    const b = mount(await captured());
    b.delayCache();
    b.show();
    await turns();
    b.scope();
    b.respond("/speed-window", speed("source-one", 2));
    await turns();
    b.flushLayout();
    expect(b.root.querySelector(".speed-summary strong")?.textContent).toBe("12 tokens/s");
    b.cacheReads.splice(0).forEach((reply) => reply());
    await turns();
    b.flushLayout();
    expect(b.root.querySelector(".speed-summary strong")?.textContent).toBe("12 tokens/s");
    expect(b.root.querySelector(".speed-summary strong")?.hasAttribute("title")).toBe(false);
    b.root.querySelector("svg")!.dispatchEvent(new b.w.KeyboardEvent("keydown", { key: "Home" }));
    expect(b.root.querySelector("section")?.dataset.inspectedRequest).toBe("request");
  });

  test("retains a verified idle projection when reopening after a long pause", async () => {
    const b = mount(await captured());
    b.w.Date.now = () => 1000000;
    b.show();
    await turns();
    b.scope();
    await turns();
    expect(b.root.querySelector(".speed-summary strong")?.textContent).toBe("10 tokens/s");
    expect(b.root.querySelectorAll(".speed-points circle")).toHaveLength(1);
    expect(b.root.querySelector<HTMLElement>(".chart")!.hidden).toBe(false);
    b.show(false);
    b.w.Date.now = () => 2000000;
    await turns();
    expect(b.requests.map((entry) => entry.request.path)).toEqual(["/speed-window"]);
  });

  test.each([1000000, 1000])(
    "ages the server viewport by local elapsed time despite a receipt clock of %s",
    async (receivedAt) => {
      const b = mount();
      b.w.Date.now = () => receivedAt;
      b.show();
      await turns();
      b.scope();
      const active = speed();
      active.generation!.active = true;
      b.respond("/speed-window", active);
      await turns();
      expect(b.root.querySelector(".speed-summary strong")?.textContent).toBe("10 tokens/s");
      const path = b.root.querySelector("path.speed")?.getAttribute("d");
      b.show(false);
      b.w.Date.now = () => receivedAt + 1000;
      b.show();
      expect(b.root.querySelectorAll(".speed-points circle")).toHaveLength(1);
      expect(b.root.querySelector("path.speed")?.getAttribute("d")).not.toBe(path);
      b.show(false);
      b.w.Date.now = () => receivedAt + 900000;
      b.show();
      expect(b.root.querySelector(".speed-summary strong")?.textContent).toBe("Unavailable");
      expect(b.root.querySelectorAll(".speed-points circle")).toHaveLength(0);
      b.show(false);
    },
  );

  test.each([
    ["source-two", "ses_one", "/local"],
    ["source-one", "ses_two", "/local"],
  ])(
    "does not disclose cached speed to scope %s, session %s, directory %s",
    async (scope, sessionID, directory) => {
      const b = mount(await captured(), scope, sessionID, directory);
      b.show();
      await turns();
      b.scope();
      await turns();
      b.flushLayout();
      expect(b.root.querySelector<HTMLElement>("section")?.hidden).toBe(true);
      b.respond("/speed-window", speed(scope, 2, sessionID, directory));
      await turns();
      b.flushLayout();
      expect(b.root.querySelector(".speed-summary strong")?.textContent).toBe("12 tokens/s");
      await turns();
      expect(b.store.size).toBe(1);
      const record = [...b.store.values()][0] as { speed: Record<string, unknown> };
      expect(record.speed.sessionID).toBe(sessionID);
      expect(record.speed).not.toHaveProperty("buckets");
      expect(record.speed).not.toHaveProperty("nextAt");
      expect(record.speed.measuredAt).toBe(30000);
    },
  );

  test("drops an old target's pending cache and network responses before reading the selected target", async () => {
    const b = mount(await captured());
    b.delayCache();
    b.show();
    await turns();
    b.scope();
    b.select("ses_two", "/other");
    await turns();
    b.cacheReads.splice(0).forEach((reply) => reply());
    b.respond("/speed-window", speed());
    await turns();
    expect(b.root.querySelector<HTMLElement>("section")?.hidden).toBe(true);
    b.respond("/speed-scope", { scope: "source-one", sessionID: "ses_two", directory: "/other" });
    b.respond("/speed-window", speed("source-one", 2, "ses_two", "/other"));
    await turns();
    b.flushLayout();
    expect(b.root.querySelector(".speed-summary strong")?.textContent).toBe("12 tokens/s");
  });

  test("clears a previous source on visible revalidation even when the new telemetry fails", async () => {
    const b = mount();
    b.show();
    await turns();
    b.scope();
    b.respond("/speed-window", speed());
    await turns();
    b.flushLayout();
    await turns();
    b.delayCache();
    b.show(false);
    b.show();
    await turns();
    b.respond("/speed-scope", { sessionID: "ses_one", directory: "/local", scope: "source-two" });
    await turns();
    expect(b.root.querySelector<HTMLElement>("section")?.hidden).toBe(true);
    b.respond("/speed-window", { error: "Offline" }, 503);
    await turns();
    b.cacheReads.splice(0).forEach((reply) => reply());
    await turns();
    expect(b.root.querySelector<HTMLElement>("section")?.hidden).toBe(true);
    expect(b.root.querySelector(".speed-summary strong")?.textContent).not.toBe("10 tokens/s");
  });

  test("waits for live data rather than restoring when source verification is unavailable", async () => {
    const b = mount(await captured());
    b.show();
    await turns();
    b.respond("/speed-scope", { error: "Unsupported" }, 404);
    await turns();
    expect(b.root.querySelector<HTMLElement>("section")?.hidden).toBe(true);
    b.respond("/speed-window", speed("source-one", 2));
    await turns();
    expect(b.root.querySelector(".speed-summary strong")?.textContent).toBe("12 tokens/s");
  });

  test("rejects a telemetry response from a different source than the concurrent scope probe", async () => {
    const b = mount();
    b.show();
    await turns();
    b.respond("/speed-scope", { sessionID: "ses_one", directory: "/local", scope: "source-two" });
    await turns();
    b.respond("/speed-window", speed("source-one"));
    await turns();
    b.flushLayout();
    expect(b.root.querySelector<HTMLElement>("section")?.hidden).toBe(true);
    expect(b.store.size).toBe(0);
    b.show(false);
    b.show();
    await turns();
    b.respond("/speed-scope", { sessionID: "ses_one", directory: "/local", scope: "source-two" });
    b.respond("/speed-window", speed("source-two", 2));
    await turns();
    expect(b.root.querySelector(".speed-summary strong")?.textContent).toBe("12 tokens/s");
  });

  test.each(["hidden", "disposed"])(
    "drops late restoration and fresh responses when %s",
    async (mode) => {
      const store = await captured();
      const before = JSON.stringify([...store]);
      const b = mount(store);
      b.delayCache();
      b.show();
      await turns();
      b.scope();
      if (mode === "hidden") b.show(false);
      else b.dispose();
      b.cacheReads.splice(0).forEach((reply) => reply());
      b.respond("/speed-window", speed("source-one", 2));
      await turns();
      b.flushLayout();
      expect(b.root.querySelector(".speed-summary strong")?.textContent).not.toBe("12 tokens/s");
      expect(b.root.querySelector<HTMLElement>("section")?.hidden).not.toBe(false);
      expect(b.requests).toHaveLength(0);
      expect(JSON.stringify([...store])).toBe(before);
    },
  );

  test("keeps telemetry usable when a speed projection exceeds the storage budget", async () => {
    const b = mount();
    b.show();
    await turns();
    b.scope();
    const large = speed();
    large.generation!.stages[0].model = "m".repeat(65 * 1024);
    b.respond("/speed-window", large);
    await turns();
    b.flushLayout();
    await turns();
    expect(b.root.querySelector(".speed-summary strong")?.textContent).toBe("10 tokens/s");
    expect(b.store.size).toBe(0);
  });
});
