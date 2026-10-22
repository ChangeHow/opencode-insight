import { describe, expect, test } from "vitest";
import type { SessionInsight } from "./schema";
import { speedModel } from "../../openchamber-extension/src/panel/speed-model";
import { buildSpeedWindow, speedWindowInputSchema, speedWindowSchema } from "./queries";

function fixture(): SessionInsight {
  return {
    version: 1,
    sessionID: "s",
    directory: "/project",
    revision: 1,
    updatedAt: 0,
    interruptedCapture: false,
    tools: [{ id: "t", name: "shell", startedAt: 1, status: "running", background: true }],
    requests: [
      {
        id: "a",
        model: "m",
        startedAt: 0,
        endedAt: 16000,
        streamedAt: 16000,
        status: "completed",
        reasoningMode: "unknown",
        capture: "live",
        context: [],
        buckets: [{ at: 1000, output: 30, reasoning: 99, summary: 100 }],
      },
      {
        id: "b",
        model: "m",
        startedAt: 20000,
        firstDeltaAt: 31000,
        status: "running",
        reasoningMode: "unknown",
        capture: "partial",
        context: [],
        buckets: [],
      },
    ],
  };
}

describe("bounded speed window", () => {
  test("matches the legacy clock, raw counts, gray states and cross-window activity", () => {
    const session = fixture();
    for (const now of [1000, 15000, 45000, 900000]) {
      const old = speedModel(session, now);
      const result = buildSpeedWindow(session, undefined, now);
      expect(result).toEqual({ sessionID: "s", directory: "/project", revision: 1, ...old });
      expect(result.buckets.length).toBeLessThanOrEqual(40);
      expect(speedWindowSchema.parse(result)).toEqual(result);
    }
    session.tools = [];
    expect(
      buildSpeedWindow(session, undefined, 45000).buckets.map((bucket) => bucket.state),
    ).toEqual(["output", "waiting", "unobserved"]);
  });

  test("freezes completed sessions after the final bucket and handles unknown and zero duration", () => {
    const session = fixture();
    session.tools[0] = { ...session.tools[0], status: "completed", endedAt: 1 };
    session.requests[1] = { ...session.requests[1], status: "interrupted" };
    for (const now of [16000, 30000, 999999]) {
      const result = buildSpeedWindow(session, undefined, now);
      expect(result).toEqual({
        sessionID: "s",
        directory: "/project",
        revision: 1,
        ...speedModel(session, now),
      });
    }
  });

  test("validates bounded ranges and returns only complete observed-range buckets", () => {
    for (const input of [
      { from: 0 },
      { from: 0, to: 600001 },
      { from: 1, to: 1 },
      { from: 0, to: Infinity },
    ]) {
      expect(speedWindowInputSchema.safeParse({ sessionID: "s", ...input }).success).toBe(false);
    }
    const result = buildSpeedWindow(fixture(), { sessionID: "s", from: -30000, to: 44000 }, 60000);
    expect(result.buckets.map((bucket) => bucket.start)).toEqual([0, 15000]);
    expect(result.buckets[1].state).toBe("tools");
  });
});
