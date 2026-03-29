import { describe, expect, test } from "vitest";
import { buildMessagePayloads } from "../services/messages";

describe("message payload builder", () => {
  test("builds analytics and message list from runtime query results", async () => {
    const sessionId = "ses_runtime";
    const messageRows = [
      {
        id: "msg_user",
        session_id: sessionId,
        data: JSON.stringify({
          role: "user",
          time: { created: 1_700_000_000_000 },
        }),
      },
      {
        id: "msg_assistant",
        session_id: sessionId,
        data: JSON.stringify({
          role: "assistant",
          time: { created: 1_700_000_010_000, completed: 1_700_000_020_000 },
          modelID: "glm-5.1",
          providerID: "zai-coding-plan",
          cost: 0.25,
          tokens: {
            input: 100,
            output: 40,
            reasoning: 5,
            cache: { read: 20, write: 0 },
          },
          finish: "stop",
        }),
      },
    ];

    const partRows = [
      {
        id: "part_text",
        message_id: "msg_assistant",
        data: JSON.stringify({
          type: "text",
          text: "hello",
          time: { start: 1_700_000_010_000, end: 1_700_000_011_000 },
        }),
      },
      {
        id: "part_tool",
        message_id: "msg_assistant",
        data: JSON.stringify({
          type: "tool",
          tool: "read",
          callID: "call_1",
          state: {
            status: "completed",
            input: { file: "foo.ts" },
            output: { ok: true },
            title: "Read file",
            time: { start: 1_700_000_012_000, end: 1_700_000_013_000 },
          },
          time: { start: 1_700_000_012_000, end: 1_700_000_013_000 },
        }),
      },
    ];

    const payloads = await buildMessagePayloads("/tmp/missing.db", sessionId, {
      queryMessages: async () => messageRows,
      queryParts: async () => partRows,
    });

    expect(payloads.overview.totalMessages).toBe(2);
    expect(payloads.overview.timeline).toHaveLength(2);
    expect(payloads.overview.timeline[1]?.cumulativeTokens).toBe(165);
    expect(payloads.overview.toolUsage).toEqual([{ tool: "read", count: 1, totalTokens: 165 }]);

    expect(payloads.distribution.totalMessages).toBe(2);
    expect(payloads.distribution.points[1]).toMatchObject({
      messageId: "msg_assistant",
      role: "assistant",
      modelId: "glm-5.1",
      providerId: "zai-coding-plan",
      tokens: {
        input: 100,
        output: 40,
        reasoning: 5,
        cacheRead: 20,
        cacheWrite: 0,
      },
    });

    const page = payloads.listFn(0, 10);
    expect(page.total).toBe(2);
    expect(page.messages[1]).toMatchObject({
      id: "msg_assistant",
      parts: [
        { type: "text", text: "hello" },
        { type: "tool", toolName: "read", status: "completed", title: "Read file" },
      ],
    });
  });
});
