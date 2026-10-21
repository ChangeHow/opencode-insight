// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";
import type { SessionInsight } from "@opencode-insight/telemetry/schema";
import { createPanelView } from "./view";

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
    expect(root.querySelector(".donut")).not.toBeNull();
    expect(root.querySelector(".donut strong")?.textContent).toBe("40");
    expect(root.querySelector("details")?.open).toBe(false);
    expect(root.querySelector(".composition-legend")?.textContent).toContain("100%");
    expect(root.querySelector(".composition-legend")?.textContent).toContain(
      "Estimated attribution",
    );
    expect(root.querySelector("h2[title]")?.getAttribute("title")).toContain(
      "Output and reasoning are separate",
    );
    const select = root.querySelector<HTMLSelectElement>("select")!;
    select.value = "cumulative";
    select.dispatchEvent(new Event("change"));
    expect(root.querySelector("select")?.getAttribute("title")).toContain(
      "including repeated context",
    );
    root.querySelector<HTMLButtonElement>('[data-tab="time"]')!.click();
    expect(root.textContent).toContain("Background 2 s");
    expect(root.querySelector(".phase-stack")).not.toBeNull();
    expect(root.querySelectorAll(".phase-segment")).toHaveLength(1);
    expect(root.querySelector(".timeline")).toBeNull();
    expect(root.querySelector(".timing-meta [title]")?.getAttribute("title")).toContain(
      "Child-session usage is not merged",
    );
    expect(root.querySelector("table")).toBeNull();
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
    root.querySelector("svg")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
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
    expect(root.querySelector(".phase-stack")).toBeNull();
    expect(root.textContent).toContain("No measured foreground intervals");
  });

  test("keeps reported Code Mode calls in optional details without invented child timing", () => {
    const root = document.createElement("main");
    const view = createPanelView(root, () => {});
    view.render({
      sessionID: "one",
      directory: "/local",
      loading: false,
      session: {
        ...session,
        tools: [
          {
            ...session.tools[0],
            name: "execute",
            reportedCalls: Array.from({ length: 3 }, () => ({
              name: "files.read_text_file",
              status: "completed" as const,
            })),
          },
        ],
      },
    });
    root.querySelector<HTMLButtonElement>('[data-tab="time"]')!.click();
    expect(root.textContent).toContain("files.read_text_file ×3 · completed");
    expect(root.textContent).toContain("Per-call timing unavailable");
    expect(root.querySelector<HTMLDetailsElement>('[data-source="reported-calls"]')?.open).toBe(
      false,
    );
    expect(root.querySelectorAll(".lane-track")).toHaveLength(0);
  });

  test("phase descriptions support hover, keyboard focus, tap and escape", () => {
    const root = document.createElement("main");
    const view = createPanelView(root, () => {});
    view.render({ sessionID: "one", directory: "/local", loading: false, session });
    root.querySelector<HTMLButtonElement>('[data-tab="time"]')!.click();
    const segment = root.querySelector<HTMLButtonElement>(".phase-segment")!;
    const tip = root.querySelector<HTMLElement>(`#${segment.getAttribute("aria-describedby")}`)!;
    expect(tip.hidden).toBe(true);
    segment.dispatchEvent(new Event("pointerenter"));
    expect(tip.hidden).toBe(false);
    segment.dispatchEvent(new Event("pointerleave"));
    expect(tip.hidden).toBe(true);
    segment.dispatchEvent(new Event("focus"));
    expect(tip.hidden).toBe(false);
    segment.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(tip.hidden).toBe(true);
    segment.click();
    expect(tip.hidden).toBe(false);
  });

  test("keeps keyboard phase inspection focused across polling renders", () => {
    const root = document.createElement("main");
    document.body.append(root);
    const view = createPanelView(root, () => {});
    const state = { sessionID: "one", directory: "/local", loading: false, session };
    view.render(state);
    root.querySelector<HTMLButtonElement>('[data-tab="time"]')!.click();
    root.querySelector<HTMLButtonElement>(".phase-segment")!.focus();
    view.render({
      ...state,
      session: {
        ...session,
        requests: [{ ...session.requests[0], streamedAt: 3000, endedAt: 3000 }],
      },
    });
    expect(document.activeElement?.classList.contains("phase-segment")).toBe(true);
    expect(root.querySelector<HTMLElement>(".phase-tip")?.hidden).toBe(false);
    root.remove();
  });
});
