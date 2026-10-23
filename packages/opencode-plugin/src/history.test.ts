import { describe, expect, test } from "vitest";
import { seedHistory } from "./history";
import { summarizeSession, type SessionInsight } from "@opencode-insight/telemetry";

describe("persisted V2 history", () => {
  test("recovers native usage and timing without inventing token arrival or retaining text", () => {
    const snapshot: SessionInsight = {
      version: 1,
      sessionID: "ses_old",
      directory: "/project",
      updatedAt: 9000,
      revision: 0,
      requests: [],
      tools: [],
      interruptedCapture: true,
    };
    const messages = [
      {
        type: "assistant",
        id: "msg_old",
        agent: "build",
        model: { providerID: "openai", id: "gpt-5" },
        time: { created: 1000, streamed: 4000, completed: 6000 },
        cost: 0.03,
        tokens: { input: 10, output: 20, reasoning: 30, cache: { read: 40, write: 0 } },
        content: [
          { type: "text", text: "PRIVATE_TEXT" },
          {
            type: "tool",
            id: "tool_old",
            name: "shell",
            time: { created: 4000, ran: 4001, completed: 6000 },
            state: {
              status: "completed",
              input: { background: true, command: "PRIVATE_COMMAND" },
              content: [{ type: "text", text: "PRIVATE_RESULT" }],
            },
          },
        ],
      },
    ] as Parameters<typeof seedHistory>[1];
    expect(seedHistory(snapshot, messages)).toBe(true);
    expect(seedHistory(snapshot, messages)).toBe(false);
    expect(snapshot.requests).toHaveLength(1);
    expect(snapshot.requests[0].buckets).toEqual([]);
    expect(snapshot.requests[0].context).toEqual([]);
    expect(snapshot.tools[0].background).toBe(true);
    expect(summarizeSession(snapshot)).toMatchObject({
      usage: { input: 10, output: 20, reasoning: 30, cacheRead: 40, cacheWrite: 0 },
      capturePartial: true,
      cost: 0.03,
      modelMs: 3000,
      foregroundMs: 3000,
    });
    expect(JSON.stringify(snapshot)).not.toContain("PRIVATE");
  });

  test("recovers reported Code Mode calls from native tool metadata", () => {
    const snapshot: SessionInsight = {
      version: 1,
      sessionID: "ses_code",
      directory: "/project",
      updatedAt: 9000,
      revision: 0,
      requests: [],
      tools: [],
      interruptedCapture: true,
    };
    const messages = [
      {
        type: "assistant",
        id: "msg_code",
        agent: "build",
        model: { providerID: "openai", id: "gpt-5" },
        time: { created: 1000, streamed: 2000, completed: 3000 },
        content: [
          {
            type: "tool",
            id: "tool_code",
            name: "execute",
            time: { created: 2000, ran: 2001, completed: 3000 },
            state: {
              status: "completed",
              input: { code: "PRIVATE_CODE" },
              content: [{ type: "text", text: "PRIVATE_RESULT" }],
              metadata: {
                toolCalls: [
                  {
                    tool: "files.read_text_file",
                    status: "completed",
                    input: { path: "PRIVATE_PATH" },
                  },
                ],
              },
            },
          },
        ],
      },
    ] as Parameters<typeof seedHistory>[1];
    expect(seedHistory(snapshot, messages)).toBe(true);
    expect(snapshot.tools).toHaveLength(1);
    expect(snapshot.tools[0].reportedCalls).toEqual([
      { name: "files.read_text_file", status: "completed" },
    ]);
    expect(JSON.stringify(snapshot)).not.toContain("PRIVATE");
  });
});
