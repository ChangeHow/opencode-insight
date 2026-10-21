// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import type { SeriesPoint, SessionInsight } from "@opencode-insight/telemetry/schema";
import { chartGeometry, mountChart } from "./chart";

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
    mountChart(root, []);
    expect(root.textContent).toContain("No speed samples");
    expect(root.querySelector("[title]")?.getAttribute("title")).toContain(
      "cannot reconstruct per-second",
    );
    expect(root.querySelector("table")).toBeNull();
  });

  test("keyboard time inspection shows request, bucket, rolling rate, mean and quality", () => {
    const root = document.createElement("div");
    document.body.append(root);
    mountChart(root, [point(1000), point(2000)], session);
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
    mountChart(root, [{ ...point(1000), summaryTps: 3 }], session);
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
    expect(root.querySelector("path.reasoning")).toBeNull();
    chart.dispatchEvent(new Event("pointerleave"));
    expect(tip.hidden).toBe(true);
  });
});
