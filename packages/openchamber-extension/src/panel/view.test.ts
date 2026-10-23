// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { SessionInsight } from "@opencode-insight/telemetry/schema";
import {
  buildOverview,
  buildSpeedWindow,
  buildToolPage,
} from "@opencode-insight/telemetry/queries";
import type { PanelState } from "./controller";
import { createPanelView } from "./view";
import { stubPopover } from "./popover.test-helper";

stubPopover();

const session: SessionInsight = {
  version: 1,
  sessionID: "one",
  directory: "/local",
  updatedAt: 2500,
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

const mounted: Array<{ root: HTMLElement; view: { dispose(): void } }> = [];
const scrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");

function mount(retry = () => {}) {
  const root = document.createElement("main");
  document.body.append(root);
  let raw = session;
  const panel = createPanelView(
    root,
    retry,
    async (input) => buildToolPage(raw, { ...input, sessionID: raw.sessionID }),
    () => {},
  );
  const view = {
    ...panel,
    async render(state: Omit<PanelState, "overview" | "speed"> & { session?: SessionInsight }) {
      if (state.session) raw = state.session;
      panel.render({
        ...state,
        overview: state.session ? buildOverview(state.session, 30000) : undefined,
        speed: state.session ? buildSpeedWindow(state.session, undefined, 30000) : undefined,
      });
      await Promise.resolve();
      await Promise.resolve();
    },
  };
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
  test("distinguishes no selection, loading, empty, unavailable and safe service errors", async () => {
    const retry = vi.fn();
    const { root, view } = mount(retry);
    await view.render({ sessionID: null, directory: null, loading: false });
    expect(root.textContent).toContain("Select an active OpenCode session");
    await view.render({ sessionID: "one", directory: "/local", loading: true });
    expect(root.textContent).toContain("Loading local session");
    await view.render({
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
    await view.render({
      sessionID: "one",
      directory: "/local",
      loading: false,
      session: { ...session, requests: [], tools: [] },
    });
    expect(root.textContent).toContain("No telemetry captured");
    expect(root.querySelector("#insight-speed .chart")?.closest("[hidden]")).toBeNull();
    expect(root.querySelectorAll("#insight-speed .speed-points circle")).toHaveLength(0);
    expect(root.querySelector("table")).toBeNull();
  });

  test("renders compact normalized totals and simultaneous ordered sections without request tables", async () => {
    const { root, view } = mount();
    await view.render({
      sessionID: "one",
      directory: "/local",
      loading: false,
      session,
      error: "Offline",
    });
    expect(root.querySelector("header h1")?.textContent).toBe("Session insight");
    expect(root.querySelector("header h1")?.classList.contains("sr-only")).toBe(false);
    expect(root.querySelector('[role="tablist"], [role="tab"], [role="tabpanel"]')).toBeNull();
    const sections = [...root.querySelectorAll<HTMLElement>(".insight-data > section")];
    expect(sections.map((section) => section.id)).toEqual([
      "insight-speed",
      "insight-token",
      "insight-time",
    ]);
    expect(sections.map((section) => section.querySelector("h2")?.textContent)).toEqual([
      "Speed",
      "Tokens",
      "Times",
    ]);
    for (const section of sections) {
      expect(section.closest("[hidden]")).toBeNull();
      expect(section.getAttribute("aria-labelledby")).toBe(section.querySelector("h2")?.id);
    }
    expect(root.textContent).toContain("Previous captured data is retained");
    expect(root.textContent).toContain("Partial capture");
    const metrics = [...root.querySelectorAll(".top-metrics strong")].map(
      (metric) => metric.textContent,
    );
    expect(metrics[0]).toBe("40");
    expect(metrics[1]).toBe("165");
    expect(metrics[2]).toBe("20 tokens/s");
    const speedSvg = root.querySelector("#insight-speed svg")!;
    speedSvg.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
    expect(root.querySelector("#insight-speed .tooltip strong")?.textContent).toBe(metrics[2]);
    expect(root.querySelector(".donut")).not.toBeNull();
    expect(root.querySelector(".donut strong")?.textContent).toBe("40");
    expect(root.querySelector('[data-source="attribution"]')).toBeNull();
    expect(root.querySelector(".composition-legend")?.textContent).toContain("100%");
    expect(root.querySelector(".quality-slot")?.textContent).toContain("Estimated attribution");
    expect(root.querySelector("h2[title]")?.getAttribute("title")).toContain(
      "Output and reasoning are separate",
    );
    selectScope(root, "Cumulative inputs");
    expect(root.querySelector(".scope-slot")?.getAttribute("title")).toContain(
      "including repeated context",
    );
    expect(root.textContent).toContain("Background 2 s");
    expect(root.querySelector(".phase-stack, .phase-legend")).toBeNull();
    expect(root.textContent).not.toContain("Foreground phases");
    expect(root.querySelectorAll(".trace-view")).toHaveLength(1);
    expect(root.querySelector(".timeline")).toBeNull();
    expect(root.querySelector(".timing-meta [title]")?.getAttribute("title")).toContain(
      "Child-session usage is not merged",
    );
    expect(root.querySelector("table")).toBeNull();
  });

  test("groups token controls and empty states in two ordered labelled blocks", async () => {
    const { root, view } = mount();
    const state = { sessionID: "one", directory: "/local", loading: false, session };
    await view.render({
      ...state,
      session: { ...session, requests: [{ ...session.requests[0], cost: 0.25 }] },
    });
    const grid = root.querySelector("#insight-token > .token-grid")!;
    const blocks = [...grid.querySelectorAll<HTMLElement>(":scope > section.token-block")];
    expect(blocks).toHaveLength(2);
    expect(blocks.map((block) => block.querySelector("h2")?.textContent)).toEqual([
      "Input composition",
      "Reported cumulative usage",
    ]);
    for (const block of blocks) {
      expect(block.getAttribute("aria-labelledby")).toBe(block.querySelector("h2")?.id);
      expect(block.querySelector("h2")?.id).toBeTruthy();
    }
    const [input, usage] = blocks;
    const scope = input.querySelector('[aria-haspopup="listbox"]')!;
    const quality = input.querySelector<HTMLElement>(".quality-slot")!;
    const inputEmpty = [...input.querySelectorAll<HTMLElement>("div")].find(
      (node) => node.textContent === "Input source attribution unavailable." && node.hidden,
    )!;
    const usageEmpty = [...usage.querySelectorAll<HTMLElement>("div")].find(
      (node) => node.textContent === "Provider usage unavailable." && node.hidden,
    )!;
    const cost = usage.querySelector<HTMLElement>('[title="Reported cost for captured requests"]')!;
    const compositions = blocks.map((block) => block.querySelector(".composition")!);
    expect(scope).not.toBeNull();
    expect(quality.hidden).toBe(false);
    expect(inputEmpty).toBeDefined();
    expect(usageEmpty).toBeDefined();
    expect(cost.textContent).toContain("0.25");
    expect(usage.querySelector(".scope-slot, .quality-slot, details")).toBeNull();
    expect(input.contains(cost)).toBe(false);

    await view.render({
      ...state,
      session: {
        ...session,
        revision: 2,
        requests: [{ ...session.requests[0], context: [], usage: undefined }],
      },
    });
    expect(inputEmpty.hidden).toBe(false);
    expect(usageEmpty.hidden).toBe(false);
    expect(quality.hidden).toBe(true);
    expect(cost.hidden).toBe(true);
    for (const composition of compositions) expect(composition.parentElement?.hidden).toBe(true);
    await view.render({ ...state, session: { ...session, revision: 3 } });
    expect(root.querySelector(".token-grid")).toBe(grid);
    blocks.forEach((block, index) => expect(grid.children[index]).toBe(block));
    expect(input.querySelector('[aria-haspopup="listbox"]')).toBe(scope);
    expect(inputEmpty.hidden).toBe(true);
    expect(usageEmpty.hidden).toBe(true);
    blocks.forEach((block, index) => {
      expect(block.querySelector(".composition")).toBe(compositions[index]);
      expect(compositions[index].parentElement?.hidden).toBe(false);
    });
  });

  test("refreshes Speed, Tokens and Times together without replacing their nodes", async () => {
    const { root, view } = mount();
    const state = {
      sessionID: "one",
      directory: "/local",
      loading: false,
      session: {
        ...session,
        updatedAt: 17000,
        requests: [
          { ...session.requests[0], id: "baseline" },
          {
            ...session.requests[0],
            startedAt: 2000,
            endedAt: 17000,
            streamedAt: 17000,
          },
        ],
      },
    };
    await view.render(state);
    const path = root.querySelector("#insight-speed path.speed")!;
    const previousPath = path.getAttribute("d");
    const total = root.querySelector("#insight-token .donut strong")!;
    const span = root.querySelector<HTMLButtonElement>(
      '#insight-time [data-trace-key="tool:child-tool"] .trace-plot',
    )!;
    expect(total.textContent).toBe("40");
    expect(span.getAttribute("aria-label")).toContain("2 s");
    await view.render({
      ...state,
      session: {
        ...session,
        revision: 2,
        updatedAt: 17000,
        tools: [{ ...session.tools[0], endedAt: 3500 }],
        requests: [
          state.session.requests[0],
          {
            ...session.requests[0],
            startedAt: 2000,
            endedAt: 17000,
            streamedAt: 17000,
            usage: { ...session.requests[0].usage!, output: 60 },
            context: [{ ...session.requests[0].context[0], tokens: 60 }],
          },
        ],
      },
    });
    expect(root.querySelector("#insight-speed path.speed")).toBe(path);
    expect(path.getAttribute("d")).not.toBe(previousPath);
    expect(root.querySelector("#insight-token .donut strong")).toBe(total);
    expect(total.textContent).toBe("60");
    expect(root.querySelector('[data-trace-key="tool:child-tool"] .trace-plot')).toBe(span);
    expect(span.getAttribute("aria-label")).toContain("3 s");
    expect(root.querySelector(".top-metrics strong")?.textContent).toBe("60");

    const svg = root.querySelector<SVGSVGElement>("#insight-speed svg")!;
    svg.focus();
    svg.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
    span.click();
    expect(root.querySelector<HTMLElement>("#insight-speed")!.dataset.inspectedRequest).toBe(
      "baseline",
    );
    const inspector = root.querySelector<HTMLElement>("#insight-time .trace-inspector")!;
    expect(inspector.dataset.open).toBe("true");
    await view.render({ ...state, sessionID: "two", session: { ...session, sessionID: "two" } });
    expect(root.querySelector<HTMLElement>("#insight-speed")!.dataset.inspectedAt).toBeUndefined();
    expect(root.querySelector<HTMLElement>("#insight-speed .tooltip")!.hidden).toBe(true);
    expect(inspector.dataset.open).toBe("false");
  });

  test("does not turn interrupted activity without an end into ongoing elapsed time", async () => {
    const { root, view } = mount();
    await view.render({
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
    expect(root.textContent).toContain("Duration unavailable");
    expect(root.querySelector(".lane-track")).toBeNull();
    expect(root.querySelector(".trace-stats strong")?.textContent).toBe("Unavailable");
    const span = root.querySelector('[data-trace-key="tool:interrupted"]')!;
    expect(span.querySelector<HTMLElement>(".trace-plot")?.dataset.duration).toBe("unknown");
    expect(span.querySelector(".trace-value")?.textContent).toBe("Unavailable");
    expect(span.querySelector(".trace-line-main")?.getAttribute("d")).toBe("");
    expect(span.querySelector(".trace-line-unknown")?.getAttribute("d")).toContain(" L");
  });

  test("shows reported Code Mode calls directly without invented child timing", async () => {
    const { root, view } = mount();
    await view.render({
      sessionID: "one",
      directory: "/local",
      loading: false,
      session: {
        ...session,
        tools: [
          {
            ...session.tools[0],
            name: "execute",
            requestID: "request",
            reportedCalls: Array.from({ length: 3 }, () => ({
              name: "files.read_text_file",
              status: "completed" as const,
            })),
          },
        ],
      },
    });
    root.querySelector<HTMLButtonElement>('[aria-label="Inspect Code Mode"]')!.click();
    await Promise.resolve();
    expect(root.textContent).toContain("files.read_text_file ×3 · completed");
    expect(root.querySelector<HTMLElement>('[data-source="reported-calls"]')?.hidden).toBe(false);
    expect(root.querySelector(".trace-inspector details")).toBeNull();
    expect(root.querySelectorAll(".lane-track")).toHaveLength(0);
  });

  test("span details require activation instead of hover or focus and close on Escape", async () => {
    const { root, view } = mount();
    await view.render({ sessionID: "one", directory: "/local", loading: false, session });
    const span = root.querySelector<HTMLButtonElement>(
      '[data-trace-key="tool:child-tool"] .trace-plot',
    )!;
    const inspector = root.querySelector<HTMLElement>(".trace-inspector")!;
    span.dispatchEvent(new Event("pointerenter"));
    span.focus();
    expect(inspector.dataset.open).not.toBe("true");
    span.click();
    expect(inspector.dataset.open).toBe("true");
    inspector.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(inspector.dataset.open).toBe("false");
    expect(document.activeElement).toBe(span);
  });

  test("keeps span inspection and keyboard focus intact across polling renders", async () => {
    const { root, view } = mount();
    const state = { sessionID: "one", directory: "/local", loading: false, session };
    await view.render(state);
    const span = root.querySelector<HTMLButtonElement>(
      '[data-trace-key="tool:child-tool"] .trace-plot',
    )!;
    span.click();
    const close = root.querySelector<HTMLButtonElement>('[aria-label="Close span details"]')!;
    expect(document.activeElement).toBe(close);
    await view.render({
      ...state,
      session: {
        ...session,
        revision: 2,
        tools: [{ ...session.tools[0], endedAt: 3500 }],
      },
    });
    expect(root.querySelector('[data-trace-key="tool:child-tool"] .trace-plot')).toBe(span);
    expect(document.activeElement).toBe(close);
    expect(span.getAttribute("aria-label")).toContain("3 s");
    expect(root.querySelector<HTMLElement>(".trace-inspector")?.dataset.open).toBe("true");
  });

  test("keeps the SDK scope popup and keyboard selection intact across polling", async () => {
    const { root, view } = mount();
    const state = { sessionID: "one", directory: "/local", loading: false, session };
    await view.render(state);
    const trigger = root.querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]')!;
    trigger.click();
    const popup = root.querySelector<HTMLElement>('[role="listbox"]')!;
    popup.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    const active = popup.getAttribute("aria-activedescendant");
    const option = popup.querySelector('[data-active="true"]');
    expect(option?.textContent).toBe("Cumulative inputs");
    await view.render({ ...state, session: { ...session, revision: 2 } });
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

  test("retains cumulative scope across polling but resets for a new session", async () => {
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
    await view.render(state);
    expect(root.querySelector(".donut strong")?.textContent).toBe("60");
    selectScope(root, "Cumulative inputs");
    expect(root.querySelector(".donut strong")?.textContent).toBe("100");
    const blocks = [...root.querySelectorAll(".token-block")];
    const trigger = blocks[0].querySelector('[aria-haspopup="listbox"]')!;
    const donut = blocks[0].querySelector(".donut")!;
    await view.render({ ...state, session: { ...captured, revision: 2 } });
    blocks.forEach((block, index) => {
      expect(root.querySelectorAll(".token-block")[index]).toBe(block);
    });
    expect(blocks[0].querySelector('[aria-haspopup="listbox"]')).toBe(trigger);
    expect(blocks[0].querySelector(".donut")).toBe(donut);
    expect(root.querySelector('[aria-haspopup="listbox"]')?.textContent).toBe("Cumulative inputs");
    expect(root.querySelector(".donut strong")?.textContent).toBe("100");
    await view.render({ ...state, sessionID: "two", session: { ...captured, sessionID: "two" } });
    expect(root.querySelector('[aria-haspopup="listbox"]')?.textContent).toBe("Current context");
    expect(root.querySelector(".donut strong")?.textContent).toBe("60");
  });

  test("disposal closes SDK popups, removes listeners and ignores later renders", async () => {
    const retry = vi.fn();
    const { root, view } = mount(retry);
    const state = { sessionID: "one", directory: "/local", loading: false, session };
    await view.render(state);
    const svg = root.querySelector<SVGSVGElement>("#insight-speed svg")!;
    const speed = root.querySelector<HTMLElement>("#insight-speed")!;
    const retryButton = root.querySelector<HTMLButtonElement>("#retry")!;
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
    await view.render({ ...state, error: "late update" });
    expect(root.childNodes).toHaveLength(0);
    expect(() => view.dispose()).not.toThrow();
  });
});
