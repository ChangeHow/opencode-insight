// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";
import type { SessionInsight } from "@opencode-insight/telemetry/schema";
import { createPanelView, sourceGroups } from "./view";

const session: SessionInsight = {
  version: 1,
  sessionID: "one",
  directory: "/local",
  updatedAt: 1,
  revision: 1,
  interruptedCapture: true,
  requests: [
    {
      id: "request",
      model: "model",
      startedAt: 0,
      streamedAt: 2000,
      endedAt: 2000,
      status: "completed",
      reasoningMode: "hidden",
      capture: "partial",
      buckets: [],
      usage: { input: 100, cacheRead: 20, cacheWrite: 5, output: 30, reasoning: 10 },
      context: [
        { kind: "skill", id: "skill-123", label: "Skill", tokens: 40, quality: "estimated" },
      ],
    },
  ],
  tools: [
    {
      id: "child-tool",
      name: "task",
      startedAt: 500,
      endedAt: 2500,
      background: true,
      status: "completed",
    },
  ],
};

describe("panel view", () => {
  test("distinguishes no selection, loading, empty, unavailable and safe service errors", () => {
    const root = document.createElement("main");
    const retry = vi.fn();
    const view = createPanelView(root, retry);
    view.render({ sessionID: null, directory: null, loading: false });
    expect(root.textContent).toContain("Select an active OpenCode session");
    view.render({ sessionID: "one", directory: "/local", loading: true });
    expect(root.textContent).toContain("Loading local session");
    view.render({
      sessionID: "one",
      directory: "/local",
      loading: false,
      error: "<script>offline</script>",
    });
    expect(root.textContent).toContain("Telemetry unavailable");
    expect(root.querySelector("script")).toBeNull();
    root.querySelector<HTMLButtonElement>("#retry")!.click();
    expect(retry).toHaveBeenCalledOnce();
    view.render({
      sessionID: "one",
      directory: "/local",
      loading: false,
      session: { ...session, requests: [], tools: [] },
    });
    expect(root.textContent).toContain("No telemetry captured");
    expect(root.querySelector("table")).toBeNull();
  });

  test("renders compact normalized totals and all tabs without request tables", () => {
    const root = document.createElement("main");
    const view = createPanelView(root, () => {});
    view.render({
      sessionID: "one",
      directory: "/local",
      loading: false,
      session,
      error: "Offline",
    });
    expect(root.textContent).toContain("Previous captured data is retained");
    expect(root.textContent).toContain("Partial capture");
    const metrics = [...root.querySelectorAll(".top-metrics strong")].map(
      (metric) => metric.textContent,
    );
    expect(metrics[0]).toBe("40");
    expect(metrics[1]).toBe("165");
    root.querySelector<HTMLButtonElement>('[data-tab="token"]')!.click();
    expect(root.textContent).toContain("Unclassified Skill");
    expect(root.textContent).toContain("skill-123");
    expect(root.textContent).toContain("Output and reasoning are separate");
    const select = root.querySelector<HTMLSelectElement>("select")!;
    select.value = "cumulative";
    select.dispatchEvent(new Event("change"));
    expect(root.textContent).toContain("including repeated context");
    root.querySelector<HTMLButtonElement>('[data-tab="time"]')!.click();
    expect(root.textContent).toContain("Background tool · task");
    expect(root.textContent).toContain("Parallel lanes are not additive");
    expect(root.textContent).toContain("child-session usage is not merged");
    expect(root.querySelector("table")).toBeNull();
  });

  test("groups input sources without counting output as input", () => {
    expect(sourceGroups(session.requests[0].context)).toEqual([
      { kind: "skill", tokens: 40, items: session.requests[0].context },
    ]);
  });

  test("keeps inspected time and source drill-down open across polling renders", () => {
    const root = document.createElement("main");
    document.body.append(root);
    const view = createPanelView(root, () => {});
    const state = {
      sessionID: "one",
      directory: "/local",
      loading: false,
      session,
      series: {
        revision: 1,
        unchanged: false,
        points: [0, 1000].map((at) => ({
          at,
          requestID: "request",
          model: "model",
          outputTps: 10,
          reasoningTps: 0,
          summaryTps: 0,
          quality: "partial" as const,
        })),
      },
    };
    view.render(state);
    const slider = root.querySelector<HTMLInputElement>("input")!;
    slider.value = "0";
    slider.dispatchEvent(new Event("input"));
    view.render(state);
    expect(root.querySelector<HTMLElement>(".tooltip")!.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>("#speed-chart")!.dataset.inspectedAt).toBe("0");
    root.querySelector<HTMLButtonElement>('[data-tab="token"]')!.click();
    root.querySelector<HTMLDetailsElement>("details")!.open = true;
    view.render(state);
    expect(root.querySelector<HTMLDetailsElement>("details")!.open).toBe(true);
    root.remove();
  });

  test("does not turn interrupted activity without an end into ongoing elapsed time", () => {
    const root = document.createElement("main");
    const view = createPanelView(root, () => {});
    view.render({
      sessionID: "one",
      directory: "/local",
      loading: false,
      session: {
        ...session,
        requests: [],
        tools: [
          {
            id: "interrupted",
            name: "shell",
            startedAt: 0,
            status: "interrupted",
            background: false,
          },
        ],
      },
    });
    root.querySelector<HTMLButtonElement>('[data-tab="time"]')!.click();
    expect(root.textContent).toContain("Duration unavailable");
    expect(root.querySelector(".lane-track")).toBeNull();
  });
});
