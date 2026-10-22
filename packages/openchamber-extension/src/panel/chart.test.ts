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
      id: "first",
      model: "model",
      startedAt: 0,
      streamedAt: 10000,
      endedAt: 11000,
      status: "completed",
      reasoningMode: "hidden",
      capture: "partial",
      context: [],
      buckets: [],
      usage: { input: 0, output: 20, reasoning: 80, cacheRead: 0, cacheWrite: 0 },
    },
    {
      id: "second",
      model: "model",
      startedAt: 600000,
      streamedAt: 620000,
      endedAt: 621000,
      status: "completed",
      reasoningMode: "hidden",
      capture: "partial",
      context: [],
      buckets: [],
      usage: { input: 0, output: 100, reasoning: 300, cacheRead: 0, cacheWrite: 0 },
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
const window = (input = session) => buildSpeedWindow(input, undefined, 630000);

describe("speed chart", () => {
  afterEach(() => {
    mounted.splice(0).forEach((chart) => chart.dispose());
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  test("connects reported output plus reasoning request means on compressed model time", () => {
    const g = chartGeometry(window());
    expect(g.points.map((point) => point.tps)).toEqual([10, 20]);
    expect(g.end).toBe(30000);
    expect(g.points.map((point) => point.at)).toEqual([5000, 20000]);
    expect(g.path.match(/M/g)).toHaveLength(1);
    expect(g.path.match(/L/g)).toHaveLength(1);
    expect(g.shades).toEqual([]);
    const { root, controller } = mount();
    controller.update(window());
    expect(root.querySelectorAll(".speed-boundary")).toHaveLength(1);
    expect(root.querySelectorAll(".speed-points circle")).toHaveLength(2);
    expect([...root.querySelectorAll(".time-label")].map((node) => node.textContent)).toEqual([
      "0 s",
      "15 s",
      "30 s",
    ]);
  });

  test("does not interpolate through unknown request rates or fabricate hidden reasoning samples", () => {
    const data = window({
      ...session,
      requests: [
        session.requests[0],
        {
          ...session.requests[0],
          id: "missing",
          startedAt: 20000,
          streamedAt: 25000,
          usage: undefined,
        },
        session.requests[1],
      ],
    });
    const g = chartGeometry(data);
    expect(g.path.match(/M/g)).toHaveLength(2);
    expect(g.path).not.toContain("L");
    expect(g.points).toHaveLength(3);
    expect(g.shades.map((point) => point.requestID)).toEqual(["missing"]);
    const { root, controller } = mount();
    controller.update(data);
    const svg = root.querySelector("svg")!;
    svg.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
    svg.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(root.querySelector(".tooltip strong")?.textContent).toBe("Rate unavailable");
    expect(root.querySelectorAll(".speed-points circle")).toHaveLength(2);

    const unknownDuration = chartGeometry(
      window({
        ...session,
        requests: [
          session.requests[0],
          {
            ...session.requests[0],
            id: "unknown-duration",
            startedAt: 20000,
            streamedAt: undefined,
            endedAt: undefined,
            status: "interrupted",
          },
          session.requests[1],
        ],
      }),
    );
    expect(unknownDuration.points).toHaveLength(2);
    expect(unknownDuration.path.match(/M/g)).toHaveLength(2);
    expect(unknownDuration.path).not.toContain("L");
  });

  test("keyboard and touch inspection expose request rates", () => {
    const { root, controller } = mount();
    controller.update(window());
    const svg = root.querySelector("svg")!;
    svg.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
    const tip = root.querySelector<HTMLElement>(".tooltip")!;
    expect(tip.hidden).toBe(false);
    expect(tip.querySelector("strong")?.textContent).toBe("10 tokens/s");
    expect(root.dataset.inspectedRequest).toBe("first");
    svg.getBoundingClientRect = () => ({ left: 0, width: 320 }) as DOMRect;
    svg.dispatchEvent(new MouseEvent("pointerdown", { clientX: 319 }));
    expect(root.dataset.inspectedRequest).toBe("second");
    expect(tip.querySelector("strong")?.textContent).toBe("20 tokens/s");
    expect(tip.parentElement?.previousElementSibling).toBe(svg);
    root.querySelector(".chart")!.dispatchEvent(new Event("pointerleave"));
    expect(tip.hidden).toBe(true);
    svg.dispatchEvent(new KeyboardEvent("keydown", { key: "End" }));
    expect(tip.hidden).toBe(false);
    svg.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(tip.hidden).toBe(true);
  });

  test("retains the selected request, focus and readout through polling until that request leaves", () => {
    const { root, controller } = mount();
    controller.update(window());
    const svg = root.querySelector("svg")!;
    const tip = root.querySelector<HTMLElement>(".tooltip")!;
    svg.focus();
    svg.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
    const before = root.querySelector("path.speed")!.getAttribute("d");
    controller.update(
      window({
        ...session,
        requests: [
          { ...session.requests[0], usage: { ...session.requests[0].usage!, output: 70 } },
          session.requests[1],
        ],
      }),
    );
    expect(root.querySelector("svg")).toBe(svg);
    expect(document.activeElement).toBe(svg);
    expect(root.querySelector(".tooltip")).toBe(tip);
    expect(root.dataset.inspectedRequest).toBe("first");
    expect(tip.querySelector("strong")?.textContent).toBe("15 tokens/s");
    expect(root.querySelector("path.speed")!.getAttribute("d")).not.toBe(before);
    controller.update(window({ ...session, requests: [session.requests[1]] }));
    expect(tip.hidden).toBe(true);
    expect(root.dataset.inspectedRequest).toBeUndefined();
  });

  test("shows pending requests, single averages and absent measurements honestly", () => {
    const { root, controller } = mount();
    controller.update();
    expect(root.querySelector<HTMLElement>(".chart-empty")!.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>(".chart")!.hidden).toBe(true);
    controller.update(window({ ...session, requests: [session.requests[0]] }));
    expect(root.querySelector("path.speed")!.getAttribute("d")).not.toContain("L");
    controller.update(
      window({
        ...session,
        requests: [
          { ...session.requests[0], status: "running", streamedAt: undefined, endedAt: undefined },
        ],
      }),
    );
    root.querySelector("svg")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
    expect(root.querySelector(".tooltip strong")?.textContent).toBe("Pending final usage");
    expect(root.querySelectorAll(".speed-points circle")).toHaveLength(0);
    expect(root.querySelector("path.speed")!.getAttribute("d")).toBe("");
    expect(root.querySelector("table")).toBeNull();
  });

  test("refreshes at capture deadlines only while visible and cancels the clock on disposal", () => {
    vi.useFakeTimers();
    vi.setSystemTime(45000);
    const refresh = vi.fn();
    const { root, controller } = mount(refresh);
    const data = buildSpeedWindow({
      ...session,
      requests: [
        { ...session.requests[0], status: "running", streamedAt: undefined, endedAt: undefined },
      ],
    });
    for (let i = 0; i < 5; i++) controller.update(data);
    expect(vi.getTimerCount()).toBe(1);
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(15001);
    expect(refresh).not.toHaveBeenCalled();
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(0);
    expect(refresh).toHaveBeenCalledOnce();
    controller.update(data);
    expect(vi.getTimerCount()).toBe(0);
    const svg = root.querySelector("svg")!;
    svg.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
    controller.dispose();
    controller.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(root.querySelector<HTMLElement>(".tooltip")!.hidden).toBe(true);
    svg.dispatchEvent(new Event("focus"));
    expect(root.querySelector<HTMLElement>(".tooltip")!.hidden).toBe(true);
    const path = root.querySelector("path.speed")!.getAttribute("d");
    controller.update();
    expect(root.querySelector("path.speed")!.getAttribute("d")).toBe(path);
  });

  test("adapts to narrow panels and disconnects width observation", () => {
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
    controller.update(window());
    const svg = root.querySelector("svg")!;
    const before = root.querySelector("path.speed")!.getAttribute("d");
    expect(svg.getAttribute("viewBox")).toBe("0 0 640 230");
    width = 320;
    resize();
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
