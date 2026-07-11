import { describe, expect, test } from "vitest";
import type { RemoteUsagePayload } from "@opencode-dashboard/shared";
import { buildCombinedOverviewMetrics } from "@/routes/overview-metrics";
import { makeCostSeriesOption, makeDashboardSummary } from "./factories";

describe("buildCombinedOverviewMetrics", () => {
  test("merges matching local and Cloudflare Remote models", () => {
    const remote: RemoteUsagePayload = {
      enabled: true,
      status: "fresh",
      machines: [{ id: "remote-mac", label: "Remote Mac" }],
      rows: [
        {
          machineId: "remote-mac",
          machineLabel: "Remote Mac",
          date: "2025-01-15",
          updatedAt: "2025-01-15T12:00:00Z",
          providerId: "anthropic",
          modelId: "claude-3-5-sonnet-20241022",
          tokens: 60_000,
          pricedTokens: 60_000,
          cost: 1,
          messages: 10,
          breakdown: { input: 60_000, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
        },
      ],
      totals: { machines: 1, tokens: 60_000, pricedTokens: 60_000, cost: 1, messages: 10 },
    };

    const result = buildCombinedOverviewMetrics({
      summary: makeDashboardSummary(),
      trend: [],
      seriesOptions: [
        makeCostSeriesOption({ totalTokens: 50_000 }),
        makeCostSeriesOption({
          key: "openai/gpt-5",
          providerId: "openai",
          modelId: "gpt-5",
          totalTokens: 100_000,
        }),
      ],
      remote,
    });

    expect(result.topModel).toMatchObject({
      providerId: "anthropic",
      modelId: "claude-3-5-sonnet-20241022",
      tokens: 110_000,
    });
  });
});
