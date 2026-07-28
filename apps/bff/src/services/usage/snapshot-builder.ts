import type {
  DayBreakdown,
  TimeRange,
  TokenBreakdown,
  TrendPoint,
} from "@opencode-dashboard/shared";
import {
  DEFAULT_TIME_ZONE,
  formatDateInTimeZone,
  getDateKeyWeekday,
  getPresetDateRange,
} from "@opencode-dashboard/shared";
import { roundCost } from "../cost";
import type { RawMessage, SourceKind, UsageSnapshot } from "./types";
import { buildDayMap } from "./day-map-builder";
import { computeStreak } from "./streak";

export function buildSnapshot(
  messages: RawMessage[],
  sourceKind: SourceKind,
  paths: string[],
): UsageSnapshot {
  const dayMap = buildDayMap(messages, DEFAULT_TIME_ZONE);
  return buildSnapshotFromDayMap(messages, dayMap, sourceKind, paths);
}

export function buildIncrementalSnapshot(
  baseSnapshot: UsageSnapshot,
  recentMessages: RawMessage[],
  refreshStartTimestampMs: number,
  sourceKind: SourceKind,
  paths: string[],
): UsageSnapshot {
  const refreshStartDateKey = formatDateInTimeZone(refreshStartTimestampMs, DEFAULT_TIME_ZONE);
  const alignedRefreshStartTimestampMs = Date.parse(`${refreshStartDateKey}T00:00:00.000Z`);
  const normalizedRecentMessages = dedupeAndSortMessages(recentMessages);
  const firstRecentIndex = findFirstMessageAtOrAfter(
    baseSnapshot.messages,
    alignedRefreshStartTimestampMs,
  );
  const recentIds = new Set(normalizedRecentMessages.map((message) => message.id));
  const historicalMessages = baseSnapshot.messages
    .slice(0, firstRecentIndex)
    .filter((message) => !recentIds.has(message.id));
  const messages = [...historicalMessages, ...normalizedRecentMessages];
  const dayMap = new Map<string, DayBreakdown>();

  for (const [date, day] of baseSnapshot.breakdownByDate) {
    if (date < refreshStartDateKey) {
      dayMap.set(date, day);
    }
  }
  for (const [date, day] of buildDayMap(normalizedRecentMessages, DEFAULT_TIME_ZONE)) {
    dayMap.set(date, day);
  }

  return buildSnapshotFromDayMap(messages, dayMap, sourceKind, paths);
}

function buildSnapshotFromDayMap(
  messages: RawMessage[],
  dayMap: Map<string, DayBreakdown>,
  sourceKind: SourceKind,
  paths: string[],
): UsageSnapshot {
  const days = [...dayMap.values()];
  const totalTokensAll = days.reduce((sum, day) => sum + day.tokens, 0);
  const totalCostAll = days.reduce((sum, day) => sum + day.cost, 0);
  const pricedTokensAll = days.reduce((sum, day) => sum + day.pricedTokens, 0);
  const totalMessagesAll = days.reduce((sum, day) => sum + day.messages, 0);
  const orderedDates = [...dayMap.keys()].toSorted();
  const topModel =
    days.flatMap((day) => day.models).toSorted((a, b) => b.tokens - a.tokens)[0] ?? null;
  const bestDay = days.toSorted((a, b) => b.tokens - a.tokens)[0] ?? null;
  const streaks = computeStreak(orderedDates);
  const maxTokens = Math.max(...days.map((item) => item.tokens), 0);

  const heatmap: {
    date: string;
    weekday: number;
    weekIndex: number;
    tokens: number;
    cost: number;
    messages: number;
    breakdown: TokenBreakdown;
    intensity: 0 | 1 | 2 | 3 | 4;
  }[] = orderedDates.map((date, index) => {
    const day = dayMap.get(date)!;
    const weekday = getDateKeyWeekday(date);
    const intensity =
      maxTokens === 0 ? 0 : (Math.ceil((day.tokens / maxTokens) * 4) as 1 | 2 | 3 | 4);
    return {
      date,
      weekday,
      weekIndex: Math.floor(index / 7),
      tokens: day.tokens,
      cost: roundCost(day.cost),
      messages: day.messages,
      breakdown: day.breakdown,
      intensity: day.tokens === 0 ? 0 : intensity,
    };
  });

  const trendByRange = {
    "7d": buildTrend(heatmap, "7d", DEFAULT_TIME_ZONE),
    month: buildTrend(heatmap, "month", DEFAULT_TIME_ZONE),
    "3mo": buildTrend(heatmap, "3mo", DEFAULT_TIME_ZONE),
    year: buildTrend(heatmap, "year", DEFAULT_TIME_ZONE),
    all: heatmap.map(({ date, tokens, cost, messages: messageCount }) => ({
      date,
      tokens,
      cost,
      messages: messageCount,
    })),
  } satisfies Record<TimeRange, TrendPoint[]>;

  return {
    summary: {
      totalTokens: totalTokensAll,
      totalCost: roundCost(totalCostAll),
      pricedTokens: pricedTokensAll,
      pricingCoverage:
        totalTokensAll === 0 ? 0 : Number((pricedTokensAll / totalTokensAll).toFixed(4)),
      totalMessages: totalMessagesAll,
      activeDays: orderedDates.length,
      averageTokensPerActiveDay:
        orderedDates.length === 0 ? 0 : Math.round(totalTokensAll / orderedDates.length),
      currentStreak: streaks.current,
      longestStreak: streaks.longest,
      bestDay: bestDay
        ? { date: bestDay.date, tokens: bestDay.tokens, cost: roundCost(bestDay.cost) }
        : null,
      topModel: topModel
        ? {
            modelId: topModel.modelId,
            tokens: topModel.tokens,
            cost: roundCost(topModel.cost),
          }
        : null,
      availableRanges: ["7d", "month", "3mo", "year", "all"],
      scannedAt: new Date().toISOString(),
      source: { kind: sourceKind, paths },
    },
    dataFingerprint: "",
    messages,
    heatmap,
    trendByRange,
    breakdownByDate: dayMap,
  };
}

function dedupeAndSortMessages(messages: RawMessage[]) {
  const byId = new Map<string, RawMessage>();
  for (const message of messages) {
    if (!byId.has(message.id)) {
      byId.set(message.id, message);
    }
  }
  return [...byId.values()].toSorted((left, right) => left.timestampMs - right.timestampMs);
}

function findFirstMessageAtOrAfter(messages: RawMessage[], timestampMs: number) {
  let low = 0;
  let high = messages.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (messages[middle].timestampMs < timestampMs) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function buildTrend(
  heatmap: { date: string; tokens: number; cost: number; messages: number }[],
  range: TimeRange,
  timeZone: string,
): TrendPoint[] {
  const { start, end } = getPresetDateRange(range, { timeZone });
  return heatmap
    .filter((day) => day.date >= start && day.date <= end)
    .map((day) => ({ date: day.date, tokens: day.tokens, cost: day.cost, messages: day.messages }));
}
