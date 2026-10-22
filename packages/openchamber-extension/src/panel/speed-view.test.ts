// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { buildSpeedWindow } from "@opencode-insight/telemetry/queries";
import type { SessionInsight } from "@opencode-insight/telemetry/schema";
import { createSpeedView } from "./speed-view";

const session: SessionInsight = {
  version: 1,
  sessionID: "one",
  directory: "/local",
  revision: 1,
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
      usage: { input: 100, output: 20, reasoning: 80, cacheRead: 0, cacheWrite: 0 },
    },
  ],
};
const mounted: ReturnType<typeof createSpeedView>[] = [];
function mount() {
  const root = document.createElement("main");
  document.body.append(root);
  const retry = vi.fn();
  const view = createSpeedView(root, retry, () => {});
  mounted.push(view);
  return { root, view, retry };
}
const state = { sessionID: "one", directory: "/local", loading: false };

describe("speed status section", () => {
  afterEach(() => {
    mounted.splice(0).forEach((view) => view.dispose());
    document.body.replaceChildren();
  });

  test("shows only speed, updates the mean in place and clears inspection on session changes", () => {
    const { root, view } = mount();
    view.render({ ...state, speed: buildSpeedWindow(session, undefined, 30000) });
    const mean = root.querySelector(".speed-summary strong")!;
    const svg = root.querySelector("svg")!;
    expect(mean.textContent).toBe("10 tokens/s");
    expect(root.querySelector(".token-grid, .trace-view, h1")).toBeNull();
    svg.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
    expect(root.querySelector(".tooltip strong")?.textContent).toBe(mean.textContent);
    expect(root.querySelector("section")?.dataset.inspectedRequest).toBe("request");
    const updated = {
      ...session,
      revision: 2,
      requests: [{ ...session.requests[0], usage: { ...session.requests[0].usage!, output: 120 } }],
    };
    view.render({ ...state, speed: buildSpeedWindow(updated, undefined, 30000) });
    expect(root.querySelector("svg")).toBe(svg);
    expect(root.querySelector(".speed-summary strong")).toBe(mean);
    expect(mean.textContent).toBe("20 tokens/s");
    view.render({ ...state, sessionID: "two", loading: true });
    expect(root.querySelector("section")?.dataset.inspectedRequest).toBeUndefined();
    expect(root.querySelector<HTMLElement>(".tooltip")?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>("section")?.hidden).toBe(true);
    expect(root.textContent).toContain("Loading session speed");
  });

  test("offers retry for safe errors, retains captured speed and distinguishes missing measurements", () => {
    const { root, view, retry } = mount();
    view.render({ sessionID: null, directory: null, loading: false });
    expect(root.textContent).toContain("Select an active OpenCode session");
    view.render({ ...state, error: "<script>offline</script>" });
    expect(root.textContent).toContain("<script>offline</script>");
    expect(root.querySelector("script")).toBeNull();
    const button = root.querySelector<HTMLButtonElement>("button")!;
    expect(button.closest("[hidden]")).toBeNull();
    button.click();
    expect(retry).toHaveBeenCalledOnce();
    view.render({
      ...state,
      speed: buildSpeedWindow(session, undefined, 30000),
      error: "Offline",
    });
    expect(root.textContent).toContain("Previous captured data is retained");
    expect(root.querySelector(".speed-summary strong")?.textContent).toBe("10 tokens/s");
    expect(root.querySelector<HTMLElement>("section")?.hidden).toBe(false);
    view.render({
      ...state,
      speed: buildSpeedWindow({ ...session, requests: [] }, undefined, 30000),
    });
    expect(root.querySelector(".speed-summary strong")?.textContent).toBe("Unavailable");
    expect(root.querySelector<HTMLElement>(".chart")?.hidden).toBe(true);
    expect(root.textContent).toContain("no measured model request duration");
  });
});
