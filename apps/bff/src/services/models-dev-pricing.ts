import fs from "node:fs";
import path from "node:path";
import type { ModelPricing, PricingDataset } from "./pricing";

const MODELS_DEV_URL = "https://models.dev/api.json";
const CACHE_DIR = path.join(process.cwd(), ".cache", "opencode-telescope");
const CACHE_FILE = path.join(CACHE_DIR, "pricing-models-dev.json");
const CONTEXT_CACHE_FILE = path.join(CACHE_DIR, "context-models-dev.json");
const REQUEST_TIMEOUT_MS = 8000;
const PER_MILLION = 1_000_000;
const CONTEXT_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export type ContextWindowDataset = Record<string, number>;

interface ModelsDevModel {
  id?: string;
  limit?: {
    context?: number;
    output?: number;
  };
  cost?: {
    input?: number;
    output?: number;
    cache_read?: number;
    cache_write?: number;
  };
}

type ModelsDevDataset = Record<string, { models?: Record<string, ModelsDevModel> }>;

function perToken(value?: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value / PER_MILLION
    : undefined;
}

function parseModelsDevDataset(content: string): ModelsDevDataset {
  return JSON.parse(content) as ModelsDevDataset;
}

function toPricing(model: ModelsDevModel): ModelPricing | undefined {
  const input = perToken(model.cost?.input);
  const output = perToken(model.cost?.output);
  const cacheRead = perToken(model.cost?.cache_read);
  const cacheWrite = perToken(model.cost?.cache_write);

  if (!input && !output && !cacheRead && !cacheWrite) {
    return undefined;
  }

  return {
    input_cost_per_token: input,
    output_cost_per_token: output,
    cache_read_input_token_cost: cacheRead,
    cache_creation_input_token_cost: cacheWrite,
  };
}

export function parseModelsDevPricingDataset(content: string): PricingDataset {
  const providers = parseModelsDevDataset(content);
  const result: PricingDataset = {};

  for (const [providerId, provider] of Object.entries(providers)) {
    for (const [modelKey, model] of Object.entries(provider.models ?? {})) {
      const pricing = toPricing(model);
      if (!pricing) {
        continue;
      }
      const modelId = model.id ?? modelKey;
      result[`${providerId}/${modelId}`.toLowerCase()] = pricing;
    }
  }

  return result;
}

export function parseModelsDevContextWindows(content: string): ContextWindowDataset {
  const providers = parseModelsDevDataset(content);
  const result: ContextWindowDataset = {};

  for (const [providerId, provider] of Object.entries(providers)) {
    for (const [modelKey, model] of Object.entries(provider.models ?? {})) {
      const context = model.limit?.context;
      if (typeof context !== "number" || !Number.isFinite(context) || context <= 0) {
        continue;
      }
      const modelId = model.id ?? modelKey;
      result[`${providerId}/${modelId}`.toLowerCase()] = context;
    }
  }

  return result;
}

export function loadCachedModelsDevContextWindows() {
  if (!fs.existsSync(CONTEXT_CACHE_FILE)) {
    return {} as ContextWindowDataset;
  }

  try {
    return JSON.parse(fs.readFileSync(CONTEXT_CACHE_FILE, "utf8")) as ContextWindowDataset;
  } catch {
    return {} as ContextWindowDataset;
  }
}

async function fetchModelsDevRaw(): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(MODELS_DEV_URL, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch models.dev pricing: ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchModelsDevPricingDataset() {
  const body = await fetchModelsDevRaw();
  const dataset = parseModelsDevPricingDataset(body);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(dataset), "utf8");
  return dataset;
}

export function loadCachedModelsDevPricingDataset() {
  if (!fs.existsSync(CACHE_FILE)) {
    return {} as PricingDataset;
  }

  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) as PricingDataset;
  } catch {
    return {} as PricingDataset;
  }
}
