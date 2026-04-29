import crypto from "node:crypto";
import type { TokenBreakdown, UsageSyncDay, UsageSyncRow } from "@opencode-dashboard/shared";
import type { LocalUsageSyncData, UsageSnapshot } from "../usage/types";

const DEFAULT_SYNC_WINDOW_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

type LocalSyncMode = "history" | "window";

function emptyBreakdown(): TokenBreakdown {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 };
}

function totalTokens(breakdown: TokenBreakdown) {
  return (
    breakdown.input +
    breakdown.output +
    breakdown.cacheRead +
    breakdown.cacheWrite +
    breakdown.reasoning
  );
}

function getUtcDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function getSyncWindowBounds(days = DEFAULT_SYNC_WINDOW_DAYS, now: Date | number = new Date()) {
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);
  const end = getUtcDateKey(date);
  date.setUTCDate(date.getUTCDate() - (days - 1));
  return { start: getUtcDateKey(date), end };
}

function getDateKeys(start: string, end: string) {
  const dates: string[] = [];
  for (let cursor = new Date(`${start}T00:00:00.000Z`); getUtcDateKey(cursor) <= end; ) {
    dates.push(getUtcDateKey(cursor));
    cursor = new Date(cursor.getTime() + DAY_MS);
  }
  return dates;
}

function getHistoryBounds(dates: string[]) {
  const sortedDates = dates.toSorted();
  const start = sortedDates[0];
  const end = sortedDates.at(-1);
  return start && end ? { start, end } : null;
}

function hashDay(day: Omit<UsageSyncDay, "hash">) {
  return crypto.createHash("sha256").update(JSON.stringify(day)).digest("hex");
}

function normalizeRow(row: UsageSyncRow): UsageSyncRow {
  return {
    providerId: row.providerId,
    modelId: row.modelId,
    tokens: Math.max(0, Math.trunc(row.tokens)),
    pricedTokens: Math.max(0, Math.trunc(row.pricedTokens)),
    cost: Number(row.cost.toFixed(4)),
    messages: Math.max(0, Math.trunc(row.messages)),
    breakdown: {
      input: Math.max(0, Math.trunc(row.breakdown.input)),
      output: Math.max(0, Math.trunc(row.breakdown.output)),
      cacheRead: Math.max(0, Math.trunc(row.breakdown.cacheRead)),
      cacheWrite: Math.max(0, Math.trunc(row.breakdown.cacheWrite)),
      reasoning: Math.max(0, Math.trunc(row.breakdown.reasoning)),
    },
  };
}

export function buildLocalSyncData(
  snapshot: UsageSnapshot,
  options?: { mode?: LocalSyncMode; windowDays?: number; now?: Date | number },
) {
  const mode = options?.mode ?? "window";
  const bounds =
    mode === "history"
      ? getHistoryBounds(snapshot.messages.map((message) => message.date))
      : getSyncWindowBounds(options?.windowDays, options?.now);
  if (!bounds) {
    return { generatedAt: new Date().toISOString(), days: [] } satisfies LocalUsageSyncData;
  }

  const { start, end } = bounds;
  const dayRows = new Map<string, Map<string, UsageSyncRow>>();

  for (const message of snapshot.messages) {
    if (message.date < start || message.date > end) {
      continue;
    }

    const rows = dayRows.get(message.date) ?? new Map<string, UsageSyncRow>();
    const key = `${message.providerId}:${message.modelId}`;
    const row = rows.get(key) ?? {
      providerId: message.providerId,
      modelId: message.modelId,
      tokens: 0,
      pricedTokens: 0,
      cost: 0,
      messages: 0,
      breakdown: emptyBreakdown(),
    };

    row.tokens += totalTokens(message.tokens);
    row.pricedTokens += message.pricedTokens;
    row.cost += message.estimatedCost;
    row.messages += 1;
    row.breakdown.input += message.tokens.input;
    row.breakdown.output += message.tokens.output;
    row.breakdown.cacheRead += message.tokens.cacheRead;
    row.breakdown.cacheWrite += message.tokens.cacheWrite;
    row.breakdown.reasoning += message.tokens.reasoning;
    rows.set(key, row);
    dayRows.set(message.date, rows);
  }

  const dates = mode === "history" ? [...dayRows.keys()].toSorted() : getDateKeys(start, end);
  const days = dates.map((date) => {
    const rows = dayRows.get(date) ?? new Map<string, UsageSyncRow>();
    const day = {
      date,
      rows: [...rows.values()]
        .map(normalizeRow)
        .toSorted(
          (left, right) =>
            left.providerId.localeCompare(right.providerId) ||
            left.modelId.localeCompare(right.modelId),
        ),
    };
    return { ...day, hash: hashDay(day) };
  });

  return { generatedAt: new Date().toISOString(), days } satisfies LocalUsageSyncData;
}

export function selectDaysToPush(
  localDays: UsageSyncDay[],
  previousHashes: Record<string, string>,
) {
  return localDays.filter((day) => previousHashes[day.date] !== day.hash);
}
