import { describe, expect, test } from "vitest";
import { estimateUsageCostFromDataset } from "../services/pricing";
import { buildSnapshot } from "../services/usage/day-map";
import { makeRawMessage, makeTokenBreakdown } from "./factories";

describe("Usage cost precision", () => {
  test("aggregates sub-cent message costs before rounding", () => {
    const usage = makeTokenBreakdown({ input: 1_000, output: 0 });
    const pricing = estimateUsageCostFromDataset(
      { "precision-model": { input_cost_per_token: 0.000004 } },
      "precision-model",
      "test-provider",
      usage,
    );
    const messages = [1, 2, 3].map((index) =>
      makeRawMessage("2026-07-11", {
        id: `msg_${index}`,
        estimatedCost: pricing.estimatedCost,
        pricedTokens: 1_000,
        tokens: usage,
      }),
    );

    const snapshot = buildSnapshot(messages, "sqlite", []);

    expect(snapshot.messages.map((message) => message.estimatedCost)).toEqual([
      0.004, 0.004, 0.004,
    ]);
    expect(snapshot.summary.totalCost).toBe(0.01);
  });
});
