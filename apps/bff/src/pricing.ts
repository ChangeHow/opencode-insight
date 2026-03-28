import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import type { TokenBreakdown } from "@opencode-dashboard/shared";

const PRICING_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
const CACHE_DIR = path.join(process.cwd(), ".cache", "opencode-telescope");
const CACHE_FILE = path.join(CACHE_DIR, "pricing-litellm.json");
const TIER_THRESHOLD = 200_000;

interface ModelPricing {
  input_cost_per_token?: number;
  input_cost_per_token_above_200k_tokens?: number;
  output_cost_per_token?: number;
  output_cost_per_token_above_200k_tokens?: number;
  cache_creation_input_token_cost?: number;
  cache_creation_input_token_cost_above_200k_tokens?: number;
  cache_read_input_token_cost?: number;
  cache_read_input_token_cost_above_200k_tokens?: number;
}

type PricingDataset = Record<string, ModelPricing>;

const EXCLUDED_LITELLM_PREFIXES = ["github_copilot/"];
const MODEL_ALIASES: Record<string, string> = {
  "big-pickle": "glm-4.7",
  "big pickle": "glm-4.7",
  bigpickle: "glm-4.7",
  k2p5: "kimi-k2-thinking",
  "k2-p5": "kimi-k2-thinking",
  "kimi-k2.5-thinking": "kimi-k2-thinking",
  "kimi-for-coding": "kimi-k2.5",
  "kimi-k2.5-nvfp4": "kimi-k2.5",
  "kimi-k2-instruct-0905": "kimi-k2.5",
};

const FALLBACK_PRICING: PricingDataset = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fallback-pricing.json"), "utf8"),
);

function safeNumber(value?: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function canonicalizeProviderSegment(segment: string) {
  const normalized = segment.trim().replace(/\/$/, "").toLowerCase().replaceAll("-", "_");

  switch (normalized) {
    case "":
    case "unknown":
      return undefined;
    case "x_ai":
    case "xai":
      return "xai";
    case "z_ai":
    case "zai":
      return "zai";
    case "moonshot":
    case "moonshotai":
      return "moonshotai";
    case "meta":
    case "meta_llama":
      return "meta_llama";
    case "azure":
    case "azure_ai":
      return "azure_ai";
    case "vertex":
    case "vertex_ai":
      return "vertex_ai";
    case "together":
    case "together_ai":
      return "together_ai";
    case "fireworks":
    case "fireworks_ai":
      return "fireworks_ai";
    case "google":
    case "gemini":
      return "google";
    case "openai":
    case "openai_codex":
      return "openai";
    case "mistral":
    case "mistralai":
      return "mistralai";
    default:
      if ([...normalized].some((character) => /\d/.test(character))) {
        return undefined;
      }
      return normalized || undefined;
  }
}

function providerTags(raw?: string | null) {
  if (!raw) {
    return [] as string[];
  }

  const tags: string[] = [];
  const push = (segment: string) => {
    const tag = canonicalizeProviderSegment(segment);
    if (tag && !tags.includes(tag)) {
      tags.push(tag);
    }
  };

  for (const segment of raw.trim().replace(/\/$/, "").split("/")) {
    push(segment);
    if (segment.includes(".")) {
      for (const dotted of segment.split(".")) {
        push(dotted);
      }
    }
  }

  return tags;
}

function keyProviderTags(datasetKey: string) {
  const keyParts = datasetKey.split("/");
  if (keyParts.length < 2) {
    return [] as string[];
  }

  const tags: string[] = [];
  const push = (value: string) => {
    for (const tag of providerTags(value)) {
      if (!tags.includes(tag)) {
        tags.push(tag);
      }
    }
  };

  for (const segment of keyParts.slice(0, -1)) {
    push(segment);
  }

  for (const dotted of keyParts.at(-1)!.split(".")) {
    push(dotted);
  }

  return tags;
}

function matchesProviderHint(datasetKey: string, providerId?: string) {
  const hints = providerTags(providerId);
  if (hints.length === 0) {
    return false;
  }

  const tags = keyProviderTags(datasetKey);
  return tags.some((tag) => hints.includes(tag));
}

function resolveAlias(modelId: string) {
  return MODEL_ALIASES[modelId.toLowerCase()] ?? modelId;
}

function normalizeVersionSeparator(modelId: string) {
  return modelId.replace(/-(\d)-(\d)(?=($|[-.]))/g, "-$1.$2");
}

function normalizeModelName(modelId: string) {
  return modelId
    .replace(/^antigravity-/, "")
    .replace(/-thinking$/, "")
    .replace(/-high$/, "")
    .replace(/-low$/, "");
}

function stripKnownProviderPrefix(modelId: string) {
  const knownPrefixes = [
    "openai/",
    "anthropic/",
    "google/",
    "xai/",
    "x-ai/",
    "z-ai/",
    "zai/",
    "openrouter/",
    "github_copilot/",
    "github-copilot/",
    "moonshotai/",
    "minimax/",
  ];

  for (const prefix of knownPrefixes) {
    if (modelId.startsWith(prefix)) {
      return modelId.slice(prefix.length);
    }
  }

  return undefined;
}

function filterLitellmData(data: PricingDataset) {
  return Object.fromEntries(
    Object.entries(data).filter(([key]) => {
      const lower = key.toLowerCase();
      return !EXCLUDED_LITELLM_PREFIXES.some((prefix) => lower.startsWith(prefix));
    }),
  );
}

function mergeDatasets(base: PricingDataset, overrides: PricingDataset) {
  return { ...base, ...overrides };
}

function findPricing(dataset: PricingDataset, modelId: string, providerId?: string): ModelPricing | undefined {
  const raw = resolveAlias(modelId).toLowerCase();
  const variants = [
    raw,
    normalizeVersionSeparator(raw),
    normalizeModelName(raw),
    normalizeModelName(normalizeVersionSeparator(raw)),
    stripKnownProviderPrefix(raw),
  ].filter(Boolean) as string[];

  for (const variant of variants) {
    for (const [key, pricing] of Object.entries(dataset)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey === variant) {
        return pricing;
      }
      if (matchesProviderHint(lowerKey, providerId) && lowerKey.endsWith(`/${variant}`)) {
        return pricing;
      }
    }
  }

  for (const variant of variants) {
    for (const [key, pricing] of Object.entries(dataset)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.endsWith(`/${variant}`) || lowerKey.includes(variant)) {
        return pricing;
      }
    }
  }

  return undefined;
}

function computeTieredComponent(tokens: number, base?: number, above?: number) {
  const safeBase = safeNumber(base);
  const safeAbove = safeNumber(above);
  if (!tokens || (!safeBase && !safeAbove)) {
    return 0;
  }

  if (safeAbove === undefined || tokens <= TIER_THRESHOLD) {
    return tokens * (safeBase ?? 0);
  }

  return TIER_THRESHOLD * (safeBase ?? 0) + (tokens - TIER_THRESHOLD) * safeAbove;
}

function computeCost(pricing: ModelPricing, usage: TokenBreakdown) {
  return (
    computeTieredComponent(usage.input, pricing.input_cost_per_token, pricing.input_cost_per_token_above_200k_tokens) +
    computeTieredComponent(usage.output + usage.reasoning, pricing.output_cost_per_token, pricing.output_cost_per_token_above_200k_tokens) +
    computeTieredComponent(usage.cacheRead, pricing.cache_read_input_token_cost, pricing.cache_read_input_token_cost_above_200k_tokens) +
    computeTieredComponent(usage.cacheWrite, pricing.cache_creation_input_token_cost, pricing.cache_creation_input_token_cost_above_200k_tokens)
  );
}

async function fetchPricingDataset(): Promise<PricingDataset> {
  const body = await new Promise<string>((resolve, reject) => {
    const request = https.get(PRICING_URL, (response) => {
      if (!response.statusCode || response.statusCode >= 400) {
        reject(new Error(`Failed to fetch LiteLLM pricing: ${response.statusCode ?? "unknown"}`));
        response.resume();
        return;
      }

      const chunks: string[] = [];
      response.setEncoding("utf8");
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve(chunks.join("")));
    });

    request.setTimeout(8000, () => {
      request.destroy(new Error("Timed out while fetching LiteLLM pricing."));
    });
    request.on("error", reject);
  });

  const json = JSON.parse(body) as PricingDataset;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(json), "utf8");
  return json;
}

function loadCachedDataset() {
  if (!fs.existsSync(CACHE_FILE)) {
    return {} as PricingDataset;
  }

  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) as PricingDataset;
  } catch {
    return {} as PricingDataset;
  }
}

let pricingDatasetPromise: Promise<PricingDataset> | null = null;
const pricingLookupCache = new Map<string, ModelPricing | null>();

export async function getPricingDataset() {
  if (!pricingDatasetPromise) {
    pricingDatasetPromise = fetchPricingDataset()
      .catch(() => loadCachedDataset())
      .then((dataset) => mergeDatasets(filterLitellmData(dataset), FALLBACK_PRICING));
  }

  return pricingDatasetPromise;
}

function resolvePricing(dataset: PricingDataset, modelId: string, providerId: string) {
  const cacheKey = `${providerId}::${modelId}`.toLowerCase();
  if (pricingLookupCache.has(cacheKey)) {
    return pricingLookupCache.get(cacheKey) ?? undefined;
  }

  const pricing = findPricing(dataset, modelId, providerId);
  pricingLookupCache.set(cacheKey, pricing ?? null);
  return pricing;
}

export function estimateUsageCostFromDataset(
  dataset: PricingDataset,
  modelId: string,
  providerId: string,
  usage: TokenBreakdown,
) {
  const pricing = resolvePricing(dataset, modelId, providerId);
  if (!pricing) {
    return { estimatedCost: 0, priced: false };
  }

  return {
    estimatedCost: computeCost(pricing, usage),
    priced: true,
  };
}

export async function estimateUsageCost(modelId: string, providerId: string, usage: TokenBreakdown) {
  const dataset = await getPricingDataset();
  return estimateUsageCostFromDataset(dataset, modelId, providerId, usage);
}

export function invalidatePricingCache() {
  pricingDatasetPromise = null;
  pricingLookupCache.clear();
}
