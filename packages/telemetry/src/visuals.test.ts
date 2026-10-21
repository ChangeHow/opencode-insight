import { describe, expect, test } from "vitest";
import type { RequestInsight, SeriesPoint, SessionInsight } from "./schema";
import { phaseBreakdown, speedWindow, tokenBreakdown, summarizeSession } from "./summary";

const request = (overrides: Partial<RequestInsight> = {}): RequestInsight => ({
  id: "r1",
  model: "model",
  startedAt: 0,
  firstDeltaAt: 2000,
  streamedAt: 5000,
  endedAt: 6000,
  status: "completed",
  reasoningMode: "hidden",
  capture: "live",
  context: [],
  buckets: [],
  ...overrides,
});
const session = (requests = [request()]): SessionInsight => ({
  version: 1,
  sessionID: "ses_test",
  directory: "/test",
  revision: 1,
  updatedAt: 6000,
  interruptedCapture: false,
  requests,
  tools: [],
});
const point = (at: number, requestID = "r1"): SeriesPoint => ({
  at,
  requestID,
  model: "model",
  outputTps: 12,
  reasoningTps: 0,
  summaryTps: 0,
  quality: "estimated",
});

describe("Insight chart calculations", () => {
  test("filters by elapsed ten minutes, not a point count, including parallel samples", () => {
    const input = Array.from({ length: 1000 }, (_, i) => point(i * 1000));
    input.push(...input.map((p) => ({ ...p, requestID: "parallel" })));
    const result = speedWindow(input, [request({ endedAt: 1000000 })], 9000000);
    expect(result.start).toBe(400000);
    expect(result.end).toBe(1000000);
    expect(result.points).toHaveLength(1200);
    expect(result.points.every((p) => p.at >= result.start && p.at <= result.end)).toBe(true);
  });

  test("advances a live window without new samples and freezes completed sessions", () => {
    const input = [point(1000), point(2000)];
    const running = request({ status: "running", streamedAt: undefined, endedAt: undefined });
    expect(speedWindow(input, [running], 5000).end).toBe(5000);
    expect(speedWindow(input, [running], 700000).points).toEqual([]);
    expect(speedWindow(input, [request()], 700000).end).toBe(6000);
    expect(speedWindow([], []).end).toBeGreaterThanOrEqual(speedWindow([], []).start);
  });

  test("short sessions grow to ten minutes without changing the data or inventing silence", () => {
    const input = [point(1000), point(3000)];
    const before = structuredClone(input);
    const result = speedWindow(input, [request()]);
    expect(result.start).toBe(0);
    expect(result.end).toBe(6000);
    expect(result.points).toEqual(input);
    expect(input).toEqual(before);
  });

  test("partitions model and tools without counting overlap twice or calling hidden time thinking", () => {
    const data = session();
    data.tools = [
      {
        id: "a",
        name: "execute",
        startedAt: 4000,
        endedAt: 7000,
        status: "completed",
        background: false,
      },
      {
        id: "b",
        name: "read",
        startedAt: 6000,
        endedAt: 8000,
        status: "completed",
        background: false,
      },
      {
        id: "c",
        name: "shell",
        startedAt: 0,
        endedAt: 20000,
        status: "completed",
        background: true,
      },
    ];
    const result = phaseBreakdown(data);
    expect(result.phases.map((p) => p.ms)).toEqual([2000, 3000, 0, 0, 3000]);
    expect(result.totalMs).toBe(8000);
    expect(result.totalMs).toBe(summarizeSession(data).foregroundMs);
    expect(result.backgroundMs).toBe(20000);
    expect(result.phases.reduce((sum, p) => sum + p.share, 0)).toBeCloseTo(1);
    expect(result.phases.find((p) => p.id === "tools")?.count).toBe(2);
  });

  test("uses an explicit parallel phase when simultaneous model phases differ", () => {
    const data = session([
      request(),
      request({ id: "r2", startedAt: 1000, firstDeltaAt: 4000, streamedAt: 7000 }),
    ]);
    const result = phaseBreakdown(data);
    expect(result.phases.map((p) => p.ms)).toEqual([2000, 3000, 0, 2000, 0]);
    expect(result.phases.find((p) => p.id === "parallel")?.count).toBe(2);
    expect(result.totalMs).toBe(summarizeSession(data).foregroundMs);
  });

  test("keeps unknown durations unavailable and missing deltas unsplit", () => {
    const data = session([
      request({ firstDeltaAt: undefined }),
      request({
        id: "missing",
        firstDeltaAt: undefined,
        streamedAt: undefined,
        endedAt: undefined,
      }),
    ]);
    data.tools = [
      { id: "t", name: "read", startedAt: 1000, status: "interrupted", background: false },
    ];
    const result = phaseBreakdown(data, 900000);
    expect(result.unknownCount).toBe(2);
    expect(result.phases.find((p) => p.id === "unsplit")?.ms).toBe(5000);
    expect(result.totalMs).toBe(5000);
    expect(result.phases.some((p) => /thinking/i.test(p.label))).toBe(false);
  });

  test("running intervals use current time and zero-length intervals stay zero", () => {
    const data = session([
      request({ status: "running", streamedAt: undefined, endedAt: undefined }),
    ]);
    expect(phaseBreakdown(data, 10000).phases.map((p) => p.ms)).toEqual([2000, 8000, 0, 0, 0]);
    expect(phaseBreakdown(session([request({ streamedAt: 0 })])).totalMs).toBe(0);
    expect(phaseBreakdown(session([])).phases.every((p) => p.share === 0)).toBe(true);
  });

  test("composition percentages use source estimates only and preserve source identities", () => {
    const sources = [
      {
        kind: "skill" as const,
        id: "debug",
        label: "Debug",
        tokens: 10,
        quality: "estimated" as const,
      },
      {
        kind: "tool" as const,
        id: "read",
        label: "read",
        tokens: 20,
        quality: "estimated" as const,
      },
      {
        kind: "skill" as const,
        id: "review",
        label: "Review",
        tokens: 30,
        quality: "estimated" as const,
      },
    ];
    const before = structuredClone(sources);
    const groups = tokenBreakdown(sources);
    expect(groups[0]).toMatchObject({ kind: "skill", tokens: 40, share: 2 / 3 });
    expect(groups[0].items.map((item) => item.id)).toEqual(["debug", "review"]);
    expect(groups[0].color).not.toBe(groups[1].color);
    expect(tokenBreakdown([{ ...sources[0], tokens: 0 }])[0].share).toBe(0);
    expect(sources).toEqual(before);
  });

  test("matches interval-union totals across dense mixed overlaps without mutating snapshots", () => {
    const data = session(
      Array.from({ length: 80 }, (_, index) => {
        const start = (index * 7919) % 30000;
        const end = start + 1000 + ((index * 199) % 4000);
        return request({
          id: `r${index}`,
          startedAt: start,
          streamedAt: end,
          endedAt: end + 1000,
          firstDeltaAt: index % 3 ? start + 500 : undefined,
        });
      }),
    );
    data.tools = Array.from({ length: 80 }, (_, index) => ({
      id: `t${index}`,
      name: "execute",
      status: "completed" as const,
      startedAt: (index * 1237) % 40000,
      endedAt: ((index * 1237) % 40000) + 2000,
      background: index % 4 === 0,
    }));
    const before = structuredClone(data);
    const result = phaseBreakdown(data);
    const summary = summarizeSession(data);
    expect(result.totalMs).toBe(summary.foregroundMs);
    expect(result.backgroundMs).toBe(summary.backgroundToolMs);
    expect(result.phases.reduce((sum, phase) => sum + phase.ms, 0)).toBe(result.totalMs);
    expect(data).toEqual(before);
  });
});
