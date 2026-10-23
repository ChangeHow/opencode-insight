import { describe, expect, test } from "vitest";
import {
  buildSeries,
  estimateTokens,
  requestTps,
  summarizeSession,
  type RequestInsight,
  type SessionInsight,
} from "./index";

const usage = { input: 20, output: 30, reasoning: 10, cacheRead: 4, cacheWrite: 2 };
function request(overrides: Partial<RequestInsight> = {}): RequestInsight {
  return {
    id: "r1",
    model: "openai/gpt-5",
    startedAt: 0,
    streamedAt: 4000,
    endedAt: 10000,
    status: "completed",
    reasoningMode: "hidden",
    usage,
    cost: 0.1,
    context: [],
    capture: "live",
    buckets: [],
    ...overrides,
  };
}
function session(requests: RequestInsight[] = [request()]): SessionInsight {
  return {
    version: 1,
    sessionID: "s1",
    directory: "/test",
    updatedAt: 10000,
    revision: 7,
    interruptedCapture: false,
    requests,
    tools: [],
  };
}

describe("telemetry engine", () => {
  test("uses cached BPE rather than character counts and handles special-token text", () => {
    expect(estimateTokens("hello world")).toBe(2);
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("<|endoftext|>")).toBeGreaterThan(0);
    expect(estimateTokens("你好吗 world")).toBeGreaterThan(2);
    expect(estimateTokens("a".repeat(200000))).toBeGreaterThan(0);
  });

  test("uses provider stream boundary, not tool settlement or first token", () => {
    expect(requestTps(request({ firstDeltaAt: 3000 }))).toBe(10);
    expect(requestTps(request({ usage: { ...usage, output: 0, reasoning: 0 } }))).toBe(0);
    expect(requestTps(request({ usage: undefined }))).toBeUndefined();
    expect(requestTps(request({ streamedAt: 0 }))).toBeUndefined();
    expect(requestTps(request({ status: "running" }))).toBeUndefined();
  });

  test("smooths 1-second buckets over a rolling window, including silence", () => {
    const s = session([
      request({
        streamedAt: 6000,
        reasoningMode: "summary",
        buckets: [
          { at: 0, output: 10, reasoning: 0, summary: 5 },
          { at: 2000, output: 20, reasoning: 0, summary: 0 },
        ],
      }),
    ]);
    const points = buildSeries(s, { sessionID: "s1" }).points;
    expect(points.map((p) => p.outputTps)).toEqual([10, 5, 10, 7.5, 6, 4, 4]);
    expect(points.every((p) => p.reasoningTps === 0)).toBe(true);
    expect(points[0].summaryTps).toBe(5);
    expect(points[0].requestTps).toBeCloseTo(40 / 6);
    const raw = buildSeries(s, { sessionID: "s1", windowMs: 1000 }).points;
    expect(raw.map((p) => p.outputTps)).toEqual([10, 0, 20, 0, 0, 0, 0]);
  });

  test("revision cursor is not a timestamp and stale cursors receive the full series", () => {
    const s = session();
    s.requests[0].buckets = [{ at: 0, output: 5, reasoning: 0, summary: 0 }];
    expect(buildSeries(s, { sessionID: "s1", after: 7 })).toEqual({
      revision: 7,
      unchanged: true,
      points: [],
    });
    expect(buildSeries(s, { sessionID: "s1", after: 6 }).unchanged).toBe(false);
    expect(buildSeries(s, { sessionID: "s1", after: 999 }).points).toHaveLength(5);
  });

  test("does not fabricate hidden reasoning or derive usage from summary estimates", () => {
    const r = request({ buckets: [{ at: 0, output: 2, reasoning: 0, summary: 15 }] });
    const s = session([r]);
    expect(summarizeSession(s).usage).toEqual(usage);
    expect(buildSeries(s, { sessionID: "s1" }).points.every((p) => p.reasoningTps === 0)).toBe(
      true,
    );
    r.usage = undefined;
    expect(summarizeSession(s).usage.output).toBe(0);
    expect(summarizeSession(s).capturePartial).toBe(true);
    expect(buildSeries(s, { sessionID: "s1" }).points[0].quality).toBe("partial");
  });

  test("unions overlapping intervals and excludes background lifespans from foreground", () => {
    const s = session([request(), request({ id: "r2", startedAt: 2000, streamedAt: 6000 })]);
    s.tools = [
      {
        id: "t1",
        name: "a",
        startedAt: 3000,
        endedAt: 8000,
        status: "completed",
        background: false,
      },
      {
        id: "t2",
        name: "b",
        startedAt: 5000,
        endedAt: 20000,
        status: "completed",
        background: true,
      },
      {
        id: "t3",
        name: "c",
        startedAt: 7000,
        endedAt: 9000,
        status: "completed",
        background: false,
      },
    ];
    const before = structuredClone(s);
    const summary = summarizeSession(s);
    expect(summary.modelMs).toBe(6000);
    expect(summary.toolMs).toBe(17000);
    expect(summary.foregroundMs).toBe(9000);
    expect(summary.backgroundToolMs).toBe(15000);
    expect(summary.usage.output).toBe(60);
    expect(summary.cost).toBe(0.2);
    // Official TUI throughput sums request durations, even when request intervals overlap.
    expect(summary.tps).toBeCloseTo(80 / 8);
    expect(s).toEqual(before);
  });

  test("weights session TPS by duration instead of averaging per-step TPS", () => {
    const s = session([
      request({ streamedAt: 1000 }),
      request({ id: "r2", startedAt: 1000, streamedAt: 10000 }),
    ]);
    expect(summarizeSession(s).tps).toBe(8);
  });

  test("cumulative context sums request snapshots by kind and identity", () => {
    const source = {
      kind: "system" as const,
      id: "base",
      label: "System",
      tokens: 5,
      quality: "estimated" as const,
    };
    const s = session([
      request({ context: [source] }),
      request({ id: "r2", context: [{ ...source, tokens: 8 }] }),
    ]);
    const summary = summarizeSession(s);
    expect(summary.currentContext[0].tokens).toBe(8);
    expect(summary.cumulativeContext[0].tokens).toBe(13);
    expect(source.tokens).toBe(5);
  });

  test("interruptions do not accumulate time through downtime and rendering is bounded", () => {
    const s = session([
      request({
        status: "interrupted",
        streamedAt: undefined,
        endedAt: 2000,
        capture: "partial",
        buckets: [{ at: 0, output: 2, reasoning: 0, summary: 0 }],
      }),
    ]);
    expect(summarizeSession(s, 1e12).modelMs).toBe(2000);
    expect(buildSeries(s, { sessionID: "s1" }, 1e12).points).toHaveLength(3);
    s.requests[0].status = "running";
    s.requests[0].endedAt = undefined;
    expect(buildSeries(s, { sessionID: "s1" }, 1e12).points).toHaveLength(10000);
  });

  test("does not invent a speed curve without captured samples and ages live rolling windows", () => {
    const s = session();
    expect(buildSeries(s, { sessionID: "s1" }).points).toEqual([]);
    const r = s.requests[0];
    r.status = "running";
    r.streamedAt = undefined;
    r.endedAt = undefined;
    r.buckets = [{ at: 0, output: 20, reasoning: 0, summary: 0 }];
    const series = buildSeries(s, { sessionID: "s1", after: s.revision }, 8000);
    expect(series.unchanged).toBe(false);
    expect(series.points.at(-1)?.outputTps).toBe(0);
    r.status = "interrupted";
    expect(buildSeries(s, { sessionID: "s1" }, 1e12).points).toHaveLength(1);
  });
});
