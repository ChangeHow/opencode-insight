import { describe, it, expect } from "vitest";
import { estimateUsageCostFromDataset } from "../pricing.js";
import { makeTokenBreakdown, makePricingDataset } from "./factories.js";

describe("Pricing Module", () => {
  describe("Given a model in the dataset", () => {
    it("should return priced=true and non-zero cost when computing cost", async () => {
      const dataset = await makePricingDataset();
      const usage = makeTokenBreakdown({ input: 10000, output: 5000 });

      const result = await estimateUsageCostFromDataset(
        dataset,
        "claude-3-5-sonnet-20241022",
        "anthropic",
        usage
      );

      expect(result.priced).toBe(true);
      expect(result.estimatedCost).toBeGreaterThan(0);
    });
  });

  describe("Given an unknown model", () => {
    it("should return priced=false and zero cost when computing cost", async () => {
      const dataset = await makePricingDataset();
      const usage = makeTokenBreakdown({ input: 10000, output: 5000 });

      const result = await estimateUsageCostFromDataset(
        dataset,
        "unknown-model-xyz",
        "unknown-provider",
        usage
      );

      expect(result.priced).toBe(false);
      expect(result.estimatedCost).toBe(0);
    });
  });

  describe("Given token usage under threshold (200k)", () => {
    it("should use base rates when computing cost", async () => {
      const dataset = await makePricingDataset();
      const usage = makeTokenBreakdown({ input: 50000, output: 25000 });

      const result = await estimateUsageCostFromDataset(
        dataset,
        "claude-3-5-sonnet-20241022",
        "anthropic",
        usage
      );

      expect(result.priced).toBe(true);
      // Base rates: 50000 * 0.000003 + 25000 * 0.000015 = 0.15 + 0.375 = 0.525
      expect(result.estimatedCost).toBeCloseTo(0.525, 5);
    });
  });

  describe("Given token usage over threshold (200k)", () => {
    it("should use tiered rates above threshold when computing cost", async () => {
      const dataset = await makePricingDataset();
      const usage = makeTokenBreakdown({ input: 250000, output: 100000 });

      const result = await estimateUsageCostFromDataset(
        dataset,
        "claude-3-5-sonnet-20241022",
        "anthropic",
        usage
      );

      expect(result.priced).toBe(true);
      // First 200k input: 200000 * 0.000003 = 0.6
      // Next 50k input: 50000 * 0.000002 = 0.1
      // Output under 200k: 100000 * 0.000015 = 1.5
      // Total: 0.6 + 0.1 + 1.5 = 2.2
      expect(result.estimatedCost).toBeCloseTo(2.2, 5);
    });
  });

  describe("Given cache read and write tokens", () => {
    it("should apply cache pricing rates when computing cost", async () => {
      const dataset = await makePricingDataset();
      const usage = makeTokenBreakdown({
        input: 10000,
        output: 5000,
        cacheRead: 50000,
        cacheWrite: 20000,
      });

      const result = await estimateUsageCostFromDataset(
        dataset,
        "claude-3-5-sonnet-20241022",
        "anthropic",
        usage
      );

      expect(result.priced).toBe(true);
      // Input: 10000 * 0.000003 = 0.03
      // Output: 5000 * 0.000015 = 0.075
      // Cache read: 50000 * 0.0000003 = 0.015
      // Cache write: 20000 * 0.00000375 = 0.075
      // Total: 0.03 + 0.075 + 0.015 + 0.075 = 0.195
      expect(result.estimatedCost).toBeCloseTo(0.195, 5);
    });
  });

  describe("Given a cursor model override (gpt-5.3)", () => {
    it("should use cursor pricing when computing cost", async () => {
      const dataset = await makePricingDataset({
        "gpt-5.3": {
          input_cost_per_token: 0.00000175,
          output_cost_per_token: 0.000014,
          cache_read_input_token_cost: 0.000000175,
        },
      });
      const usage = makeTokenBreakdown({ input: 10000, output: 5000 });

      const result = await estimateUsageCostFromDataset(
        dataset,
        "gpt-5.3",
        "cursor",
        usage
      );

      expect(result.priced).toBe(true);
      // Cursor override rates: input 0.00000175, output 0.000014
      // 10000 * 0.00000175 + 5000 * 0.000014 = 0.0175 + 0.07 = 0.0875
      expect(result.estimatedCost).toBeCloseTo(0.0875, 5);
    });
  });
});
