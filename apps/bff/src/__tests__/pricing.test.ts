import { beforeEach, afterEach, describe, it, expect, test, vi } from "vitest";
import { parseModelsDevPricingDataset } from "../services/models-dev-pricing";
import {
  estimateUsageCostFromDataset,
  getPricingDataset,
  invalidatePricingCache,
} from "../services/pricing";
import { makeTokenBreakdown, makePricingDataset } from "./factories";

describe("Pricing Module", () => {
  describe("Given a model in the dataset", () => {
    it("should return priced=true and non-zero cost when computing cost", async () => {
      const dataset = await makePricingDataset();
      const usage = makeTokenBreakdown({ input: 10000, output: 5000 });

      const result = await estimateUsageCostFromDataset(
        dataset,
        "claude-3-5-sonnet-20241022",
        "anthropic",
        usage,
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
        usage,
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
        usage,
      );

      expect(result.priced).toBe(true);
      // Base rates: 50000 * 0.000003 + 25000 * 0.000015 = 0.15 + 0.375 = 0.525
      expect(result.estimatedCost).toBe(0.53);
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
        usage,
      );

      expect(result.priced).toBe(true);
      // First 200k input: 200000 * 0.000003 = 0.6
      // Next 50k input: 50000 * 0.000002 = 0.1
      // Output under 200k: 100000 * 0.000015 = 1.5
      // Total: 0.6 + 0.1 + 1.5 = 2.2
      expect(result.estimatedCost).toBe(2.2);
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
        usage,
      );

      expect(result.priced).toBe(true);
      // Input: 10000 * 0.000003 = 0.03
      // Output: 5000 * 0.000015 = 0.075
      // Cache read: 50000 * 0.0000003 = 0.015
      // Cache write: 20000 * 0.00000375 = 0.075
      // Total: 0.03 + 0.075 + 0.015 + 0.075 = 0.195
      expect(result.estimatedCost).toBe(0.2);
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

      const result = await estimateUsageCostFromDataset(dataset, "gpt-5.3", "cursor", usage);

      expect(result.priced).toBe(true);
      // Cursor override rates: input 0.00000175, output 0.000014
      // 10000 * 0.00000175 + 5000 * 0.000014 = 0.0175 + 0.07 = 0.0875
      expect(result.estimatedCost).toBe(0.09);
    });
  });

  describe("Given fallback-only models (not in litellm)", () => {
    it("should price glm-5-turbo via fallback dataset", () => {
      const dataset = makePricingDataset({
        "glm-5-turbo": {
          input_cost_per_token: 0.0000012,
          output_cost_per_token: 0.000004,
          cache_read_input_token_cost: 0.00000024,
        },
      });
      const usage = makeTokenBreakdown({ input: 10000, output: 5000, cacheRead: 20000 });

      const result = estimateUsageCostFromDataset(dataset, "glm-5-turbo", "zai", usage);

      expect(result.priced).toBe(true);
      // input: 10000 * 0.0000012 = 0.012
      // output: 5000 * 0.000004 = 0.02
      // cacheRead: 20000 * 0.00000024 = 0.0048
      // Total: 0.012 + 0.02 + 0.0048 = 0.0368
      expect(result.estimatedCost).toBe(0.04);
    });

    it("should price gpt-5.3-codex via fallback dataset", () => {
      const dataset = makePricingDataset({
        "gpt-5.3-codex": {
          input_cost_per_token: 0.00000175,
          output_cost_per_token: 0.000014,
          cache_read_input_token_cost: 0.000000175,
        },
      });
      const usage = makeTokenBreakdown({ input: 10000, output: 5000 });

      const result = estimateUsageCostFromDataset(dataset, "gpt-5.3-codex", "cursor", usage);

      expect(result.priced).toBe(true);
      expect(result.estimatedCost).toBe(0.09);
    });

    test("uses priority rates for fast model aliases", () => {
      const dataset = makePricingDataset({
        "openai/gpt-5.6-sol": {
          input_cost_per_token: 0.000005,
          output_cost_per_token: 0.00003,
          cache_read_input_token_cost: 0.0000005,
        },
        "gpt-5.6-sol": {
          input_cost_per_token: 0.000005,
          output_cost_per_token: 0.00003,
          cache_read_input_token_cost: 0.0000005,
          input_cost_per_token_priority: 0.00001,
          output_cost_per_token_priority: 0.00006,
          cache_read_input_token_cost_priority: 0.000001,
        },
      });
      const usage = makeTokenBreakdown({
        input: 1_000_000,
        output: 1_000_000,
        cacheRead: 1_000_000,
      });

      expect(estimateUsageCostFromDataset(dataset, "gpt-5.6-sol-fast", "openai", usage)).toEqual({
        estimatedCost: 71,
        priced: true,
      });
    });

    it("should price composer-1.5 via fallback dataset", () => {
      const dataset = makePricingDataset({
        "composer-1.5": {
          input_cost_per_token: 0.0000035,
          output_cost_per_token: 0.0000175,
          cache_read_input_token_cost: 0.00000035,
        },
      });
      const usage = makeTokenBreakdown({ input: 10000, output: 5000 });

      const result = estimateUsageCostFromDataset(dataset, "composer-1.5", "cursor", usage);

      expect(result.priced).toBe(true);
      // 10000 * 0.0000035 + 5000 * 0.0000175 = 0.035 + 0.0875 = 0.1225
      expect(result.estimatedCost).toBe(0.12);
    });

    it("should prefer zai pricing for zai-coding-plan over openrouter matches", () => {
      const dataset = makePricingDataset({
        "openrouter/z-ai/glm-5": {
          input_cost_per_token: 0.0000008,
          output_cost_per_token: 0.00000256,
          cache_read_input_token_cost: 0,
        },
        "zai/glm-5": {
          input_cost_per_token: 0.000001,
          output_cost_per_token: 0.0000032,
          cache_read_input_token_cost: 0.0000002,
        },
      });
      const usage = makeTokenBreakdown({ input: 100000, output: 10000, cacheRead: 500000 });

      const result = estimateUsageCostFromDataset(dataset, "glm-5", "zai-coding-plan", usage);

      expect(result.priced).toBe(true);
      expect(result.estimatedCost).toBe(0.23);
    });

    it("should price glm-5.1 using glm-5 alias for zai providers", () => {
      const dataset = makePricingDataset({
        "zai/glm-5": {
          input_cost_per_token: 0.000001,
          output_cost_per_token: 0.0000032,
          cache_read_input_token_cost: 0.0000002,
        },
      });
      const usage = makeTokenBreakdown({ input: 10000, output: 5000, cacheRead: 20000 });

      const result = estimateUsageCostFromDataset(dataset, "glm-5.1", "zai-coding-plan", usage);

      expect(result.priced).toBe(true);
      expect(result.estimatedCost).toBe(0.03);
    });

    it("should price k2p5 via kimi-for-coding as kimi-k2.5", () => {
      const dataset = makePricingDataset({
        "moonshotai/kimi-k2.5": {
          input_cost_per_token: 0.0000006,
          output_cost_per_token: 0.000003,
          cache_read_input_token_cost: 0.0000001,
        },
        "moonshotai/kimi-k2-thinking": {
          input_cost_per_token: 0.0000006,
          output_cost_per_token: 0.0000025,
          cache_read_input_token_cost: 0.00000015,
        },
      });
      const usage = makeTokenBreakdown({ input: 10000, output: 5000, cacheRead: 20000 });

      const result = estimateUsageCostFromDataset(dataset, "k2p5", "kimi-for-coding", usage);

      expect(result.priced).toBe(true);
      // 10000 * 0.0000006 + 5000 * 0.000003 + 20000 * 0.0000001 = 0.006 + 0.015 + 0.002 = 0.023
      expect(result.estimatedCost).toBe(0.02);
    });

    it("should price k2p6 via kimi-for-coding as kimi-k2.6", () => {
      const dataset = makePricingDataset({
        "moonshotai/kimi-k2.6": {
          input_cost_per_token: 9e-7,
          output_cost_per_token: 3.9e-6,
          cache_read_input_token_cost: 1.5e-7,
        },
      });
      const usage = makeTokenBreakdown({ input: 10000, output: 5000, cacheRead: 20000 });

      const result = estimateUsageCostFromDataset(dataset, "k2p6", "kimi-for-coding", usage);

      expect(result.priced).toBe(true);
      // 10000 * 9e-7 + 5000 * 3.9e-6 + 20000 * 1.5e-7 = 0.009 + 0.0195 + 0.003 = 0.0315
      expect(result.estimatedCost).toBe(0.03);
    });

    it("should price zenmux/openai/gpt-5.1-codex via openai/gpt-5.1-codex", () => {
      const dataset = makePricingDataset({
        "openai/gpt-5.1-codex": {
          input_cost_per_token: 0.000002,
          output_cost_per_token: 0.00001,
          cache_read_input_token_cost: 0.0000002,
        },
      });
      const usage = makeTokenBreakdown({ input: 10000, output: 5000 });

      const result = estimateUsageCostFromDataset(
        dataset,
        "zenmux/openai/gpt-5.1-codex",
        "zenmux",
        usage,
      );

      expect(result.priced).toBe(true);
      // 10000 * 0.000002 + 5000 * 0.00001 = 0.02 + 0.05 = 0.07
      expect(result.estimatedCost).toBe(0.07);
    });

    it("should price openrouter/openai/gpt-5 via openai/gpt-5 after prefix strip", () => {
      const dataset = makePricingDataset({
        "openai/gpt-5": {
          input_cost_per_token: 0.0000015,
          output_cost_per_token: 0.00001,
          cache_read_input_token_cost: 0.00000015,
        },
      });
      const usage = makeTokenBreakdown({ input: 10000, output: 5000 });

      const result = estimateUsageCostFromDataset(
        dataset,
        "openrouter/openai/gpt-5",
        "openrouter",
        usage,
      );

      expect(result.priced).toBe(true);
      // 10000 * 0.0000015 + 5000 * 0.00001 = 0.015 + 0.05 = 0.065, rounded to 2dp => 0.07
      expect(result.estimatedCost).toBe(0.07);
    });

    it("should price llmbox/gpt models using openai pricing", () => {
      const dataset = makePricingDataset({
        "openai/gpt-5": {
          input_cost_per_token: 0.0000015,
          output_cost_per_token: 0.00001,
          cache_read_input_token_cost: 0.00000015,
        },
      });
      const usage = makeTokenBreakdown({ input: 10000, output: 5000 });

      const result = estimateUsageCostFromDataset(dataset, "llmbox/gpt-5", "llmbox", usage);

      expect(result.priced).toBe(true);
      expect(result.estimatedCost).toBe(0.07);
    });

    it("should price llmbox/glm models using zai pricing", () => {
      const dataset = makePricingDataset({
        "zai/glm-5": {
          input_cost_per_token: 0.000001,
          output_cost_per_token: 0.0000032,
          cache_read_input_token_cost: 0.0000002,
        },
      });
      const usage = makeTokenBreakdown({ input: 10000, output: 5000, cacheRead: 20000 });

      const result = estimateUsageCostFromDataset(dataset, "llmbox/glm-5", "llmbox", usage);

      expect(result.priced).toBe(true);
      expect(result.estimatedCost).toBe(0.03);
    });

    it("should price glm-5.2 from models.dev zai fallback for coding-plan providers", () => {
      const dataset = makePricingDataset({
        "zai/glm-5.2": {
          input_cost_per_token: 0.0000014,
          output_cost_per_token: 0.0000044,
          cache_read_input_token_cost: 0.00000026,
          cache_creation_input_token_cost: 0,
        },
      });
      const usage = makeTokenBreakdown({ input: 10000, output: 5000, cacheRead: 20000 });

      const result = estimateUsageCostFromDataset(dataset, "glm-5.2", "zai-coding-plan", usage);

      expect(result.priced).toBe(true);
      // input: 10000 * 0.0000014 = 0.014
      // output: 5000 * 0.0000044 = 0.022
      // cacheRead: 20000 * 0.00000026 = 0.0052
      expect(result.estimatedCost).toBe(0.04);
    });

    it("should parse models.dev pricing and skip zero-cost plan entries", () => {
      const dataset = parseModelsDevPricingDataset(
        JSON.stringify({
          zai: {
            models: {
              "glm-5.2": {
                id: "glm-5.2",
                cost: { input: 1.4, output: 4.4, cache_read: 0.26, cache_write: 0 },
              },
            },
          },
          "zai-coding-plan": {
            models: {
              "glm-5.2": {
                id: "glm-5.2",
                cost: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
              },
            },
          },
        }),
      );

      expect(dataset["zai/glm-5.2"]).toEqual({
        input_cost_per_token: 0.0000014,
        output_cost_per_token: 0.0000044,
        cache_read_input_token_cost: 0.00000026,
        cache_creation_input_token_cost: 0,
      });
      expect(dataset["zai-coding-plan/glm-5.2"]).toBeUndefined();
    });

    it("should price zenmux/openai/gpt-5.4-nano by bare model fallback", () => {
      const dataset = makePricingDataset({
        "gpt-5.4-nano": {
          input_cost_per_token: 0.0000001,
          output_cost_per_token: 0.0000004,
        },
      });
      const usage = makeTokenBreakdown({ input: 10000, output: 5000 });

      const result = estimateUsageCostFromDataset(
        dataset,
        "zenmux/openai/gpt-5.4-nano",
        "zenmux",
        usage,
      );

      expect(result.priced).toBe(true);
      // 10000 * 0.0000001 + 5000 * 0.0000004 = 0.001 + 0.002 = 0.003, rounded to 2dp => 0
      expect(result.estimatedCost).toBe(0);
    });
  });

  describe("Given remote pricing changes", () => {
    beforeEach(() => {
      invalidatePricingCache();
      vi.useFakeTimers();
    });

    afterEach(() => {
      invalidatePricingCache();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    test("refreshes pricing after the in-memory cache expires", async () => {
      let liteLlmPricing = {};
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string | URL | Request) =>
          Response.json(String(input).includes("models.dev") ? {} : liteLlmPricing),
        ),
      );

      const usage = makeTokenBreakdown({ input: 1_000_000, output: 1_000_000 });
      const staleDataset = await getPricingDataset();
      expect(
        estimateUsageCostFromDataset(staleDataset, "gpt-5.6-sol", "openai", usage).priced,
      ).toBe(false);

      liteLlmPricing = {
        "gpt-5.6-sol": {
          input_cost_per_token: 0.000005,
          output_cost_per_token: 0.00003,
        },
      };
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 1);

      const refreshedDataset = await getPricingDataset();
      expect(
        estimateUsageCostFromDataset(refreshedDataset, "gpt-5.6-sol", "openai", usage),
      ).toEqual({ estimatedCost: 35, priced: true });
    });

    test("keeps remote pricing authoritative over static fallbacks", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string | URL | Request) =>
          Response.json(
            String(input).includes("models.dev")
              ? {}
              : {
                  "gpt-5.3": {
                    input_cost_per_token: 0.000001,
                    output_cost_per_token: 0.000001,
                  },
                },
          ),
        ),
      );

      const dataset = await getPricingDataset();
      const usage = makeTokenBreakdown({ input: 1_000_000, output: 1_000_000 });

      expect(estimateUsageCostFromDataset(dataset, "gpt-5.3", "openai", usage)).toEqual({
        estimatedCost: 2,
        priced: true,
      });
    });
  });
});
