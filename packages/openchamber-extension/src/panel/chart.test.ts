// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
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
function mount() {
  const root = document.createElement("div");
  document.body.append(root);
  const controller = createSpeedChart(root);
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
      640,
      75000,
    );
    expect(g.path.match(/M/g)).toHaveLength(2);
    expect(g.path.match(/C/g)).toHaveLength(1);
    expect(g.path).not.toContain("L");
    expect(g.shades).toEqual([{ start: 30000, end: 60000, state: "waiting" }]);
    expect(chartGeometry().max).toBe(1);
  });

  test("closes the final bucket on the clock without requiring another telemetry revision", () => {
    vi.useFakeTimers();
    vi.setSystemTime(14999);
    const { root, controller } = mount();
    controller.update({
      ...session,
      requests: [
        {
          ...session.requests[0],
          endedAt: 1100,
          streamedAt: 1100,
          buckets: [session.requests[0].buckets[0]],
        },
      ],
    });
    expect(root.querySelector<HTMLElement>(".chart")!.hidden).toBe(true);
    vi.advanceTimersByTime(1);
    expect(root.querySelector<HTMLElement>(".chart")!.hidden).toBe(false);
    expect(root.querySelectorAll(".speed-points circle")).toHaveLength(1);
    root.querySelector("svg")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
    expect(root.querySelector(".tooltip strong")?.textContent).toBe("10 tokens/s");
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
    controller.update(session);
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
    controller.update(session);
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
    controller.update(session);
    const svg = root.querySelector("svg")!;
    const tip = root.querySelector<HTMLElement>(".tooltip")!;
    svg.focus();
    svg.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
    const before = root.querySelector("path.speed")!.getAttribute("d");
    controller.update({
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
    });
    expect(root.querySelector("svg")).toBe(svg);
    expect(document.activeElement).toBe(svg);
    expect(root.querySelector(".tooltip")).toBe(tip);
    expect(tip.hidden).toBe(false);
    expect(root.dataset.inspectedAt).toBe("7500");
    expect(tip.querySelector("strong")?.textContent).toBe("20 tokens/s");
    expect(root.querySelector("path.speed")!.getAttribute("d")).not.toBe(before);
    controller.update({
      ...session,
      requests: [
        { ...session.requests[0], startedAt: 16000, buckets: [session.requests[0].buckets[1]] },
      ],
    });
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
    for (let i = 0; i < 5; i++) controller.update(input);
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
    controller.update(session);
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
