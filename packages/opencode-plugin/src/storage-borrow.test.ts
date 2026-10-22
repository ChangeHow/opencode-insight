import { describe, expect, test } from "vitest";
import type { SessionInsight } from "@opencode-insight/telemetry";
import { storageBorrow } from "./storage-borrow";

describe("serialized storage view", () => {
  test("matches persisted JSON while borrowing known telemetry without copying its leaves", () => {
    const session: SessionInsight = {
      version: 1,
      sessionID: "s1",
      directory: "/a",
      parentID: undefined,
      updatedAt: 1,
      revision: 1,
      interruptedCapture: false,
      requests: [
        {
          id: "r1",
          model: "fixture/model",
          status: "running",
          startedAt: 1,
          firstDeltaAt: undefined,
          streamedAt: undefined,
          endedAt: undefined,
          reasoningMode: "unknown",
          usage: undefined,
          cost: undefined,
          capture: "live",
          buckets: [{ at: 1, output: 1, reasoning: 0, summary: 0 }],
          context: [{ kind: "user", id: "u1", label: "user", tokens: 2, quality: "estimated" }],
        },
      ],
      tools: [
        {
          id: "t1",
          name: "fixture",
          requestID: undefined,
          parentID: undefined,
          startedAt: 1,
          endedAt: undefined,
          status: "running",
          background: false,
          resultTokens: undefined,
          reportedCalls: undefined,
          reportedCallsTruncated: undefined,
        },
      ],
    };
    const expected = JSON.parse(JSON.stringify(session));
    const context = session.requests[0].context;
    const view = storageBorrow(session);
    expect(view).toBe(session);
    expect(session.requests[0].context).toBe(context);
    expect(view).toStrictEqual(expected);
  });
});
