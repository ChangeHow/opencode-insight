import fs from "node:fs";
import { beforeEach, afterEach, describe, it, expect, test, vi } from "vitest";
import { parseModelsDevPricingDataset } from "../services/models-dev-pricing";
import {
  estimateUsageCostFromDataset,
  getPricingDataset,
  invalidatePricingCache,
} from "../services/pricing";
import { makeTokenBreakdown, makePricingDataset } from "./factories";

function createDeferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

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
      expect(result.estimatedCost).toBeCloseTo(0.525, 12);
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
      expect(result.estimatedCost).toBeCloseTo(2.2, 12);
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
      expect(result.estimatedCost).toBeCloseTo(0.195, 12);
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
      expect(result.estimatedCost).toBeCloseTo(0.0875, 12);
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
      expect(result.estimatedCost).toBeCloseTo(0.0368, 12);
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
      expect(result.estimatedCost).toBeCloseTo(0.0875, 12);
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
      expect(result.estimatedCost).toBeCloseTo(0.1225, 12);
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
      expect(result.estimatedCost).toBeCloseTo(0.232, 12);
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
      expect(result.estimatedCost).toBeCloseTo(0.03, 12);
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
      expect(result.estimatedCost).toBeCloseTo(0.023, 12);
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
      expect(result.estimatedCost).toBeCloseTo(0.0315, 12);
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
      expect(result.estimatedCost).toBeCloseTo(0.07, 12);
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
      // 10000 * 0.0000015 + 5000 * 0.00001 = 0.015 + 0.05 = 0.065
      expect(result.estimatedCost).toBeCloseTo(0.065, 12);
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
      expect(result.estimatedCost).toBeCloseTo(0.065, 12);
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
      expect(result.estimatedCost).toBeCloseTo(0.03, 12);
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
      expect(result.estimatedCost).toBeCloseTo(0.0412, 12);
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
      // 10000 * 0.0000001 + 5000 * 0.0000004 = 0.001 + 0.002 = 0.003
      expect(result.estimatedCost).toBeCloseTo(0.003, 12);
    });
  });

  describe("Given remote pricing changes", () => {
    beforeEach(() => {
      invalidatePricingCache();
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(
        JSON.stringify({
          "test/cached-model": { input_cost_per_token: 0.000001 },
        }),
      );
      vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);
      vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);
    });

    afterEach(() => {
      invalidatePricingCache();
      vi.useRealTimers();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    test("returns cached pricing immediately while the first refresh is pending", async () => {
      const liteLlm = createDeferredResponse();
      const modelsDev = createDeferredResponse();
      vi.stubGlobal(
        "fetch",
        vi.fn((input: string | URL | Request) =>
          String(input).includes("models.dev") ? modelsDev.promise : liteLlm.promise,
        ),
      );

      await expect(getPricingDataset()).resolves.toMatchObject({
        "test/cached-model": { input_cost_per_token: 0.000001 },
      });
      expect(fetch).toHaveBeenCalledTimes(2);

      liteLlm.resolve(Response.json({}));
      modelsDev.resolve(Response.json({}));
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    });

    test("waits for authoritative pricing when no persistent cache exists", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const liteLlm = createDeferredResponse();
      const modelsDev = createDeferredResponse();
      vi.stubGlobal(
        "fetch",
        vi.fn((input: string | URL | Request) =>
          String(input).includes("models.dev") ? modelsDev.promise : liteLlm.promise,
        ),
      );

      let settled = false;
      const datasetPromise = getPricingDataset().then((dataset) => {
        settled = true;
        return dataset;
      });
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(settled).toBe(false);

      liteLlm.resolve(Response.json({ "test/remote-model": { input_cost_per_token: 0.000002 } }));
      modelsDev.resolve(Response.json({}));

      await expect(datasetPromise).resolves.toMatchObject({
        "test/remote-model": { input_cost_per_token: 0.000002 },
      });
    });

    test("deduplicates concurrent refreshes and applies new pricing", async () => {
      const liteLlm = createDeferredResponse();
      const modelsDev = createDeferredResponse();
      vi.stubGlobal(
        "fetch",
        vi.fn((input: string | URL | Request) =>
          String(input).includes("models.dev") ? modelsDev.promise : liteLlm.promise,
        ),
      );

      await Promise.all([getPricingDataset(), getPricingDataset()]);
      expect(fetch).toHaveBeenCalledTimes(2);
      liteLlm.resolve(Response.json({ "test/cached-model": { input_cost_per_token: 0.000002 } }));
      modelsDev.resolve(Response.json({}));
      await vi.waitFor(async () => {
        expect((await getPricingDataset())["test/cached-model"]?.input_cost_per_token).toBe(
          0.000002,
        );
      });
    });

    test("returns stale pricing immediately after the cache expires", async () => {
      vi.spyOn(Date, "now").mockReturnValue(0);
      let refreshPending: Promise<Response> | undefined;
      const remotePricing = { "test/cached-model": { input_cost_per_token: 0.000002 } };
      vi.stubGlobal(
        "fetch",
        vi.fn((input: string | URL | Request) => {
          if (String(input).includes("models.dev")) return Response.json({});
          return refreshPending ?? Response.json(remotePricing);
        }),
      );

      await getPricingDataset();
      await vi.waitFor(async () => {
        expect((await getPricingDataset())["test/cached-model"]?.input_cost_per_token).toBe(
          0.000002,
        );
      });
      let resolveRefresh!: (response: Response) => void;
      refreshPending = new Promise<Response>((resolve) => {
        resolveRefresh = resolve;
      });
      vi.spyOn(Date, "now").mockReturnValue(600_001);

      expect((await getPricingDataset())["test/cached-model"]?.input_cost_per_token).toBe(0.000002);
      resolveRefresh(Response.json({ "test/cached-model": { input_cost_per_token: 0.000003 } }));
      await vi.waitFor(async () => {
        expect((await getPricingDataset())["test/cached-model"]?.input_cost_per_token).toBe(
          0.000003,
        );
      });
    });

    test("does not allow a pre-invalidation refresh to replace a newer dataset", async () => {
      const oldLiteLlm = createDeferredResponse();
      const oldModelsDev = createDeferredResponse();
      const newLiteLlm = createDeferredResponse();
      const newModelsDev = createDeferredResponse();
      const liteLlmResponses = [oldLiteLlm.promise, newLiteLlm.promise];
      const modelsDevResponses = [oldModelsDev.promise, newModelsDev.promise];
      vi.stubGlobal(
        "fetch",
        vi.fn((input: string | URL | Request) =>
          String(input).includes("models.dev")
            ? modelsDevResponses.shift()!
            : liteLlmResponses.shift()!,
        ),
      );

      await getPricingDataset();
      invalidatePricingCache();
      await getPricingDataset();
      newLiteLlm.resolve(
        Response.json({ "test/cached-model": { input_cost_per_token: 0.000003 } }),
      );
      newModelsDev.resolve(Response.json({}));
      await vi.waitFor(async () => {
        expect((await getPricingDataset())["test/cached-model"]?.input_cost_per_token).toBe(
          0.000003,
        );
      });

      oldLiteLlm.resolve(
        Response.json({ "test/cached-model": { input_cost_per_token: 0.000004 } }),
      );
      oldModelsDev.resolve(Response.json({}));
      await vi.waitFor(async () => {
        expect((await getPricingDataset())["test/cached-model"]?.input_cost_per_token).toBe(
          0.000003,
        );
      });
    });
  });
});
