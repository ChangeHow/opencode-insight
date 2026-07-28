import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { TokenBreakdown } from "@opencode-dashboard/shared";
import {
  fetchModelsDevPricingDataset,
  loadCachedModelsDevPricingDataset,
} from "./models-dev-pricing";
import { matchesProviderHint, primaryProviderTag, providerTags } from "./provider-matching";

const PRICING_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
const CACHE_DIR = path.join(process.cwd(), ".cache", "opencode-telescope");
const CACHE_FILE = path.join(CACHE_DIR, "pricing-litellm.json");
const REQUEST_TIMEOUT_MS = 8000;
const PRICING_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const TIER_THRESHOLD = 200_000;

export interface ModelPricing {
  input_cost_per_token?: number;
  input_cost_per_token_above_200k_tokens?: number;
  input_cost_per_token_priority?: number;
  output_cost_per_token?: number;
  output_cost_per_token_above_200k_tokens?: number;
  output_cost_per_token_priority?: number;
  cache_creation_input_token_cost?: number;
  cache_creation_input_token_cost_above_200k_tokens?: number;
  cache_creation_input_token_cost_priority?: number;
  cache_read_input_token_cost?: number;
  cache_read_input_token_cost_above_200k_tokens?: number;
  cache_read_input_token_cost_priority?: number;
}

export type PricingDataset = Record<string, ModelPricing>;

const EXCLUDED_LITELLM_PREFIXES = ["github_copilot/"];
const MODEL_ALIASES: Record<string, string> = {
  "big-pickle": "glm-4.7",
  "big pickle": "glm-4.7",
  bigpickle: "glm-4.7",
  "glm-5.1": "glm-5",
  k2p5: "kimi-k2.5",
  "k2-p5": "kimi-k2.5",
  "kimi-k2.5-thinking": "kimi-k2-thinking",
  "kimi-for-coding": "kimi-k2.5",
  "kimi-k2.5-nvfp4": "kimi-k2.5",
  "kimi-k2-instruct-0905": "kimi-k2.5",
  k2p6: "kimi-k2.6",
  "k2-p6": "kimi-k2.6",
};

const LLMBOX_MODEL_PROVIDER_PREFIXES: Array<[string, string]> = [
  ["gpt", "openai"],
  ["glm", "zai"],
];

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

function resolveFallbackPricingPath() {
  const candidates = [
    path.join(MODULE_DIR, "fallback-pricing.json"),
    path.join(MODULE_DIR, "..", "fallback-pricing.json"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Missing fallback pricing dataset. Checked: ${candidates.join(", ")}`);
}

const FALLBACK_PRICING: PricingDataset = JSON.parse(
  fs.readFileSync(resolveFallbackPricingPath(), "utf8"),
);

function safeNumber(value?: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
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
    .replace(/-fast$/, "")
    .replace(/-thinking$/, "")
    .replace(/-high$/, "")
    .replace(/-low$/, "");
}

function isLlmboxProvider(providerId?: string) {
  return providerTags(providerId).includes("llmbox");
}

function llmboxPricingProvider(modelId: string, providerId?: string) {
  if (!isLlmboxProvider(providerId)) {
    return providerId;
  }

  const model = modelId.toLowerCase().replace(/^llmbox\//, "");
  return (
    LLMBOX_MODEL_PROVIDER_PREFIXES.find(([prefix]) => model.startsWith(prefix))?.[1] ?? providerId
  );
}

function iterativelyStripProviderPrefixes(modelId: string) {
  const knownPrefixes = [
    "openai/",
    "anthropic/",
    "google/",
    "xai/",
    "x-ai/",
    "z-ai/",
    "zai/",
    "openrouter/",
    "zenmux/",
    "vercel_ai_gateway/",
    "vercel-ai-gateway/",
    "github_copilot/",
    "github-copilot/",
    "moonshotai/",
    "minimax/",
    "opencode/",
    "llmbox/",
  ];

  const results: string[] = [];
  let current = modelId;
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of knownPrefixes) {
      if (current.startsWith(prefix)) {
        current = current.slice(prefix.length);
        if (current) {
          results.push(current);
        }
        changed = true;
        break;
      }
    }
  }

  return results;
}

function filterLitellmData(data: PricingDataset) {
  return Object.fromEntries(
    Object.entries(data).filter(
      ([key]) => !EXCLUDED_LITELLM_PREFIXES.some((prefix) => key.toLowerCase().startsWith(prefix)),
    ),
  );
}

function hasPositivePricing(pricing?: ModelPricing) {
  return Object.values(pricing ?? {}).some((value) => (safeNumber(value) ?? 0) > 0);
}

function mergeFallbackDataset(base: PricingDataset, fallback: PricingDataset) {
  const merged = { ...base };
  for (const [key, pricing] of Object.entries(fallback)) {
    if (!merged[key] || (!hasPositivePricing(merged[key]) && hasPositivePricing(pricing))) {
      merged[key] = pricing;
    }
  }
  return merged;
}

function hasPriorityPricing(pricing: ModelPricing) {
  return Object.entries(pricing).some(
    ([key, value]) => key.endsWith("_priority") && (safeNumber(value) ?? 0) > 0,
  );
}

function findPricing(
  dataset: PricingDataset,
  modelId: string,
  providerId?: string,
  requirePriority = false,
): ModelPricing | undefined {
  const raw = resolveAlias(modelId).toLowerCase();
  const hints = providerTags(providerId);
  const strippedCandidates = iterativelyStripProviderPrefixes(raw);
  const variants = [
    raw,
    normalizeVersionSeparator(raw),
    normalizeModelName(raw),
    normalizeModelName(normalizeVersionSeparator(raw)),
    ...strippedCandidates,
    ...strippedCandidates.map((value) => normalizeVersionSeparator(value)),
    ...strippedCandidates.map((value) => normalizeModelName(value)),
    ...strippedCandidates.map((value) => normalizeModelName(normalizeVersionSeparator(value))),
  ].filter(
    (value, index, array): value is string => Boolean(value) && array.indexOf(value) === index,
  );

  for (const variant of variants) {
    for (const [key, pricing] of Object.entries(dataset)) {
      const lowerKey = key.toLowerCase();
      if (
        (!requirePriority || hasPriorityPricing(pricing)) &&
        hints.includes(primaryProviderTag(lowerKey) ?? "") &&
        lowerKey.endsWith(`/${variant}`)
      ) {
        return pricing;
      }
    }

    for (const [key, pricing] of Object.entries(dataset)) {
      const lowerKey = key.toLowerCase();
      if ((!requirePriority || hasPriorityPricing(pricing)) && lowerKey === variant) {
        return pricing;
      }
      if (
        (!requirePriority || hasPriorityPricing(pricing)) &&
        matchesProviderHint(lowerKey, providerId) &&
        lowerKey.endsWith(`/${variant}`)
      ) {
        return pricing;
      }
    }
  }

  for (const variant of variants) {
    for (const [key, pricing] of Object.entries(dataset)) {
      const lowerKey = key.toLowerCase();
      if (
        (!requirePriority || hasPriorityPricing(pricing)) &&
        (lowerKey.endsWith(`/${variant}`) || lowerKey.includes(variant))
      ) {
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
    computeTieredComponent(
      usage.input,
      pricing.input_cost_per_token,
      pricing.input_cost_per_token_above_200k_tokens,
    ) +
    computeTieredComponent(
      usage.output + usage.reasoning,
      pricing.output_cost_per_token,
      pricing.output_cost_per_token_above_200k_tokens,
    ) +
    computeTieredComponent(
      usage.cacheRead,
      pricing.cache_read_input_token_cost,
      pricing.cache_read_input_token_cost_above_200k_tokens,
    ) +
    computeTieredComponent(
      usage.cacheWrite,
      pricing.cache_creation_input_token_cost,
      pricing.cache_creation_input_token_cost_above_200k_tokens,
    )
  );
}

function applyPriorityPricing(pricing: ModelPricing, modelId: string) {
  if (!modelId.toLowerCase().endsWith("-fast")) {
    return pricing;
  }

  return {
    ...pricing,
    input_cost_per_token:
      safeNumber(pricing.input_cost_per_token_priority) ?? pricing.input_cost_per_token,
    output_cost_per_token:
      safeNumber(pricing.output_cost_per_token_priority) ?? pricing.output_cost_per_token,
    cache_creation_input_token_cost:
      safeNumber(pricing.cache_creation_input_token_cost_priority) ??
      pricing.cache_creation_input_token_cost,
    cache_read_input_token_cost:
      safeNumber(pricing.cache_read_input_token_cost_priority) ??
      pricing.cache_read_input_token_cost,
  };
}

async function fetchPricingDataset(): Promise<PricingDataset> {
  const response = await fetch(PRICING_URL, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`Failed to fetch LiteLLM pricing: ${response.status}`);
  }

  const json = (await response.json()) as PricingDataset;
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

let pricingDataset: PricingDataset | null = null;
let pricingDatasetLoadedAt = 0;
let pricingRefreshPromise: Promise<void> | null = null;
let pricingGeneration = 0;
const pricingLookupCache = new Map<string, ModelPricing | null>();

function mergePricingDatasets(dataset: PricingDataset, modelsDevDataset: PricingDataset) {
  return mergeFallbackDataset(
    mergeFallbackDataset(filterLitellmData(dataset), modelsDevDataset),
    FALLBACK_PRICING,
  );
}

function loadLocalPricingDataset() {
  const dataset = loadCachedDataset();
  const modelsDevDataset = loadCachedModelsDevPricingDataset();
  return {
    dataset: mergePricingDatasets(dataset, modelsDevDataset),
    hasPersistentCache: Object.keys(dataset).length > 0 || Object.keys(modelsDevDataset).length > 0,
  };
}

function refreshPricingDataset() {
  if (pricingRefreshPromise) {
    return pricingRefreshPromise;
  }

  const generation = pricingGeneration;
  const refreshPromise = Promise.all([
    fetchPricingDataset().catch(() => loadCachedDataset()),
    fetchModelsDevPricingDataset().catch(() => loadCachedModelsDevPricingDataset()),
  ])
    .then(([dataset, modelsDevDataset]) => {
      if (generation === pricingGeneration) {
        pricingDataset = mergePricingDatasets(dataset, modelsDevDataset);
        pricingDatasetLoadedAt = Date.now();
        pricingLookupCache.clear();
      }
    })
    .catch(() => {
      // Keep the current dataset when a background refresh fails.
    })
    .finally(() => {
      if (pricingRefreshPromise === refreshPromise) {
        pricingRefreshPromise = null;
      }
    });
  pricingRefreshPromise = refreshPromise;
  return refreshPromise;
}

export async function getPricingDataset() {
  let dataset = pricingDataset;
  const needsInitialRefresh = dataset === null;
  let hasPersistentCache = true;
  if (dataset === null) {
    const local = loadLocalPricingDataset();
    dataset = local.dataset;
    hasPersistentCache = local.hasPersistentCache;
    pricingDataset = dataset;
    pricingDatasetLoadedAt = Date.now();
  }

  if (needsInitialRefresh || Date.now() - pricingDatasetLoadedAt >= PRICING_REFRESH_INTERVAL_MS) {
    const refresh = refreshPricingDataset();
    if (needsInitialRefresh && !hasPersistentCache) {
      await refresh;
      return pricingDataset ?? dataset;
    }
  }

  return dataset;
}

function resolvePricing(dataset: PricingDataset, modelId: string, providerId: string) {
  const effectiveProviderId = llmboxPricingProvider(modelId, providerId);
  const cacheKey = `${effectiveProviderId}::${modelId}`.toLowerCase();
  if (pricingLookupCache.has(cacheKey)) {
    return pricingLookupCache.get(cacheKey) ?? undefined;
  }

  const pricing =
    (modelId.toLowerCase().endsWith("-fast")
      ? findPricing(dataset, modelId, effectiveProviderId, true)
      : undefined) ?? findPricing(dataset, modelId, effectiveProviderId);
  const effectivePricing = pricing ? applyPriorityPricing(pricing, modelId) : undefined;
  pricingLookupCache.set(cacheKey, effectivePricing ?? null);
  return effectivePricing;
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

export async function estimateUsageCost(
  modelId: string,
  providerId: string,
  usage: TokenBreakdown,
) {
  const dataset = await getPricingDataset();
  return estimateUsageCostFromDataset(dataset, modelId, providerId, usage);
}

export function invalidatePricingCache() {
  pricingGeneration += 1;
  pricingDataset = null;
  pricingDatasetLoadedAt = 0;
  pricingRefreshPromise = null;
  pricingLookupCache.clear();
}
