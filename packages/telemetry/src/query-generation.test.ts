import { describe, expect, test } from "vitest";
import type { RequestInsight, SessionInsight } from "./schema";
import {
  buildGenerationWindow,
  advanceGenerationWindow,
  generationStageSchema,
  generationWindowSchema,
  MAX_GENERATION_STAGES,
} from "./query-generation";

function request(overrides: Partial<RequestInsight> = {}): RequestInsight {
  return {
    id: "a",
    model: "gpt",
    startedAt: 1000,
    firstDeltaAt: 4000,
    streamedAt: 5000,
    endedAt: 6000,
    status: "completed",
    reasoningMode: "hidden",
    usage: { input: 100, output: 20, reasoning: 60, cacheRead: 0, cacheWrite: 0 },
    buckets: [],
    context: [],
    capture: "partial",
    ...overrides,
  };
}

function session(requests: RequestInsight[]): SessionInsight {
  return {
    version: 1,
    sessionID: "s",
    directory: "/project",
    revision: 1,
    updatedAt: 0,
    interruptedCapture: false,
    requests,
    tools: [],
  };
}

describe("bounded generation window", () => {
  test("estimates observed live output and reasoning, then replaces the same request with reported usage", () => {
    const live = request({
      status: "running",
      capture: "live",
      firstDeltaAt: undefined,
      streamedAt: undefined,
      endedAt: undefined,
      usage: undefined,
    });
    const input = session([live]);
    expect(buildGenerationWindow(input, undefined, 3000).tps).toBeUndefined();
    live.firstDeltaAt = 4000;
    live.reasoningMode = "summary";
    live.buckets = [{ at: 4000, output: 0, reasoning: 0, summary: 900 }];
    expect(buildGenerationWindow(input, undefined, 5000).tps).toBeUndefined();
    live.buckets.push({ at: 5000, output: 0, reasoning: 80, summary: 0 });
    live.reasoningMode = "visible";
    const estimated = buildGenerationWindow(input, undefined, 9000);
    expect(estimated).toMatchObject({ tps: 10, estimated: true, unavailableCount: 0 });
    expect(estimated.stages).toHaveLength(1);
    expect(estimated.stages[0]).toMatchObject({
      requestID: "a",
      tps: 10,
      estimated: true,
      output: 0,
      reasoning: 80,
      durationMs: 8000,
    });
    expect(generationWindowSchema.parse(estimated)).toEqual(estimated);
    // Partial capture also marks bucket eviction/stream limits; never sum a retained tail as a full request.
    live.capture = "partial";
    expect(buildGenerationWindow(input, undefined, 9000).tps).toBeUndefined();
    live.capture = "live";
    live.buckets.push({ at: 9000, output: 20, reasoning: 0, summary: 0 });
    expect(buildGenerationWindow(input, undefined, 11000).tps).toBe(10);
    live.status = "completed";
    live.streamedAt = 11000;
    live.usage = { input: 100, output: 40, reasoning: 160, cacheRead: 0, cacheWrite: 0 };
    const reported = buildGenerationWindow(input, undefined, 12000);
    expect(reported.stages).toHaveLength(1);
    expect(reported.stages[0]).toMatchObject({
      requestID: "a",
      tps: 20,
      output: 40,
      reasoning: 160,
    });
    expect(reported.stages[0].estimated).toBeUndefined();
    expect(reported.tps).toBe(20);
    expect(reported.estimated).toBeUndefined();
    const aged = advanceGenerationWindow(estimated, 900000);
    expect(aged.stages).toEqual([]);
    expect(aged.tps).toBeUndefined();
    expect(aged.estimated).toBeUndefined();
  });

  test("uses the last fifteen wall-clock minutes and preserves full cross-boundary request means", () => {
    const input = session([
      request({ id: "expired", startedAt: 100000, streamedAt: 200000 }),
      request({ id: "crossing", startedAt: 1000000, streamedAt: 1200000 }),
      request({ id: "recent", startedAt: 1900000, streamedAt: 1910000 }),
    ]);
    const result = buildGenerationWindow(input, undefined, 2000000);
    expect(result).toMatchObject({ start: 1100000, end: 2000000, durationMs: 900000 });
    expect(result.stages.map(({ requestID }) => requestID)).toEqual(["crossing", "recent"]);
    expect(result.stages[0]).toMatchObject({
      start: 1000000,
      end: 1200000,
      durationMs: 200000,
      tps: 0.4,
    });
    expect(result.tps).toBeCloseTo(160 / 210);
    const expired = buildGenerationWindow(input, undefined, 3000000);
    expect(expired).toMatchObject({ start: 2100000, end: 3000000, stages: [] });
    expect(expired.tps).toBeUndefined();
  });

  test("bounds dense recent activity honestly without filling empty or short windows", () => {
    const requests = Array.from({ length: 41 }, (_, i) =>
      request({ id: String(i), startedAt: i * 1000, streamedAt: i * 1000 + 500 }),
    );
    const dense = buildGenerationWindow(session(requests), undefined, 50000);
    expect(dense).toMatchObject({ start: -850000, end: 50000, partial: true });
    expect(dense.stages).toHaveLength(40);
    expect(buildGenerationWindow(session([]), undefined, 50000)).toMatchObject({
      start: -850000,
      end: 50000,
      durationMs: 900000,
      stages: [],
    });
  });

  test("retains real tool/idle spacing, first-token latency and reasoning", () => {
    const first = request();
    const second = request({
      id: "b",
      startedAt: 101000,
      firstDeltaAt: 104000,
      streamedAt: 105000,
      endedAt: 106000,
    });
    const input = session([second, first]);
    input.tools = [
      {
        id: "tool",
        name: "shell",
        startedAt: 6000,
        endedAt: 100000,
        status: "completed",
        background: false,
      },
    ];
    const result = buildGenerationWindow(input, undefined, 106000);
    expect(
      result.stages.map(({ requestID, offsetMs, durationMs, tps, output, reasoning }) => ({
        requestID,
        offsetMs,
        durationMs,
        tps,
        output,
        reasoning,
      })),
    ).toEqual([
      { requestID: "a", offsetMs: 795000, durationMs: 4000, tps: 20, output: 20, reasoning: 60 },
      { requestID: "b", offsetMs: 895000, durationMs: 4000, tps: 20, output: 20, reasoning: 60 },
    ]);
    expect(result).toMatchObject({ durationMs: 900000, tps: 20, unavailableCount: 0 });
    expect(generationWindowSchema.parse(result)).toEqual(result);
    expect(generationStageSchema.parse(result.stages[0])).toEqual(result.stages[0]);
    expect(input.requests.map(({ id }) => id)).toEqual(["b", "a"]);
  });

  test("recovers reported historical averages without buckets and weights overlapping request durations", () => {
    const result = buildGenerationWindow(
      session([request(), request({ id: "overlap", startedAt: 2000, streamedAt: 10000 })]),
      undefined,
      10000,
    );
    expect(result.stages.map(({ offsetMs, tps }) => ({ offsetMs, tps }))).toEqual([
      { offsetMs: 891000, tps: 20 },
      { offsetMs: 892000, tps: 10 },
    ]);
    expect(result.durationMs).toBe(900000);
    expect(result.tps).toBeCloseTo(160 / 12);
  });

  test("keeps unmeasurable requests unknown without inventing stages or zero rates", () => {
    const result = buildGenerationWindow(
      session([
        request({ id: "running", status: "running", streamedAt: undefined, endedAt: undefined }),
        request({ id: "missing", usage: undefined }),
        request({
          id: "interrupted",
          status: "interrupted",
          streamedAt: undefined,
          endedAt: undefined,
        }),
        request({ id: "zero", streamedAt: 1000 }),
        request({ id: "stale", streamedAt: 500, endedAt: 6000 }),
        request({
          id: "error",
          status: "error",
          capture: "live",
          buckets: [{ at: 4000, output: 20, reasoning: 80, summary: 0 }],
        }),
        request({
          id: "known-interrupted",
          status: "interrupted",
          streamedAt: undefined,
          capture: "live",
          buckets: [{ at: 4000, output: 20, reasoning: 80, summary: 0 }],
        }),
      ]),
      undefined,
      9000,
    );
    expect(result.stages.map(({ requestID, durationMs }) => ({ requestID, durationMs }))).toEqual([
      { requestID: "running", durationMs: 8000 },
      { requestID: "missing", durationMs: 4000 },
      { requestID: "error", durationMs: 4000 },
      { requestID: "known-interrupted", durationMs: 5000 },
    ]);
    expect(result.stages.every(({ tps }) => tps === undefined)).toBe(true);
    expect(result.stages.find(({ requestID }) => requestID === "missing")?.output).toBeUndefined();
    expect(result).toMatchObject({ durationMs: 900000, unavailableCount: 7 });
    expect(result.tps).toBeUndefined();
    expect(buildGenerationWindow(session([]), undefined, 9000)).toEqual({
      start: -891000,
      end: 9000,
      partial: false,
      durationMs: 900000,
      stages: [],
      tps: undefined,
      unavailableCount: 0,
    });
  });

  test("selects the latest forty requests before omitting unknown duration and preserves tie order", () => {
    expect(MAX_GENERATION_STAGES).toBe(40);
    const requests = Array.from({ length: 41 }, (_, index) =>
      request({
        id: String(index),
        startedAt: index * 10000,
        streamedAt: index * 10000 + 4000,
      }),
    );
    requests.push(
      request({
        id: "unknown",
        startedAt: 400000,
        streamedAt: undefined,
        endedAt: undefined,
        status: "interrupted",
      }),
    );
    const result = buildGenerationWindow(session(requests.reverse()), undefined, 410000);
    expect(result.stages).toHaveLength(39);
    expect(result.stages[0].requestID).toBe("2");
    expect(result.stages.at(-1)?.requestID).toBe("40");
    expect(result.unavailableCount).toBe(1);
    const tied = buildGenerationWindow(
      session([request({ id: "second" }), request({ id: "first" })]),
      undefined,
      10000,
    );
    expect(tied.stages.map(({ requestID }) => requestID)).toEqual(["second", "first"]);
  });

  test("filters intersecting requests before bounding and retains their entire duration and usage", () => {
    const requests = [
      request({ id: "ends-at-from", startedAt: 0, streamedAt: 2000 }),
      request(),
      request({
        id: "unknown-in-range",
        startedAt: 3000,
        streamedAt: undefined,
        endedAt: undefined,
        status: "interrupted",
      }),
      request({ id: "starts-at-to", startedAt: 4000, streamedAt: 6000 }),
      ...Array.from({ length: 41 }, (_, index) =>
        request({
          id: `later-${index}`,
          startedAt: 10000 + index * 10000,
          streamedAt: 14000 + index * 10000,
        }),
      ),
    ];
    const result = buildGenerationWindow(session(requests), { from: 2000, to: 4000 });
    expect(result.stages).toHaveLength(1);
    expect(result.stages[0]).toMatchObject({
      requestID: "a",
      start: 1000,
      end: 5000,
      durationMs: 4000,
      offsetMs: -1000,
      tps: 20,
      output: 20,
      reasoning: 60,
    });
    expect(result).toMatchObject({ durationMs: 2000, tps: 20, unavailableCount: 1 });
  });
});
