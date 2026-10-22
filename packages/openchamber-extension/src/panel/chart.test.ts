// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { buildSpeedWindow } from "@opencode-insight/telemetry/queries";
import type { SessionInsight } from "@opencode-insight/telemetry/schema";
import { chartGeometry, createSpeedChart } from "./chart";

const session: SessionInsight = {
  version: 1,
  sessionID: "one",
  directory: "/local",
  revision: 1,
  updatedAt: 1,
  interruptedCapture: false,
  tools: [],
  requests: [
    {
      id: "request",
      model: "model",
      startedAt: 0,
      endedAt: 31000,
      streamedAt: 31000,
      firstDeltaAt: 1000,
      status: "completed",
      reasoningMode: "hidden",
      capture: "live",
      context: [],
      buckets: [
        { at: 1000, output: 150, reasoning: 0, summary: 0 },
        { at: 16000, output: 300, reasoning: 0, summary: 0 },
      ],
    },
  ],
};
const mounted: ReturnType<typeof createSpeedChart>[] = [];
function mount(refresh: () => void = () => {}) {
  const root = document.createElement("div");
  document.body.append(root);
  const controller = createSpeedChart(root, refresh);
  mounted.push(controller);
  return { root, controller };
}

describe("speed chart", () => {
  afterEach(() => {
    mounted.splice(0).forEach((chart) => chart.dispose());
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  test("smoothly joins output buckets but never interpolates through gray waiting intervals", () => {
    const g = chartGeometry(
      buildSpeedWindow(
        {
          ...session,
          requests: [
            {
              ...session.requests[0],
              endedAt: 61000,
              buckets: [
                ...session.requests[0].buckets,
                { at: 60000, output: 450, reasoning: 0, summary: 0 },
              ],
            },
          ],
        },
        undefined,
        75000,
      ),
      640,
    );
    expect(g.path.match(/M/g)).toHaveLength(2);
    expect(g.path.match(/C/g)).toHaveLength(1);
    expect(g.path).not.toContain("L");
    expect(g.shades).toEqual([{ start: 30000, end: 60000, state: "waiting" }]);
    expect(chartGeometry().max).toBe(1);
  });

  test("refreshes the bounded window at the final bucket boundary without inventing output", () => {
    vi.useFakeTimers();
    vi.setSystemTime(14999);
    const input: SessionInsight = {
      ...session,
      requests: [
        {
          ...session.requests[0],
          endedAt: 1100,
          streamedAt: 1100,
          buckets: [session.requests[0].buckets[0]],
        },
      ],
    };
    const refresh = vi.fn();
    const { root, controller } = mount(refresh);
    const initial = buildSpeedWindow(input);
    controller.update(initial);
    expect(root.querySelector<HTMLElement>(".chart")!.hidden).toBe(true);
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledOnce();
    expect(root.querySelector<HTMLElement>(".chart")!.hidden).toBe(true);
    controller.update(initial);
    expect(vi.getTimerCount()).toBe(0);
    controller.update(buildSpeedWindow(input));
    expect(root.querySelector<HTMLElement>(".chart")!.hidden).toBe(false);
    expect(root.querySelectorAll(".speed-points circle")).toHaveLength(1);
    root.querySelector("svg")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
    expect(root.querySelector(".tooltip strong")?.textContent).toBe("10 tokens/s");
    expect(vi.getTimerCount()).toBe(0);
  });

  test("defers overdue refresh while hidden and requests it only once when visible", () => {
    vi.useFakeTimers();
    vi.setSystemTime(45000);
    const refresh = vi.fn();
    const { controller } = mount(refresh);
    const window = buildSpeedWindow({
      ...session,
      requests: [{ ...session.requests[0], status: "running" }],
    });
    controller.update(window);
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(15001);
    expect(refresh).not.toHaveBeenCalled();
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    document.dispatchEvent(new Event("visibilitychange"));
    vi.runOnlyPendingTimers();
    expect(refresh).toHaveBeenCalledOnce();
    controller.update(window);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(vi.getTimerCount()).toBe(0);
  });

  test("shows an honest empty state and no table", () => {
    const { root, controller } = mount();
    controller.update();
    expect(root.textContent).toContain("No speed samples");
    expect(root.querySelector(".chart-empty")?.getAttribute("title")).toContain(
      "cannot reconstruct",
    );
    expect(root.querySelector("table")).toBeNull();
  });

  test("keyboard inspection reports bucket TPS or waiting status, never fabricated zero speed", () => {
    const { root, controller } = mount();
    controller.update(buildSpeedWindow(session, undefined, 75000));
    const svg = root.querySelector("svg")!;
    const key = (key: string) => svg.dispatchEvent(new KeyboardEvent("keydown", { key }));
    key("Home");
    const tip = root.querySelector<HTMLElement>(".tooltip")!;
    expect(tip.hidden).toBe(false);
    expect(tip.querySelector("time")?.textContent).toBeTruthy();
    expect(tip.querySelector("strong")?.textContent).toBe("10 tokens/s");
    expect(tip.children).toHaveLength(2);
    expect(root.querySelectorAll("path.line")).toHaveLength(1);
    key("ArrowRight");
    expect(root.dataset.inspectedAt).toBe("22500");
    key("End");
    expect(tip.querySelector("strong")?.textContent).toBe("Waiting");
    expect(root.querySelectorAll(".speed-shade")).toHaveLength(1);
    key("Escape");
    expect(tip.hidden).toBe(true);
  });

  test("pointer inspection uses a separate readout without obscuring the curve", () => {
    const { root, controller } = mount();
    controller.update(buildSpeedWindow(session, undefined, 75000));
    const chart = root.querySelector<HTMLElement>(".chart")!;
    const svg = root.querySelector("svg")!;
    svg.getBoundingClientRect = () => ({ left: 0, width: 320 }) as DOMRect;
    svg.dispatchEvent(new MouseEvent("pointermove", { clientX: 319 }));
    const tip = root.querySelector<HTMLElement>(".tooltip")!;
    expect(tip.hidden).toBe(false);
    expect(tip.parentElement?.className).toBe("speed-inspection");
    expect(tip.parentElement?.previousElementSibling).toBe(svg);
    expect(tip.querySelector("strong")?.textContent).toBe("Waiting");
    chart.dispatchEvent(new Event("pointerleave"));
    expect(tip.hidden).toBe(true);
    svg.dispatchEvent(new MouseEvent("pointerdown", { clientX: 319 }));
    expect(tip.hidden).toBe(false);
  });

  test("retains SVG, focus, readout and selected bucket across polling until it leaves the window", () => {
    const { root, controller } = mount();
    controller.update(buildSpeedWindow(session, undefined, 75000));
    const svg = root.querySelector("svg")!;
    const tip = root.querySelector<HTMLElement>(".tooltip")!;
    svg.focus();
    svg.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
    const before = root.querySelector("path.speed")!.getAttribute("d");
    controller.update(
      buildSpeedWindow(
        {
          ...session,
          requests: [
            {
              ...session.requests[0],
              buckets: [
                { ...session.requests[0].buckets[0], output: 300 },
                session.requests[0].buckets[1],
              ],
            },
          ],
        },
        undefined,
        75000,
      ),
    );
    expect(root.querySelector("svg")).toBe(svg);
    expect(document.activeElement).toBe(svg);
    expect(root.querySelector(".tooltip")).toBe(tip);
    expect(tip.hidden).toBe(false);
    expect(root.dataset.inspectedAt).toBe("7500");
    expect(tip.querySelector("strong")?.textContent).toBe("20 tokens/s");
    expect(root.querySelector("path.speed")!.getAttribute("d")).not.toBe(before);
    controller.update(
      buildSpeedWindow(
        {
          ...session,
          requests: [
            { ...session.requests[0], startedAt: 16000, buckets: [session.requests[0].buckets[1]] },
          ],
        },
        undefined,
        75000,
      ),
    );
    expect(tip.hidden).toBe(true);
    expect(root.dataset.inspectedAt).toBeUndefined();
  });

  test("keeps listeners singular and cancels the bucket clock on disposal", () => {
    vi.useFakeTimers();
    vi.setSystemTime(45000);
    const { root, controller } = mount();
    const input = {
      ...session,
      requests: [{ ...session.requests[0], status: "running" as const }],
    };
    for (let i = 0; i < 5; i++) controller.update(buildSpeedWindow(input, undefined, Date.now()));
    expect(vi.getTimerCount()).toBe(1);
    const svg = root.querySelector("svg")!;
    const key = (key: string) => svg.dispatchEvent(new KeyboardEvent("keydown", { key }));
    key("Home");
    key("ArrowRight");
    expect(root.dataset.inspectedAt).toBe("22500");
    controller.dispose();
    controller.dispose();
    expect(vi.getTimerCount()).toBe(0);
    key("Home");
    svg.dispatchEvent(new Event("focus"));
    expect(root.querySelector<HTMLElement>(".tooltip")!.hidden).toBe(true);
    const path = root.querySelector("path.speed")!.getAttribute("d");
    controller.update();
    expect(root.querySelector("path.speed")!.getAttribute("d")).toBe(path);
  });

  test("observes width changes including hidden to visible and disconnects", () => {
    let resize: () => void = () => {};
    const observe = vi.fn(),
      disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );
    const root = document.createElement("div");
    let width = 0;
    Object.defineProperty(root, "clientWidth", { get: () => width });
    const controller = createSpeedChart(root);
    mounted.push(controller);
    controller.update(buildSpeedWindow(session, undefined, 75000));
    const svg = root.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 640 230");
    const before = root.querySelector("path.speed")!.getAttribute("d");
    width = 320;
    resize();
    expect(root.querySelector("svg")).toBe(svg);
    expect(svg.getAttribute("viewBox")).toBe("0 0 320 230");
    expect(root.querySelector("path.speed")!.getAttribute("d")).not.toBe(before);
    expect(observe).toHaveBeenCalledWith(root);
    controller.dispose();
    expect(disconnect).toHaveBeenCalledOnce();
    width = 500;
    resize();
    expect(svg.getAttribute("viewBox")).toBe("0 0 320 230");
  });
});
