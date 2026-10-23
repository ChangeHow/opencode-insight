import type { SessionInsight } from "@opencode-insight/telemetry";
import { describe, expect, test } from "vitest";
import { snapshot } from "./snapshot";

describe("RPC snapshot", () => {
  test("matches JSON persistence and detaches all nested telemetry from later updates", () => {
    const session: SessionInsight = {
      version: 1,
      sessionID: "s1",
      parentID: undefined,
      directory: "/project",
      updatedAt: 4000,
      revision: 3,
      requests: [
        {
          id: "r1",
          model: "openai/gpt-5",
          startedAt: 1000,
          firstDeltaAt: 1100,
          streamedAt: 2000,
          endedAt: 3000,
          status: "completed",
          reasoningMode: "summary",
          usage: { input: 20, output: 10, reasoning: 5, cacheRead: 2, cacheWrite: 0 },
          cost: 0.01,
          buckets: [{ at: 1000, output: 10, reasoning: 0, summary: 3 }],
          context: [
            { kind: "system", id: "base", label: "System", tokens: 12, quality: "estimated" },
            { kind: "tool", id: "t1", label: "shell", tokens: 8, quality: "reported" },
          ],
          capture: "live",
        },
        {
          id: "r2",
          model: "openai/gpt-5",
          startedAt: 4000,
          endedAt: undefined,
          usage: undefined,
          status: "running",
          reasoningMode: "unknown",
          buckets: [],
          context: [],
          capture: "partial",
        },
      ],
      tools: [
        {
          id: "t1",
          name: "codemode",
          requestID: "r1",
          startedAt: 1200,
          endedAt: 1900,
          status: "completed",
          background: false,
          resultTokens: 8,
          reportedCalls: [{ name: "shell", status: "completed" }],
          reportedCallsTruncated: true,
        },
        {
          id: "t2",
          name: "shell",
          requestID: "r2",
          parentID: "t1",
          startedAt: 4000,
          endedAt: undefined,
          status: "running",
          background: true,
          reportedCalls: undefined,
        },
      ],
      interruptedCapture: true,
    };
    const serialized = JSON.stringify(session);
    const expected = JSON.parse(serialized);
    const result = snapshot(session);

    expect(result).toStrictEqual(expected);
    // Comparing serialization also checks property order and omission of undefined keys.
    expect(JSON.stringify(result)).toBe(serialized);

    session.revision++;
    session.requests[0].usage!.input = 99;
    session.requests[0].buckets[0].output = 99;
    session.requests[0].buckets.push({ at: 2000, output: 1, reasoning: 0, summary: 0 });
    session.requests[0].context[0].tokens = 99;
    session.requests[0].context.pop();
    session.requests[1].endedAt = 5000;
    session.requests.reverse();
    session.tools[0].reportedCalls![0].status = "error";
    session.tools[0].reportedCalls!.push({ name: "read", status: "running" });
    session.tools[1].background = false;
    session.tools.pop();

    expect(result).toStrictEqual(expected);
  });
});
