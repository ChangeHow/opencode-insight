// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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

const mounted: Array<{ root: HTMLElement; view: ReturnType<typeof createPanelView> }> = [];
const scrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");

function mount(retry = () => {}) {
  const root = document.createElement("main");
  document.body.append(root);
  const view = createPanelView(root, retry);
  mounted.push({ root, view });
  return { root, view };
}

function selectScope(root: HTMLElement, label: string) {
  root.querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]')!.click();
  const option = [...root.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
    (node) => node.textContent === label,
  );
  expect(option).toBeDefined();
  option!.click();
}

describe("panel view", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });
  afterEach(() => {
    for (const { root, view } of mounted.splice(0)) {
      view.dispose();
      root.remove();
    }
    if (scrollIntoView)
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scrollIntoView);
    else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    vi.restoreAllMocks();
  });
  test("distinguishes no selection, loading, empty, unavailable and safe service errors", () => {
    const retry = vi.fn();
    const { root, view } = mount(retry);
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
    expect(root.textContent).toContain("<script>offline</script>");
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
    const { root, view } = mount();
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
    root.querySelector<HTMLButtonElement>('[role="tab"][data-id="token"]')!.click();
    expect(root.textContent).toContain("Unclassified Skill");
    expect(root.textContent).toContain("skill-123");
    expect(root.querySelector(".donut")).not.toBeNull();
    expect(root.querySelector(".donut strong")?.textContent).toBe("40");
    expect(root.querySelector("details")?.open).toBe(false);
    expect(root.querySelector(".composition-legend")?.textContent).toContain("100%");
    expect(root.querySelector(".quality-slot")?.textContent).toContain("Estimated attribution");
    expect(root.querySelector("h2[title]")?.getAttribute("title")).toContain(
      "Output and reasoning are separate",
    );
    selectScope(root, "Cumulative inputs");
    expect(root.querySelector(".scope-slot")?.getAttribute("title")).toContain(
      "including repeated context",
    );
    root.querySelector<HTMLButtonElement>('[role="tab"][data-id="time"]')!.click();
    expect(root.textContent).toContain("Background 2 s");
    expect(root.querySelector(".phase-stack")).not.toBeNull();
    expect(root.querySelectorAll(".phase-segment:not([hidden])")).toHaveLength(1);
    expect(root.querySelector(".timeline")).toBeNull();
    expect(root.querySelector(".timing-meta [title]")?.getAttribute("title")).toContain(
      "Child-session usage is not merged",
    );
    expect(root.querySelector("table")).toBeNull();
  });

  test("keeps inspected time and source drill-down open across polling renders", () => {
    const { root, view } = mount();
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
    const svg = root.querySelector<SVGSVGElement>("#insight-speed svg")!;
    svg.focus();
    svg.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
    view.render({ ...state, series: { ...state.series, revision: 2 } });
    expect(root.querySelector("#insight-speed svg")).toBe(svg);
    expect(document.activeElement).toBe(svg);
    expect(root.querySelector<HTMLElement>(".tooltip")!.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>("#insight-speed")!.dataset.inspectedAt).toBe("0");
    root.querySelector<HTMLButtonElement>('[role="tab"][data-id="token"]')!.click();
    const details = root.querySelector<HTMLDetailsElement>('[data-source="attribution"]')!;
    const row = details.querySelector("li")!;
    const summary = details.querySelector("summary")!;
    details.open = true;
    summary.focus();
    view.render({
      ...state,
      session: {
        ...session,
        revision: 2,
        requests: [
          { ...session.requests[0], context: [{ ...session.requests[0].context[0], tokens: 60 }] },
        ],
      },
    });
    expect(root.querySelector('[data-source="attribution"]')).toBe(details);
    expect(details.open).toBe(true);
    expect(details.querySelector("li")).toBe(row);
    expect(row.textContent).toContain("60 · estimated");
    expect(document.activeElement).toBe(summary);
  });

  test("does not turn interrupted activity without an end into ongoing elapsed time", () => {
    const { root, view } = mount();
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
    root.querySelector<HTMLButtonElement>('[role="tab"][data-id="time"]')!.click();
    expect(root.textContent).toContain("Duration unavailable");
    expect(root.querySelector(".lane-track")).toBeNull();
    expect(root.querySelector<HTMLElement>(".phase-stack")?.hidden).toBe(true);
    expect(root.querySelectorAll(".phase-segment:not([hidden])")).toHaveLength(0);
    expect(root.textContent).toContain("No measured foreground intervals");
  });

  test("keeps reported Code Mode calls in optional details without invented child timing", () => {
    const { root, view } = mount();
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
    root.querySelector<HTMLButtonElement>('[role="tab"][data-id="time"]')!.click();
    expect(root.textContent).toContain("files.read_text_file ×3 · completed");
    expect(root.textContent).toContain("Per-call timing unavailable");
    expect(root.querySelector<HTMLDetailsElement>('[data-source="reported-calls"]')?.open).toBe(
      false,
    );
    expect(root.querySelectorAll(".lane-track")).toHaveLength(0);
  });

  test("phase descriptions support hover, keyboard focus, tap and escape", () => {
    const { root, view } = mount();
    view.render({ sessionID: "one", directory: "/local", loading: false, session });
    root.querySelector<HTMLButtonElement>('[role="tab"][data-id="time"]')!.click();
    const segment = root.querySelector<HTMLButtonElement>(".phase-segment:not([hidden])")!;
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
    const { root, view } = mount();
    const state = { sessionID: "one", directory: "/local", loading: false, session };
    view.render(state);
    root.querySelector<HTMLButtonElement>('[role="tab"][data-id="time"]')!.click();
    const segment = root.querySelector<HTMLButtonElement>(".phase-segment:not([hidden])")!;
    segment.focus();
    view.render({
      ...state,
      session: {
        ...session,
        requests: [{ ...session.requests[0], streamedAt: 3000, endedAt: 3000 }],
      },
    });
    expect(root.querySelector(".phase-segment:not([hidden])")).toBe(segment);
    expect(document.activeElement).toBe(segment);
    expect(segment.getAttribute("aria-label")).toContain("3 s");
    expect(root.querySelector<HTMLElement>(".phase-tip:not([hidden])")).not.toBeNull();
  });

  test("keeps the SDK scope popup and keyboard selection intact across polling", () => {
    const { root, view } = mount();
    const state = { sessionID: "one", directory: "/local", loading: false, session };
    view.render(state);
    root.querySelector<HTMLButtonElement>('[role="tab"][data-id="token"]')!.click();
    const tab = root.querySelector<HTMLButtonElement>('[role="tab"][data-id="token"]')!;
    const trigger = root.querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]')!;
    trigger.click();
    const popup = root.querySelector<HTMLElement>('[role="listbox"]')!;
    popup.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    const active = popup.getAttribute("aria-activedescendant");
    const option = popup.querySelector('[data-active="true"]');
    expect(option?.textContent).toBe("Cumulative inputs");
    view.render({ ...state, session: { ...session, revision: 2 } });
    expect(root.querySelector('[role="tab"][data-id="token"]')).toBe(tab);
    expect(root.querySelector('[aria-haspopup="listbox"]')).toBe(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(root.querySelector('[role="listbox"]')).toBe(popup);
    expect(document.activeElement).toBe(popup);
    expect(popup.getAttribute("aria-activedescendant")).toBe(active);
    expect(popup.querySelector('[data-active="true"]')).toBe(option);
    popup.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(trigger.textContent).toBe("Cumulative inputs");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(root.querySelector('[role="listbox"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  test("retains cumulative scope across tabs and polling but resets for a new session", () => {
    const { root, view } = mount();
    const captured = {
      ...session,
      requests: [
        session.requests[0],
        {
          ...session.requests[0],
          id: "second",
          startedAt: 3000,
          endedAt: 4000,
          context: [{ ...session.requests[0].context[0], tokens: 60 }],
        },
      ],
    };
    const state = { sessionID: "one", directory: "/local", loading: false, session: captured };
    view.render(state);
    root.querySelector<HTMLButtonElement>('[role="tab"][data-id="token"]')!.click();
    expect(root.querySelector(".donut strong")?.textContent).toBe("60");
    selectScope(root, "Cumulative inputs");
    expect(root.querySelector(".donut strong")?.textContent).toBe("100");
    root.querySelector<HTMLButtonElement>('[role="tab"][data-id="time"]')!.click();
    view.render({ ...state, session: { ...captured, revision: 2 } });
    root.querySelector<HTMLButtonElement>('[role="tab"][data-id="speed"]')!.click();
    root.querySelector<HTMLButtonElement>('[role="tab"][data-id="token"]')!.click();
    expect(root.querySelector('[aria-haspopup="listbox"]')?.textContent).toBe("Cumulative inputs");
    expect(root.querySelector(".donut strong")?.textContent).toBe("100");
    const details = root.querySelector<HTMLDetailsElement>('[data-source="attribution"]')!;
    details.open = true;
    root.querySelector<HTMLButtonElement>('[role="tab"][data-id="speed"]')!.click();
    view.render({ ...state, sessionID: "two", session: { ...captured, sessionID: "two" } });
    root.querySelector<HTMLButtonElement>('[role="tab"][data-id="token"]')!.click();
    expect(root.querySelector('[aria-haspopup="listbox"]')?.textContent).toBe("Current context");
    expect(root.querySelector(".donut strong")?.textContent).toBe("60");
    expect(details.open).toBe(false);
  });

  test("disposal closes SDK popups, removes listeners and ignores later renders", () => {
    const retry = vi.fn();
    const { root, view } = mount(retry);
    const state = { sessionID: "one", directory: "/local", loading: false, session };
    view.render(state);
    const svg = root.querySelector<SVGSVGElement>("#insight-speed svg")!;
    const speed = root.querySelector<HTMLElement>("#insight-speed")!;
    const retryButton = root.querySelector<HTMLButtonElement>("#retry")!;
    root.querySelector<HTMLButtonElement>('[role="tab"][data-id="token"]')!.click();
    const trigger = root.querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]')!;
    trigger.click();
    const popup = root.querySelector('[role="listbox"]')!;
    expect(popup.isConnected).toBe(true);
    view.dispose();
    expect(root.childNodes).toHaveLength(0);
    expect(popup.isConnected).toBe(false);
    retryButton.click();
    trigger.click();
    svg.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
    expect(retry).not.toHaveBeenCalled();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(speed.dataset.inspectedAt).toBeUndefined();
    view.render({ ...state, error: "late update" });
    expect(root.childNodes).toHaveLength(0);
    expect(() => view.dispose()).not.toThrow();
  });
});
