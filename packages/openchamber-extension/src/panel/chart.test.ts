// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import type { SeriesPoint, SessionInsight } from "@opencode-insight/telemetry/schema";
import { chartGeometry, createSpeedChart } from "./chart";

const point = (at: number, requestID = "request"): SeriesPoint => ({
  at,
  requestID,
  model: "model <safe>",
  outputTps: 20,
  reasoningTps: 0,
  summaryTps: 0,
  requestTps: 10,
  quality: "estimated",
});
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
      endedAt: 5000,
      streamedAt: 5000,
      status: "completed",
      reasoningMode: "hidden",
      capture: "live",
      context: [],
      buckets: [{ at: 1000, output: 12, reasoning: 0, summary: 0 }],
    },
  ],
};

describe("speed chart", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });
  test("breaks paths at gaps and request boundaries with nonzero axes", () => {
    const g = chartGeometry([point(0), point(1000), point(4000), point(5000, "next")]);
    expect(g.path("outputTps").match(/M/g)).toHaveLength(3);
    expect(g.path("outputTps").match(/L/g)).toHaveLength(1);
    expect(chartGeometry([]).max).toBe(1);
    const single = chartGeometry([point(0)]);
    expect(single.end).toBeGreaterThan(single.start);
  });

  test("uses an actual ten-minute window without a sample count cap", () => {
    const samples = Array.from({ length: 1801 }, (_, i) => point(i * 500));
    const completed = [{ ...session.requests[0], endedAt: 900000, streamedAt: 900000 }];
    const g = chartGeometry(samples, 640, completed, 2000000);
    expect(g.start).toBe(300000);
    expect(g.end).toBe(900000);
    expect(g.points).toHaveLength(1201);
    const live = chartGeometry(samples, 640, [{ ...completed[0], status: "running" }], 950000);
    expect(live.start).toBe(350000);
    expect(live.end).toBe(950000);
    expect(live.points[0].at).toBe(350000);
  });

  test("shows an honest empty state and no table", () => {
    const root = document.createElement("div");
    createSpeedChart(root).update([]);
    expect(root.textContent).toContain("No speed samples");
    expect(root.querySelector(".chart-empty")?.getAttribute("title")).toContain(
      "cannot reconstruct per-second",
    );
    expect(root.querySelector("table")).toBeNull();
  });

  test("keyboard time inspection shows request, bucket, rolling rate, mean and quality", () => {
    const root = document.createElement("div");
    document.body.append(root);
    createSpeedChart(root).update([point(1000), point(2000)], session);
    const chart = root.querySelector("svg")!;
    chart.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
    const tip = root.querySelector<HTMLElement>(".tooltip")!;
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toContain("Request request");
    expect(tip.textContent).toContain("Output bucket: 12");
    expect(tip.textContent).toContain("Rolling output: 20");
    expect(tip.textContent).toContain("Whole-request mean (output + reasoning): 10");
    expect(tip.textContent).toContain("Quality: estimated");
    expect(tip.textContent).toContain("Visible reasoning: not captured");
    expect(tip.querySelector("safe")).toBeNull();
    expect(root.querySelector(".mean")).not.toBeNull();
    expect(root.querySelector("table")).toBeNull();
    expect(root.querySelector("input")).toBeNull();
    chart.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(root.dataset.inspectedAt).toBe("2000");
    chart.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(tip.hidden).toBe(true);
    root.remove();
  });

  test("pointer inspection stays in the chart and distinguishes summary from visible reasoning", () => {
    const root = document.createElement("div");
    createSpeedChart(root).update([{ ...point(1000), summaryTps: 3 }], session);
    const chart = root.querySelector<HTMLElement>(".chart")!;
    Object.defineProperty(chart, "clientWidth", { value: 320 });
    const svg = root.querySelector("svg")!;
    svg.getBoundingClientRect = () => ({ left: 0, width: 320 }) as DOMRect;
    svg.dispatchEvent(new MouseEvent("pointermove", { clientX: 319 }));
    const tip = root.querySelector<HTMLElement>(".tooltip")!;
    expect(tip.hidden).toBe(false);
    expect(parseFloat(tip.style.left)).toBeGreaterThanOrEqual(0);
    expect(parseFloat(tip.style.left)).toBeLessThanOrEqual(320);
    expect(root.querySelector(".legend .summary")?.getAttribute("title")).toContain(
      "not hidden reasoning",
    );
    expect(root.querySelector("path.reasoning")?.hasAttribute("hidden")).toBe(true);
    chart.dispatchEvent(new Event("pointerleave"));
    expect(tip.hidden).toBe(true);
    svg.dispatchEvent(new MouseEvent("pointerdown", { clientX: 319 }));
    expect(tip.hidden).toBe(false);
  });

  test("retains SVG, focus, tooltip and request identity across polling", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const controller = createSpeedChart(root);
    controller.update([point(1000), point(1000, "other"), point(2000)], session);
    const svg = root.querySelector("svg")!;
    const tip = root.querySelector<HTMLElement>(".tooltip")!;
    svg.focus();
    svg.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
    svg.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(root.dataset.inspectedRequestId).toBe("other");
    const before = root.querySelector("path.output")!.getAttribute("d");
    controller.update(
      [point(500), point(1000), { ...point(1000, "other"), outputTps: 40 }, point(2000)],
      session,
    );
    expect(root.querySelector("svg")).toBe(svg);
    expect(document.activeElement).toBe(svg);
    expect(root.querySelector(".tooltip")).toBe(tip);
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toContain("Request other");
    expect(tip.textContent).toContain("Rolling output: 40");
    expect(root.querySelector("path.output")!.getAttribute("d")).not.toBe(before);
    controller.update([point(1000), point(2000)], session);
    expect(tip.hidden).toBe(true);
    expect(root.dataset.inspectedAt).toBeUndefined();
    controller.dispose();
  });

  test("keeps listeners singular and removes them on disposal", () => {
    const root = document.createElement("div");
    const controller = createSpeedChart(root);
    const input = [point(1000), point(2000), point(3000), point(4000)];
    for (let i = 0; i < 5; i++) controller.update(input, session);
    const svg = root.querySelector("svg")!;
    const key = (key: string) => svg.dispatchEvent(new KeyboardEvent("keydown", { key }));
    key("Home");
    key("ArrowRight");
    expect(root.dataset.inspectedAt).toBe("2000");
    key("Escape");
    controller.update(input, session);
    expect(root.querySelector<HTMLElement>(".tooltip")!.hidden).toBe(true);
    controller.dispose();
    controller.dispose();
    key("Home");
    svg.dispatchEvent(new Event("focus"));
    svg.dispatchEvent(new MouseEvent("pointerdown", { clientX: 100 }));
    expect(root.querySelector<HTMLElement>(".tooltip")!.hidden).toBe(true);
    const path = root.querySelector("path.output")!.getAttribute("d");
    controller.update([], session);
    expect(root.querySelector("path.output")!.getAttribute("d")).toBe(path);
  });

  test("observes width changes including hidden to visible and disconnects", () => {
    let resize: () => void = () => {};
    const observe = vi.fn();
    const disconnect = vi.fn();
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
    controller.update([point(1000), point(2000)], session);
    const svg = root.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 640 230");
    const before = root.querySelector("path.output")!.getAttribute("d");
    width = 320;
    resize();
    expect(root.querySelector("svg")).toBe(svg);
    expect(svg.getAttribute("viewBox")).toBe("0 0 320 230");
    expect(root.querySelector("path.output")!.getAttribute("d")).not.toBe(before);
    expect(observe).toHaveBeenCalledWith(root);
    controller.dispose();
    expect(disconnect).toHaveBeenCalledOnce();
    width = 500;
    resize();
    expect(svg.getAttribute("viewBox")).toBe("0 0 320 230");
  });

  test("only shows final means for completed requests and uses theme tokens", () => {
    const root = document.createElement("div");
    const controller = createSpeedChart(root);
    vi.spyOn(Date, "now").mockReturnValue(5000);
    controller.update([point(1000)], {
      ...session,
      requests: [{ ...session.requests[0], status: "running" }],
    });
    expect(root.querySelector("path.mean")!.getAttribute("d")).toBe("");
    root.querySelector("svg")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
    expect(root.querySelector(".tooltip")!.textContent).toContain(
      "Whole-request mean (output + reasoning): unavailable",
    );
    controller.update([point(1000)], session);
    expect(root.querySelector("path.mean")!.getAttribute("d")).toContain("M");
    for (const name of ["output", "reasoning", "summary", "mean"]) {
      expect(root.querySelector(`path.${name}`)!.getAttribute("style")).toContain(
        `var(--insight-speed-${name})`,
      );
    }
    controller.dispose();
  });
});
