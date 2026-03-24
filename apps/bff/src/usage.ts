import { homedir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import type {
  DashboardSummary,
  DayBreakdown,
  HeatmapDay,
  TimeRange,
  TokenBreakdown,
  TrendPoint,
} from "@opencode-dashboard/shared";

type SourceKind = DashboardSummary["source"]["kind"];

interface RawMessage {
  id: string;
  date: string;
  timestampMs: number;
  modelId: string;
  providerId: string;
  cost: number;
  tokens: TokenBreakdown;
}

interface RangeData {
  summary: DashboardSummary;
  heatmap: HeatmapDay[];
  trend: TrendPoint[];
  byDate: Map<string, DayBreakdown>;
}

interface UsageSnapshot {
  summary: DashboardSummary;
  heatmap: HeatmapDay[];
  trendByRange: Record<TimeRange, TrendPoint[]>;
  breakdownByDate: Map<string, DayBreakdown>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function emptyBreakdown(): TokenBreakdown {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    reasoning: 0,
  };
}

function getDataRoot() {
  if (process.env.XDG_DATA_HOME) {
    return process.env.XDG_DATA_HOME;
  }

  return path.join(homedir(), ".local", "share");
}

function getOpenCodePaths() {
  const root = path.join(getDataRoot(), "opencode");
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
    tokens,
  };
}

function readSqliteMessages(dbPath: string) {
  if (!fs.existsSync(dbPath)) {
    return [] as RawMessage[];
  }

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const rows = db
      .prepare(
        `
          SELECT id, data
          FROM message
          WHERE json_extract(data, '$.role') = 'assistant'
            AND json_extract(data, '$.tokens') IS NOT NULL
        `,
      )
      .all() as Array<{ id: string; data: string }>;

    return rows
      .map((row) => {
        try {
          return parseAssistantMessage(JSON.parse(row.data), row.id);
        } catch {
          return null;
        }
      })
      .filter((item): item is RawMessage => item !== null);
  } finally {
    db.close();
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

function buildSnapshot(messages: RawMessage[], sourceKind: SourceKind, paths: string[]): UsageSnapshot {
  const dayMap = new Map<string, DayBreakdown>();
  const modelMap = new Map<string, { modelId: string; providerId: string; tokens: number; cost: number; messages: number; breakdown: TokenBreakdown }>();
  let totalTokensAll = 0;
  let totalCostAll = 0;
  let totalMessagesAll = 0;

  for (const message of messages) {
    const day = dayMap.get(message.date) ?? {
      date: message.date,
      tokens: 0,
      cost: 0,
      messages: 0,
      breakdown: emptyBreakdown(),
      models: [],
    };

    const messageTokens = totalTokens(message.tokens);
    day.tokens += messageTokens;
    day.cost += message.cost;
    day.messages += 1;
    day.breakdown.input += message.tokens.input;
    day.breakdown.output += message.tokens.output;
    day.breakdown.cacheRead += message.tokens.cacheRead;
    day.breakdown.cacheWrite += message.tokens.cacheWrite;
    day.breakdown.reasoning += message.tokens.reasoning;

    const modelKey = `${message.date}:${message.modelId}:${message.providerId}`;
    const model = modelMap.get(modelKey) ?? {
      modelId: message.modelId,
      providerId: message.providerId,
      tokens: 0,
      cost: 0,
      messages: 0,
      breakdown: emptyBreakdown(),
    };

    model.tokens += messageTokens;
    model.cost += message.cost;
    model.messages += 1;
    model.breakdown.input += message.tokens.input;
    model.breakdown.output += message.tokens.output;
    model.breakdown.cacheRead += message.tokens.cacheRead;
    model.breakdown.cacheWrite += message.tokens.cacheWrite;
    model.breakdown.reasoning += message.tokens.reasoning;

    modelMap.set(modelKey, model);
    dayMap.set(message.date, day);
    totalTokensAll += messageTokens;
    totalCostAll += message.cost;
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
    const sundayFirst = weekday;
    const intensity = maxTokens === 0 ? 0 : (Math.ceil((day.tokens / maxTokens) * 4) as 1 | 2 | 3 | 4);

    day.models.sort((a, b) => b.tokens - a.tokens);

    return {
      date,
      weekday: sundayFirst,
      weekIndex: Math.floor(index / 7),
      tokens: day.tokens,
      cost: Number(day.cost.toFixed(4)),
      messages: day.messages,
      breakdown: day.breakdown,
      intensity: day.tokens === 0 ? 0 : intensity,
    };
  });

  const trendByRange = {
    "7d": buildTrend(heatmap, 7),
    "30d": buildTrend(heatmap, 30),
    "90d": buildTrend(heatmap, 90),
  } satisfies Record<TimeRange, TrendPoint[]>;

  return {
    summary: {
      totalTokens: totalTokensAll,
      totalCost: Number(totalCostAll.toFixed(4)),
      totalMessages: totalMessagesAll,
      activeDays: orderedDates.length,
      averageTokensPerActiveDay: orderedDates.length === 0 ? 0 : Math.round(totalTokensAll / orderedDates.length),
      currentStreak: streaks.current,
      longestStreak: streaks.longest,
      bestDay: bestDay ? { date: bestDay.date, tokens: bestDay.tokens, cost: Number(bestDay.cost.toFixed(4)) } : null,
      topModel: topModel ? { modelId: topModel.modelId, tokens: topModel.tokens, cost: Number(topModel.cost.toFixed(4)) } : null,
      availableRanges: ["7d", "30d", "90d"],
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

function buildTrend(days: HeatmapDay[], takeLast: number): TrendPoint[] {
  return days.slice(-takeLast).map((day) => ({
    date: day.date,
    tokens: day.tokens,
    cost: day.cost,
    messages: day.messages,
  }));
}

function trimHeatmap(days: HeatmapDay[], range: TimeRange) {
  const take = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const selected = days.slice(-take);
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

export function loadUsageSnapshot() {
  const { dbPath, legacyDir } = getOpenCodePaths();
  const sqliteMessages = readSqliteMessages(dbPath);
  const legacyMessages = readLegacyMessages(legacyDir);
  const messages = dedupeMessages([...sqliteMessages, ...legacyMessages]);

  const sourceKind: SourceKind =
    sqliteMessages.length > 0 && legacyMessages.length > 0
      ? "mixed"
      : sqliteMessages.length > 0
        ? "sqlite"
        : legacyMessages.length > 0
          ? "json"
          : "none";

  const paths = [dbPath, legacyDir].filter((currentPath) => fs.existsSync(currentPath));
  return buildSnapshot(messages, sourceKind, paths);
}

export function getRangeData(snapshot: UsageSnapshot, range: TimeRange): RangeData {
  const heatmap = trimHeatmap(snapshot.heatmap, range);
  const selectedDates = new Set(heatmap.map((item) => item.date));
  const byDate = new Map<string, DayBreakdown>();
  for (const [date, breakdown] of snapshot.breakdownByDate.entries()) {
    if (selectedDates.has(date)) {
      byDate.set(date, breakdown);
    }
  }

  const summaryDays = [...byDate.values()];
  const totalTokens = summaryDays.reduce((sum, item) => sum + item.tokens, 0);
  const totalCost = summaryDays.reduce((sum, item) => sum + item.cost, 0);
  const totalMessages = summaryDays.reduce((sum, item) => sum + item.messages, 0);
  const bestDay = [...summaryDays].sort((a, b) => b.tokens - a.tokens)[0] ?? null;
  const models = summaryDays.flatMap((item) => item.models);
  const modelGroups = new Map<string, { modelId: string; tokens: number; cost: number }>();

  for (const model of models) {
    const entry = modelGroups.get(model.modelId) ?? { modelId: model.modelId, tokens: 0, cost: 0 };
    entry.tokens += model.tokens;
    entry.cost += model.cost;
    modelGroups.set(model.modelId, entry);
  }

  const topModel = [...modelGroups.values()].sort((a, b) => b.tokens - a.tokens)[0] ?? null;
  const orderedDates = [...byDate.keys()].sort();
  const streaks = computeStreak(orderedDates);

  return {
    summary: {
      ...snapshot.summary,
      totalTokens,
      totalCost: Number(totalCost.toFixed(4)),
      totalMessages,
      activeDays: summaryDays.length,
      averageTokensPerActiveDay: summaryDays.length === 0 ? 0 : Math.round(totalTokens / summaryDays.length),
      currentStreak: streaks.current,
      longestStreak: streaks.longest,
      bestDay: bestDay ? { date: bestDay.date, tokens: bestDay.tokens, cost: Number(bestDay.cost.toFixed(4)) } : null,
      topModel: topModel ? { modelId: topModel.modelId, tokens: topModel.tokens, cost: Number(topModel.cost.toFixed(4)) } : null,
    },
    heatmap,
    trend: snapshot.trendByRange[range],
    byDate,
  };
}
