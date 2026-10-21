import type { SessionInsightPayload } from "@opencode-dashboard/shared";

export function makeMockSessionInsight(sessionID = "ses_native"): SessionInsightPayload {
  const start = new Date("2026-07-11T12:00:00.000Z").getTime();
  return {
    session: {
      version: 1,
      sessionID,
      directory: "/project",
      updatedAt: start + 5000,
      revision: 3,
      interruptedCapture: false,
      requests: [
        {
          id: "request_native",
          model: "test-model",
          startedAt: start,
          firstDeltaAt: start + 500,
          streamedAt: start + 4000,
          endedAt: start + 5000,
          status: "completed",
          reasoningMode: "visible",
          capture: "live",
          usage: { input: 100, output: 20, reasoning: 12, cacheRead: 50, cacheWrite: 0 },
          context: [
            {
              kind: "system",
              id: "system",
              label: "System instructions",
              tokens: 20,
              quality: "estimated",
            },
            {
              kind: "skill",
              id: "skill_debug",
              label: "Debugging",
              tokens: 30,
              quality: "estimated",
            },
            { kind: "tool", id: "shell", label: "shell", tokens: 50, quality: "estimated" },
          ],
          buckets: [
            { at: start, output: 4, reasoning: 2, summary: 0 },
            { at: start + 1000, output: 8, reasoning: 4, summary: 0 },
          ],
        },
      ],
      tools: [
        {
          id: "tool_native",
          name: "shell",
          requestID: "request_native",
          startedAt: start + 4000,
          endedAt: start + 5000,
          status: "completed",
          background: false,
        },
      ],
    },
    series: {
      revision: 3,
      unchanged: false,
      points: [
        {
          at: start,
          requestID: "request_native",
          model: "test-model",
          outputTps: 4,
          reasoningTps: 2,
          summaryTps: 0,
          requestTps: 8,
          quality: "estimated",
        },
        {
          at: start + 1000,
          requestID: "request_native",
          model: "test-model",
          outputTps: 6,
          reasoningTps: 3,
          summaryTps: 0,
          requestTps: 8,
          quality: "estimated",
        },
      ],
    },
  };
}
