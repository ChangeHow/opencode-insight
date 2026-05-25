import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { TokenBreakdown } from "@opencode-dashboard/shared";
import { matchesProviderHint, primaryProviderTag, providerTags } from "./provider-matching";
import { roundCost } from "./cost";

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

// Aggregator routes (openrouter, zenmux, vercel ai gateway, …) wrap model ids
// as `aggregator/upstream/model`, sometimes with more levels. We progressively
// peel every known provider/aggregator segment from the head so that a key like
// `openai/gpt-5.1-codex` in the pricing dataset is reachable from the
// aggregator-prefixed variant.
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
    Object.entries(data).filter(([key]) => {
      const lower = key.toLowerCase();
      return !EXCLUDED_LITELLM_PREFIXES.some((prefix) => lower.startsWith(prefix));
    }),
  );
}

function mergeDatasets(base: PricingDataset, overrides: PricingDataset) {
  return { ...base, ...overrides };
}

function findPricing(
  dataset: PricingDataset,
  modelId: string,
  providerId?: string,
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
      if (hints.includes(primaryProviderTag(lowerKey) ?? "") && lowerKey.endsWith(`/${variant}`)) {
        return pricing;
      }
    }

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
  const effectiveProviderId = llmboxPricingProvider(modelId, providerId);
  const cacheKey = `${effectiveProviderId}::${modelId}`.toLowerCase();
  if (pricingLookupCache.has(cacheKey)) {
    return pricingLookupCache.get(cacheKey) ?? undefined;
  }

  const pricing = findPricing(dataset, modelId, effectiveProviderId);
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
    estimatedCost: roundCost(computeCost(pricing, usage)),
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
  pricingDatasetPromise = null;
  pricingLookupCache.clear();
}
