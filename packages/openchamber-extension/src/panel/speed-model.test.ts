import { describe, expect, test } from "vitest";
import type { RequestInsight, SessionInsight } from "@opencode-insight/telemetry/schema";
import { speedModel } from "./speed-model";

const request = (overrides: Partial<RequestInsight> = {}): RequestInsight => ({
  id: "request",
  model: "model",
  startedAt: 0,
  status: "running",
  capture: "live",
  firstDeltaAt: 1000,
  reasoningMode: "unknown",
  context: [],
  buckets: [],
  ...overrides,
});
const session = (requests: RequestInsight[]): SessionInsight => ({
  version: 1,
  sessionID: "one",
  directory: "/local",
  revision: 1,
  updatedAt: 1,
  interruptedCapture: false,
  requests,
  tools: [],
});
const bucket = (at: number, output: number) => ({ at, output, reasoning: 500, summary: 300 });

describe("completed speed buckets", () => {
  test("averages output over complete 15-second buckets across requests, without recounting final usage", () => {
    const input = session([
      request({
        buckets: [bucket(1000, 150), bucket(14000, 75), bucket(15000, 300), bucket(60000, 9000)],
      }),
      request({
        id: "other",
        startedAt: 14000,
        buckets: [bucket(14000, 75)],
        usage: {
          input: 0,
          output: 9999,
          reasoning: 0,
          cacheRead: 0,
          cacheWrite: 0,
        },
      }),
    ]);
    const model = speedModel(input, 61000);
    expect(model.end).toBe(60000);
    expect(
      model.buckets.slice(0, 2).map(({ start, end, at, tps }) => ({ start, end, at, tps })),
    ).toEqual([
      { start: 0, end: 15000, at: 7500, tps: 20 },
      { start: 15000, end: 30000, at: 22500, tps: 20 },
    ]);
    expect(model.buckets.every((point) => point.end <= 61000)).toBe(true);
    expect(speedModel(input, 75000).buckets.at(-1)?.tps).toBe(600);
  });

  test("a quiet clock closes the final bucket once and freezes completed sessions without losing the last output", () => {
    const input = session([
      request({
        endedAt: 1100,
        streamedAt: 1100,
        status: "completed",
        buckets: [bucket(1000, 150)],
      }),
    ]);
    expect(speedModel(input, 14999).buckets).toEqual([]);
    const closed = speedModel(input, 15000);
    expect(closed.buckets[0].tps).toBe(10);
    expect(speedModel(input, 3000000)).toEqual(closed);
  });

  test("uses status-only buckets for waiting, tools and missing observations, never fabricated zero rates", () => {
    const input = session([
      request({
        endedAt: 15000,
        streamedAt: 15000,
        status: "completed",
        firstDeltaAt: 14000,
        buckets: [bucket(14000, 0)],
      }),
      request({
        id: "missing",
        startedAt: 30000,
        endedAt: 45000,
        status: "completed",
        firstDeltaAt: undefined,
        capture: "partial",
      }),
      request({
        id: "output",
        startedAt: 45000,
        endedAt: 60000,
        status: "completed",
        buckets: [bucket(45000, 150)],
      }),
    ]);
    input.tools.push({
      id: "tool",
      name: "shell",
      startedAt: 16000,
      endedAt: 25000,
      status: "completed",
      background: false,
    });
    const points = speedModel(input, 60000).buckets;
    expect(points.map((point) => point.state)).toEqual([
      "waiting",
      "tools",
      "unobserved",
      "output",
    ]);
    expect(points.map((point) => point.tps)).toEqual([undefined, undefined, undefined, 10]);
  });

  test("keeps at most forty complete buckets in a following ten-minute window", () => {
    const model = speedModel(
      session([request({ buckets: [bucket(1000, 150), bucket(610000, 300)] })]),
      617000,
    );
    expect(model.start).toBe(15000);
    expect(model.end).toBe(615000);
    expect(model.buckets).toHaveLength(40);
    expect(model.buckets.at(-1)?.tps).toBe(20);
  });
});
