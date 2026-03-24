import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type {
  CostSeriesLine,
  CostSeriesOption,
  DashboardSummary,
  DayBreakdown,
  HeatmapDay,
  ProviderInsight,
  TimeRange,
  TokenBreakdown,
  TrendPoint,
} from "@opencode-dashboard/shared";
import { estimateUsageCostFromDataset, getPricingDataset } from "./pricing.js";

type SourceKind = DashboardSummary["source"]["kind"];

interface RawMessage {
  id: string;
  date: string;
  timestampMs: number;
  modelId: string;
  providerId: string;
  cost: number;
  estimatedCost: number;
  pricedTokens: number;
  tokens: TokenBreakdown;
}

interface RangeData {
  summary: DashboardSummary;
  heatmap: HeatmapDay[];
  trend: TrendPoint[];
  byDate: Map<string, DayBreakdown>;
  seriesOptions: CostSeriesOption[];
  seriesLines: CostSeriesLine[];
  providers: ProviderInsight[];
}

interface UsageSnapshot {
  summary: DashboardSummary;
  heatmap: HeatmapDay[];
  trendByRange: Record<TimeRange, TrendPoint[]>;
  breakdownByDate: Map<string, DayBreakdown>;
}

interface SerializedUsageSnapshot {
  summary: DashboardSummary;
  heatmap: HeatmapDay[];
  trendByRange: Record<TimeRange, TrendPoint[]>;
  breakdownByDate: DayBreakdown[];
  dataFingerprint?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const CACHE_DIR = path.join(process.cwd(), ".cache", "opencode-telescope");
const SNAPSHOT_CACHE_FILE = path.join(CACHE_DIR, "usage-snapshot.json");

function computeDataFingerprint(dbPath: string, legacyDir: string): string {
  const parts: string[] = [];
  if (fs.existsSync(dbPath)) {
    const stat = fs.statSync(dbPath);
    parts.push(`db:${stat.ino}:${stat.size}`);
  }
  if (fs.existsSync(legacyDir)) {
    const stat = fs.statSync(legacyDir);
    parts.push(`legacy:${stat.ino}:${Math.trunc(stat.mtimeMs)}`);
  }
  return parts.length > 0 ? parts.join("|") : "empty";
}

function emptyBreakdown(): TokenBreakdown {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    reasoning: 0,
  };
}

function getOpenCodePaths() {
  const configuredRoot = process.env.OPENCODE_DATA_DIR;
  const root =
    configuredRoot && configuredRoot.trim().length > 0
      ? configuredRoot
      : path.join(process.cwd(), ".missing-opencode-data-dir");
  return {
    dbPath: path.join(root, "opencode.db"),
    legacyDir: path.join(root, "storage", "message"),
  };
}

function normalizeTokenBreakdown(tokens: {
  input?: number;
  output?: number;
  reasoning?: number | null;
  cache?: { read?: number; write?: number };
}): TokenBreakdown {
  return {
    input: Math.max(0, Math.trunc(tokens.input ?? 0)),
    output: Math.max(0, Math.trunc(tokens.output ?? 0)),
    cacheRead: Math.max(0, Math.trunc(tokens.cache?.read ?? 0)),
    cacheWrite: Math.max(0, Math.trunc(tokens.cache?.write ?? 0)),
    reasoning: Math.max(0, Math.trunc(tokens.reasoning ?? 0)),
  };
}

function totalTokens(tokens: TokenBreakdown) {
  return tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite + tokens.reasoning;
}

function toDate(timestampMs: number) {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

function parseAssistantMessage(input: unknown, fallbackId: string): RawMessage | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const message = input as {
    id?: string;
    role?: string;
    modelID?: string;
    providerID?: string;
    cost?: number;
    tokens?: {
      input?: number;
      output?: number;
      reasoning?: number | null;
      cache?: { read?: number; write?: number };
    };
    time?: { created?: number };
  };

  if (message.role !== "assistant" || !message.tokens || !message.modelID || !message.time?.created) {
    return null;
  }

  const tokens = normalizeTokenBreakdown(message.tokens);
  const timestampMs = Math.trunc(message.time.created);

  return {
    id: message.id ?? fallbackId,
    date: toDate(timestampMs),
    timestampMs,
    modelId: message.modelID,
    providerId: message.providerID ?? "unknown",
    cost: Math.max(0, Number(message.cost ?? 0)),
    estimatedCost: 0,
    pricedTokens: 0,
    tokens,
  };
}

function readSqliteMessages(dbPath: string) {
  if (!fs.existsSync(dbPath)) {
    return [] as RawMessage[];
  }

  try {
    const query = `
      SELECT id, data
      FROM message
      WHERE json_extract(data, '$.role') = 'assistant'
        AND json_extract(data, '$.tokens') IS NOT NULL
    `;

    const output = execFileSync("sqlite3", ["-json", dbPath, query], {
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
    }).trim();

    const rows = output.length > 0 ? (JSON.parse(output) as Array<{ id: string; data: string }>) : [];

    return rows
      .map((row) => {
        try {
          return parseAssistantMessage(JSON.parse(row.data), row.id);
        } catch {
          return null;
        }
      })
      .filter((item): item is RawMessage => item !== null);
  } catch {
    return [] as RawMessage[];
  }
}

function readLegacyMessages(legacyDir: string) {
  if (!fs.existsSync(legacyDir)) {
    return [] as RawMessage[];
  }

  return fs
    .readdirSync(legacyDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      try {
        const raw = fs.readFileSync(path.join(legacyDir, file), "utf8");
        return parseAssistantMessage(JSON.parse(raw), file.replace(/\.json$/, ""));
      } catch {
        return null;
      }
    })
    .filter((item): item is RawMessage => item !== null);
}

function dedupeMessages(messages: RawMessage[]) {
  const map = new Map<string, RawMessage>();
  for (const message of messages) {
    if (!map.has(message.id)) {
      map.set(message.id, message);
    }
  }
  return [...map.values()].sort((a, b) => a.timestampMs - b.timestampMs);
}

async function enrichMessages(messages: RawMessage[]) {
  const pricingDataset = await getPricingDataset();
  return messages.map((message) => {
    const pricing = estimateUsageCostFromDataset(pricingDataset, message.modelId, message.providerId, message.tokens);
    return {
      ...message,
      estimatedCost: pricing.estimatedCost,
      pricedTokens: pricing.priced ? totalTokens(message.tokens) : 0,
    };
  });
}

function computeStreak(days: string[]) {
  if (days.length === 0) {
    return { current: 0, longest: 0 };
  }

  const set = new Set(days);
  let longest = 0;

  for (const day of days) {
    const previous = new Date(`${day}T00:00:00.000Z`).getTime() - DAY_MS;
    const previousDay = new Date(previous).toISOString().slice(0, 10);
    if (set.has(previousDay)) {
      continue;
    }

    let streak = 1;
    let cursor = new Date(`${day}T00:00:00.000Z`).getTime();
    while (set.has(new Date(cursor + DAY_MS).toISOString().slice(0, 10))) {
      streak += 1;
      cursor += DAY_MS;
    }
    longest = Math.max(longest, streak);
  }

  let current = 0;
  let cursor = new Date(`${days[days.length - 1]}T00:00:00.000Z`).getTime();
  while (set.has(new Date(cursor).toISOString().slice(0, 10))) {
    current += 1;
    cursor -= DAY_MS;
  }

  return { current, longest };
}

function buildTrend(days: HeatmapDay[], takeLast: number): TrendPoint[] {
  return days.slice(-takeLast).map((day) => ({
    date: day.date,
    tokens: day.tokens,
    cost: day.cost,
    messages: day.messages,
  }));
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPresetBounds(range: TimeRange) {
  const today = new Date();
  const end = formatLocalDate(today);

  if (range === "month") {
    return {
      start: formatLocalDate(new Date(today.getFullYear(), today.getMonth(), 1)),
      end,
    };
  }

  if (range === "3mo") {
    return {
      start: formatLocalDate(new Date(today.getFullYear(), today.getMonth() - 2, 1)),
      end,
    };
  }

  return {
    start: formatLocalDate(new Date(today.getFullYear(), 0, 1)),
    end,
  };
}

function trimHeatmap(days: HeatmapDay[], range: TimeRange) {
  const { start, end } = getPresetBounds(range);
  const selected = filterByDateRange(days, start, end);
  const maxTokens = Math.max(...selected.map((item) => item.tokens), 0);

  return selected.map((day, index) => {
    const intensity: HeatmapDay["intensity"] =
      day.tokens === 0 || maxTokens === 0 ? 0 : (Math.ceil((day.tokens / maxTokens) * 4) as 1 | 2 | 3 | 4);

    return {
      ...day,
      weekIndex: Math.floor(index / 7),
      intensity,
    };
  });
}

function filterByDateRange<T extends { date: string }>(items: T[], start?: string, end?: string) {
  return items.filter((item) => {
    if (start && item.date < start) return false;
    if (end && item.date > end) return false;
    return true;
  });
}

function filterDayByModels(day: DayBreakdown, modelKeys: string[]) {
  if (modelKeys.length === 0) {
    return day;
  }

  const allowed = new Set(modelKeys);
  const models = day.models.filter((model) => allowed.has(`${model.providerId}::${model.modelId}`));
  const breakdown = emptyBreakdown();
  let tokens = 0;
  let pricedTokens = 0;
  let cost = 0;
  let messages = 0;

  for (const model of models) {
    tokens += model.tokens;
    pricedTokens += model.pricedTokens;
    cost += model.cost;
    messages += model.messages;
    breakdown.input += model.breakdown.input;
    breakdown.output += model.breakdown.output;
    breakdown.cacheRead += model.breakdown.cacheRead;
    breakdown.cacheWrite += model.breakdown.cacheWrite;
    breakdown.reasoning += model.breakdown.reasoning;
  }

  return {
    date: day.date,
    tokens,
    pricedTokens,
    cost,
    messages,
    breakdown,
    models,
  } satisfies DayBreakdown;
}

function buildHeatmap(days: DayBreakdown[]) {
  const maxTokens = Math.max(...days.map((item) => item.tokens), 0);

  return days.map((day, index) => {
    const weekday = new Date(`${day.date}T00:00:00.000Z`).getUTCDay();
    const intensity: HeatmapDay["intensity"] =
      day.tokens === 0 || maxTokens === 0 ? 0 : (Math.ceil((day.tokens / maxTokens) * 4) as 1 | 2 | 3 | 4);

    return {
      date: day.date,
      weekday,
      weekIndex: Math.floor(index / 7),
      tokens: day.tokens,
      cost: Number(day.cost.toFixed(4)),
      messages: day.messages,
      breakdown: day.breakdown,
      intensity,
    };
  });
}

function buildTrendFromDays(days: DayBreakdown[]) {
  return days.map((day) => ({
    date: day.date,
    tokens: day.tokens,
    cost: Number(day.cost.toFixed(4)),
    messages: day.messages,
  }));
}

function buildSeries(days: DayBreakdown[]): Pick<RangeData, "seriesOptions" | "seriesLines"> {
  const dateSet = new Set(days.map((day) => day.date));
  const sortedDates = [...dateSet].sort();
  const map = new Map<
    string,
    {
      key: string;
      label: string;
      providerId: string;
      modelId: string;
      totalCost: number;
      totalTokens: number;
      totalMessages: number;
      points: Map<string, TrendPoint>;
    }
  >();

  for (const day of days) {
    for (const model of day.models) {
      const key = `${model.providerId}::${model.modelId}`;
      const entry =
        map.get(key) ??
        {
          key,
          label: `${model.modelId} / ${model.providerId}`,
          providerId: model.providerId,
          modelId: model.modelId,
          totalCost: 0,
          totalTokens: 0,
          totalMessages: 0,
          points: new Map<string, TrendPoint>(),
        };

      entry.totalCost += model.cost;
      entry.totalTokens += model.tokens;
      entry.totalMessages += model.messages;
      entry.points.set(day.date, {
        date: day.date,
        cost: model.cost,
        tokens: model.tokens,
        messages: model.messages,
      });
      map.set(key, entry);
    }
  }

  const seriesOptions: CostSeriesOption[] = [...map.values()]
    .sort((left, right) => right.totalCost - left.totalCost)
    .map((entry) => ({
      key: entry.key,
      label: entry.label,
      providerId: entry.providerId,
      modelId: entry.modelId,
      totalCost: Number(entry.totalCost.toFixed(4)),
      totalTokens: entry.totalTokens,
      totalMessages: entry.totalMessages,
    }));

  const seriesLines: CostSeriesLine[] = seriesOptions.map((option) => {
    const entry = map.get(option.key)!;
    return {
      key: option.key,
      label: option.label,
      providerId: option.providerId,
      modelId: option.modelId,
      points: sortedDates.map((date) => entry.points.get(date) ?? { date, cost: 0, tokens: 0, messages: 0 }),
    };
  });

  return { seriesOptions, seriesLines };
}

function buildProviderInsights(days: DayBreakdown[]) {
  const dateSet = new Set(days.map((day) => day.date));
  const sortedDates = [...dateSet].sort();
  const map = new Map<
    string,
    {
      providerId: string;
      totalCost: number;
      totalTokens: number;
      pricedTokens: number;
      totalMessages: number;
      activeDays: Set<string>;
      models: Map<string, { modelId: string; tokens: number; cost: number }>;
      points: Map<string, TrendPoint>;
    }
  >();

  for (const day of days) {
    for (const model of day.models) {
      const entry =
        map.get(model.providerId) ??
        {
          providerId: model.providerId,
          totalCost: 0,
          totalTokens: 0,
          pricedTokens: 0,
          totalMessages: 0,
          activeDays: new Set<string>(),
          models: new Map<string, { modelId: string; tokens: number; cost: number }>(),
          points: new Map<string, TrendPoint>(),
        };

      entry.totalCost += model.cost;
      entry.totalTokens += model.tokens;
      entry.pricedTokens += model.pricedTokens;
      entry.totalMessages += model.messages;
      entry.activeDays.add(day.date);

      const modelEntry = entry.models.get(model.modelId) ?? { modelId: model.modelId, tokens: 0, cost: 0 };
      modelEntry.tokens += model.tokens;
      modelEntry.cost += model.cost;
      entry.models.set(model.modelId, modelEntry);

      const point = entry.points.get(day.date) ?? { date: day.date, cost: 0, tokens: 0, messages: 0 };
      point.cost += model.cost;
      point.tokens += model.tokens;
      point.messages += model.messages;
      entry.points.set(day.date, point);

      map.set(model.providerId, entry);
    }
  }

  return [...map.values()]
    .map((entry) => {
      const topModel = [...entry.models.values()].sort((left, right) => right.cost - left.cost || right.tokens - left.tokens)[0] ?? null;

      return {
        providerId: entry.providerId,
        totalCost: Number(entry.totalCost.toFixed(4)),
        totalTokens: entry.totalTokens,
        pricedTokens: entry.pricedTokens,
        pricingCoverage: entry.totalTokens === 0 ? 0 : Number((entry.pricedTokens / entry.totalTokens).toFixed(4)),
        totalMessages: entry.totalMessages,
        activeDays: entry.activeDays.size,
        modelCount: entry.models.size,
        topModel: topModel
          ? {
              modelId: topModel.modelId,
              tokens: topModel.tokens,
              cost: Number(topModel.cost.toFixed(4)),
            }
          : null,
        trend: sortedDates.map((date) => entry.points.get(date) ?? { date, cost: 0, tokens: 0, messages: 0 }),
      } satisfies ProviderInsight;
    })
    .sort((left, right) => right.totalCost - left.totalCost || right.totalTokens - left.totalTokens);
}

function buildRangeSummary(snapshot: UsageSnapshot, summaryDays: DayBreakdown[]) {
  const totalTokens = summaryDays.reduce((sum, item) => sum + item.tokens, 0);
  const totalCost = summaryDays.reduce((sum, item) => sum + item.cost, 0);
  const pricedTokens = summaryDays.reduce((sum, item) => sum + item.pricedTokens, 0);
  const totalMessages = summaryDays.reduce((sum, item) => sum + item.messages, 0);
  const bestDay = [...summaryDays].sort((a, b) => b.tokens - a.tokens)[0] ?? null;
  const modelGroups = new Map<string, { modelId: string; tokens: number; cost: number }>();

  for (const day of summaryDays) {
    for (const model of day.models) {
      const key = `${model.providerId}::${model.modelId}`;
      const entry = modelGroups.get(key) ?? { modelId: model.modelId, tokens: 0, cost: 0 };
      entry.tokens += model.tokens;
      entry.cost += model.cost;
      modelGroups.set(key, entry);
    }
  }

  const topModel = [...modelGroups.values()].sort((a, b) => b.tokens - a.tokens)[0] ?? null;
  const orderedDates = summaryDays.map((day) => day.date).sort();
  const streaks = computeStreak(orderedDates);

  return {
    ...snapshot.summary,
    totalTokens,
    totalCost: Number(totalCost.toFixed(4)),
    pricedTokens,
    pricingCoverage: totalTokens === 0 ? 0 : Number((pricedTokens / totalTokens).toFixed(4)),
    totalMessages,
    activeDays: summaryDays.length,
    averageTokensPerActiveDay: summaryDays.length === 0 ? 0 : Math.round(totalTokens / summaryDays.length),
    currentStreak: streaks.current,
    longestStreak: streaks.longest,
    bestDay: bestDay ? { date: bestDay.date, tokens: bestDay.tokens, cost: Number(bestDay.cost.toFixed(4)) } : null,
    topModel: topModel ? { modelId: topModel.modelId, tokens: topModel.tokens, cost: Number(topModel.cost.toFixed(4)) } : null,
  } satisfies DashboardSummary;
}

function buildSnapshot(messages: RawMessage[], sourceKind: SourceKind, paths: string[]): UsageSnapshot {
  const dayMap = new Map<string, DayBreakdown>();
  const modelMap = new Map<
    string,
    {
      modelId: string;
      providerId: string;
      tokens: number;
      pricedTokens: number;
      cost: number;
      messages: number;
      breakdown: TokenBreakdown;
    }
  >();
  let totalTokensAll = 0;
  let totalCostAll = 0;
  let pricedTokensAll = 0;
  let totalMessagesAll = 0;

  for (const message of messages) {
    const day =
      dayMap.get(message.date) ??
      {
        date: message.date,
        tokens: 0,
        pricedTokens: 0,
        cost: 0,
        messages: 0,
        breakdown: emptyBreakdown(),
        models: [],
      };

    const messageTokens = totalTokens(message.tokens);
    day.tokens += messageTokens;
    day.pricedTokens += message.pricedTokens;
    day.cost += message.estimatedCost;
    day.messages += 1;
    day.breakdown.input += message.tokens.input;
    day.breakdown.output += message.tokens.output;
    day.breakdown.cacheRead += message.tokens.cacheRead;
    day.breakdown.cacheWrite += message.tokens.cacheWrite;
    day.breakdown.reasoning += message.tokens.reasoning;

    const modelKey = `${message.date}:${message.providerId}:${message.modelId}`;
    const model =
      modelMap.get(modelKey) ??
      {
        modelId: message.modelId,
        providerId: message.providerId,
        tokens: 0,
        pricedTokens: 0,
        cost: 0,
        messages: 0,
        breakdown: emptyBreakdown(),
      };

    model.tokens += messageTokens;
    model.pricedTokens += message.pricedTokens;
    model.cost += message.estimatedCost;
    model.messages += 1;
    model.breakdown.input += message.tokens.input;
    model.breakdown.output += message.tokens.output;
    model.breakdown.cacheRead += message.tokens.cacheRead;
    model.breakdown.cacheWrite += message.tokens.cacheWrite;
    model.breakdown.reasoning += message.tokens.reasoning;

    modelMap.set(modelKey, model);
    dayMap.set(message.date, day);
    totalTokensAll += messageTokens;
    totalCostAll += message.estimatedCost;
    pricedTokensAll += message.pricedTokens;
    totalMessagesAll += 1;
  }

  for (const [key, model] of modelMap.entries()) {
    const [date] = key.split(":");
    const day = dayMap.get(date);
    if (day) {
      day.models.push(model);
    }
  }

  const orderedDates = [...dayMap.keys()].sort();
  const topModel = [...modelMap.values()].sort((a, b) => b.tokens - a.tokens)[0] ?? null;
  const bestDay = [...dayMap.values()].sort((a, b) => b.tokens - a.tokens)[0] ?? null;
  const streaks = computeStreak(orderedDates);
  const maxTokens = Math.max(...[...dayMap.values()].map((item) => item.tokens), 0);

  const heatmap: HeatmapDay[] = orderedDates.map((date, index) => {
    const day = dayMap.get(date)!;
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    const intensity = maxTokens === 0 ? 0 : (Math.ceil((day.tokens / maxTokens) * 4) as 1 | 2 | 3 | 4);

    day.models.sort((a, b) => b.cost - a.cost || b.tokens - a.tokens);

    return {
      date,
      weekday,
      weekIndex: Math.floor(index / 7),
      tokens: day.tokens,
      cost: Number(day.cost.toFixed(4)),
      messages: day.messages,
      breakdown: day.breakdown,
      intensity: day.tokens === 0 ? 0 : intensity,
    };
  });

  const trendByRange = {
    month: buildTrend(trimHeatmap(heatmap, "month"), Number.MAX_SAFE_INTEGER),
    "3mo": buildTrend(trimHeatmap(heatmap, "3mo"), Number.MAX_SAFE_INTEGER),
    year: buildTrend(trimHeatmap(heatmap, "year"), Number.MAX_SAFE_INTEGER),
  } satisfies Record<TimeRange, TrendPoint[]>;

  return {
    summary: {
      totalTokens: totalTokensAll,
      totalCost: Number(totalCostAll.toFixed(4)),
      pricedTokens: pricedTokensAll,
      pricingCoverage: totalTokensAll === 0 ? 0 : Number((pricedTokensAll / totalTokensAll).toFixed(4)),
      totalMessages: totalMessagesAll,
      activeDays: orderedDates.length,
      averageTokensPerActiveDay: orderedDates.length === 0 ? 0 : Math.round(totalTokensAll / orderedDates.length),
      currentStreak: streaks.current,
      longestStreak: streaks.longest,
      bestDay: bestDay ? { date: bestDay.date, tokens: bestDay.tokens, cost: Number(bestDay.cost.toFixed(4)) } : null,
      topModel: topModel ? { modelId: topModel.modelId, tokens: topModel.tokens, cost: Number(topModel.cost.toFixed(4)) } : null,
      availableRanges: ["month", "3mo", "year"],
      scannedAt: new Date().toISOString(),
      source: {
        kind: sourceKind,
        paths,
      },
    },
    heatmap,
    trendByRange,
    breakdownByDate: dayMap,
  };
}

function serializeSnapshot(snapshot: UsageSnapshot): SerializedUsageSnapshot {
  return {
    summary: snapshot.summary,
    heatmap: snapshot.heatmap,
    trendByRange: snapshot.trendByRange,
    breakdownByDate: [...snapshot.breakdownByDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

function deserializeSnapshot(snapshot: SerializedUsageSnapshot): UsageSnapshot {
  return {
    summary: snapshot.summary,
    heatmap: snapshot.heatmap,
    trendByRange: snapshot.trendByRange,
    breakdownByDate: new Map(snapshot.breakdownByDate.map((day) => [day.date, day])),
  };
}

function readSnapshotCache(dbPath: string, legacyDir: string) {
  if (!fs.existsSync(SNAPSHOT_CACHE_FILE)) {
    return null;
  }

  try {
    const cached = JSON.parse(fs.readFileSync(SNAPSHOT_CACHE_FILE, "utf8")) as SerializedUsageSnapshot;
    if (cached.dataFingerprint !== undefined) {
      const currentFingerprint = computeDataFingerprint(dbPath, legacyDir);
      if (cached.dataFingerprint !== currentFingerprint) {
        return null;
      }
    }
    return deserializeSnapshot(cached);
  } catch {
    return null;
  }
}

function writeSnapshotCache(snapshot: UsageSnapshot, dbPath: string, legacyDir: string) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const serialized: SerializedUsageSnapshot = {
    ...serializeSnapshot(snapshot),
    dataFingerprint: computeDataFingerprint(dbPath, legacyDir),
  };
  fs.writeFileSync(SNAPSHOT_CACHE_FILE, JSON.stringify(serialized), "utf8");
}

export async function loadUsageSnapshot(options?: { forceRefresh?: boolean }) {
  const { dbPath, legacyDir } = getOpenCodePaths();

  if (!options?.forceRefresh) {
    const cached = readSnapshotCache(dbPath, legacyDir);
    if (cached) {
      return cached;
    }
  }

  const sqliteMessages = readSqliteMessages(dbPath);
  const legacyMessages = readLegacyMessages(legacyDir);
  const messages = await enrichMessages(dedupeMessages([...sqliteMessages, ...legacyMessages]));

  const sourceKind: SourceKind =
    sqliteMessages.length > 0 && legacyMessages.length > 0
      ? "mixed"
      : sqliteMessages.length > 0
        ? "sqlite"
        : legacyMessages.length > 0
          ? "json"
          : "none";

  const paths = [dbPath, legacyDir].filter((currentPath) => fs.existsSync(currentPath));
  const snapshot = buildSnapshot(messages, sourceKind, paths);
  writeSnapshotCache(snapshot, dbPath, legacyDir);
  return snapshot;
}

export function getRangeData(snapshot: UsageSnapshot, range: TimeRange, modelKeys: string[] = []): RangeData {
  const windowDays = trimHeatmap(snapshot.heatmap, range);
  const selectedDates = new Set(windowDays.map((item) => item.date));
  const byDate = new Map<string, DayBreakdown>();

  for (const [date, breakdown] of snapshot.breakdownByDate.entries()) {
    if (selectedDates.has(date)) {
      byDate.set(date, filterDayByModels(breakdown, modelKeys));
    }
  }

  const windowBreakdowns = windowDays
    .map((day) => byDate.get(day.date))
    .filter((item): item is DayBreakdown => item !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date));
  const activityDays = windowBreakdowns.filter((day) => day.tokens > 0);
  const { seriesLines, seriesOptions } = buildSeries(activityDays);
  const providers = buildProviderInsights(activityDays);
  const heatmap = buildHeatmap(windowBreakdowns);

  return {
    summary: buildRangeSummary(snapshot, activityDays),
    heatmap,
    trend: buildTrendFromDays(windowBreakdowns),
    byDate,
    seriesOptions,
    seriesLines,
    providers,
  };
}

export function getDateFilteredData(snapshot: UsageSnapshot, start?: string, end?: string, modelKeys: string[] = []): RangeData {
  const selected = filterByDateRange(snapshot.heatmap, start, end);
  const byDate = new Map<string, DayBreakdown>();
  for (const [date, breakdown] of snapshot.breakdownByDate.entries()) {
    if ((!start || date >= start) && (!end || date <= end)) {
      byDate.set(date, filterDayByModels(breakdown, modelKeys));
    }
  }

  const windowBreakdowns = selected
    .map((day) => byDate.get(day.date))
    .filter((item): item is DayBreakdown => item !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date));
  const activityDays = windowBreakdowns.filter((day) => day.tokens > 0);
  const { seriesLines, seriesOptions } = buildSeries(activityDays);
  const providers = buildProviderInsights(activityDays);
  const heatmap = buildHeatmap(windowBreakdowns);

  return {
    summary: buildRangeSummary(snapshot, activityDays),
    heatmap,
    trend: buildTrendFromDays(windowBreakdowns),
    byDate,
    seriesOptions,
    seriesLines,
    providers,
  };
}
