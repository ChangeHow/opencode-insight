import { describe, expect, test } from "vitest";
import type { ContextSource, SessionInsight } from "./schema";
import { summarizeSession, tokenBreakdown, phaseBreakdown } from "./summary";
import { buildOverview, overviewSchema } from "./queries";

const source: ContextSource = {
  kind: "user",
  id: "same",
  label: "User",
  tokens: 20,
  quality: "estimated",
};
function fixture(): SessionInsight {
  return {
    version: 1,
    sessionID: "s",
    directory: "/project",
    updatedAt: 1000,
    revision: 2,
    interruptedCapture: false,
    tools: [],
    requests: [
      {
        id: "a",
        model: "m",
        startedAt: 0,
        streamedAt: 100,
        endedAt: 200,
        status: "completed",
        reasoningMode: "unknown",
        capture: "live",
        buckets: [],
        context: [source],
        usage: { input: 20, output: 10, reasoning: 2, cacheRead: 3, cacheWrite: 4 },
        cost: 0,
      },
      {
        id: "b",
        model: "m",
        startedAt: 300,
        status: "running",
        reasoningMode: "unknown",
        capture: "partial",
        buckets: [],
        context: [
          { ...source, quality: "reported" },
          { ...source, tokens: 5, quality: "reported" },
        ],
      },
    ],
  };
}

describe("bounded overview", () => {
  test("preserves legacy summary, repeated input, quality and composition order", () => {
    const session = fixture();
    const old = summarizeSession(session, 1000);
    const { currentContext, cumulativeContext, ...summary } = old;
    const result = buildOverview(session, 1000);
    expect(result.data?.summary).toEqual({ ...summary, hasUsage: true, hasCost: true });
    for (const [key, sources] of [
      ["current", currentContext],
      ["cumulative", cumulativeContext],
    ] as const) {
      expect(result.data?.tokens[key]).toEqual({
        total: sources.reduce((sum, entry) => sum + entry.tokens, 0),
        reported: sources.every((entry) => entry.quality === "reported"),
        groups: tokenBreakdown(sources).map(({ kind, label, tokens, share }) => ({
          kind,
          label,
          tokens,
          share,
        })),
      });
    }
    expect(result.data?.tokens.current.total).toBe(25);
    expect(result.data?.tokens.cumulative.reported).toBe(false);
    expect(result.data?.running).toBe(true);
    expect(result.data?.phases).toEqual(phaseBreakdown(session, 1000));
    expect(overviewSchema.parse(result)).toEqual(result);
    expect(session.requests[0].context[0].tokens).toBe(20);
  });

  test("does not serialize raw context even when the legacy snapshot exceeds 7 MB", () => {
    const session = fixture();
    const large = { ...source, label: "x".repeat(1024) };
    session.requests[0].context = Array(8000).fill(large);
    expect(JSON.stringify(session).length).toBeGreaterThan(7_000_000);
    const encoded = JSON.stringify(buildOverview(session, 1000));
    expect(encoded.length).toBeLessThan(10000);
    expect(encoded).not.toContain(large.label);
    expect(encoded).not.toContain('"context"');
    expect(encoded).not.toContain('"items"');
  });
});
