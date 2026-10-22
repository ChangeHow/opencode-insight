import { describe, expect, test } from "vitest";
import type { RequestInsight, SessionInsight } from "./schema";
import {
  buildGenerationWindow,
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
  test("compresses inter-request tool/idle time but retains first-token latency and reasoning", () => {
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
    const result = buildGenerationWindow(input);
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
      { requestID: "a", offsetMs: 0, durationMs: 4000, tps: 20, output: 20, reasoning: 60 },
      { requestID: "b", offsetMs: 4000, durationMs: 4000, tps: 20, output: 20, reasoning: 60 },
    ]);
    expect(result).toMatchObject({ durationMs: 8000, tps: 20, unavailableCount: 0 });
    expect(generationWindowSchema.parse(result)).toEqual(result);
    expect(generationStageSchema.parse(result.stages[0])).toEqual(result.stages[0]);
    expect(input.requests.map(({ id }) => id)).toEqual(["b", "a"]);
  });

  test("recovers reported historical averages without buckets and weights overlapping request durations", () => {
    const result = buildGenerationWindow(
      session([request(), request({ id: "overlap", startedAt: 2000, streamedAt: 10000 })]),
    );
    expect(result.stages.map(({ offsetMs, tps }) => ({ offsetMs, tps }))).toEqual([
      { offsetMs: 0, tps: 20 },
      { offsetMs: 4000, tps: 10 },
    ]);
    expect(result.durationMs).toBe(12000);
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
        request({ id: "error", status: "error" }),
        request({ id: "known-interrupted", status: "interrupted", streamedAt: undefined }),
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
    expect(result).toMatchObject({ durationMs: 21000, unavailableCount: 7 });
    expect(result.tps).toBeUndefined();
    expect(buildGenerationWindow(session([]))).toEqual({
      durationMs: 0,
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
    const result = buildGenerationWindow(session(requests.reverse()));
    expect(result.stages).toHaveLength(39);
    expect(result.stages[0].requestID).toBe("2");
    expect(result.stages.at(-1)?.requestID).toBe("40");
    expect(result.unavailableCount).toBe(1);
    const tied = buildGenerationWindow(
      session([request({ id: "second" }), request({ id: "first" })]),
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
      offsetMs: 0,
      tps: 20,
      output: 20,
      reasoning: 60,
    });
    expect(result).toMatchObject({ durationMs: 4000, tps: 20, unavailableCount: 1 });
  });
});
