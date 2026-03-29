import type { TimeRange, TokenBreakdown, TrendPoint } from "@opencode-dashboard/shared";
import {
  DEFAULT_TIME_ZONE,
  getDateKeyWeekday,
  getPresetDateRange,
} from "@opencode-dashboard/shared";
import type { RawMessage, SourceKind, UsageSnapshot } from "./types";
import { totalTokens } from "./sqlite-reader";
import { buildDayMap } from "./day-map-builder";
import { computeStreak } from "./streak";

export function buildSnapshot(
  messages: RawMessage[],
  sourceKind: SourceKind,
  paths: string[],
): UsageSnapshot {
  const dayMap = buildDayMap(messages, DEFAULT_TIME_ZONE);
  const totalTokensAll = messages.reduce((sum, message) => sum + totalTokens(message.tokens), 0);
  const totalCostAll = messages.reduce((sum, message) => sum + message.estimatedCost, 0);
  const pricedTokensAll = messages.reduce((sum, message) => sum + message.pricedTokens, 0);
  const totalMessagesAll = messages.length;
  const orderedDates = [...dayMap.keys()].toSorted();
  const topModel =
    [...dayMap.values()].flatMap((day) => day.models).toSorted((a, b) => b.tokens - a.tokens)[0] ??
    null;
  const bestDay = [...dayMap.values()].toSorted((a, b) => b.tokens - a.tokens)[0] ?? null;
  const streaks = computeStreak(orderedDates);
  const maxTokens = Math.max(...[...dayMap.values()].map((item) => item.tokens), 0);

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
      cost: Number(day.cost.toFixed(4)),
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
  } satisfies Record<TimeRange, TrendPoint[]>;

  return {
    summary: {
      totalTokens: totalTokensAll,
      totalCost: Number(totalCostAll.toFixed(4)),
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
        ? { date: bestDay.date, tokens: bestDay.tokens, cost: Number(bestDay.cost.toFixed(4)) }
        : null,
      topModel: topModel
        ? {
            modelId: topModel.modelId,
            tokens: topModel.tokens,
            cost: Number(topModel.cost.toFixed(4)),
          }
        : null,
      availableRanges: ["7d", "month", "3mo", "year"],
      scannedAt: new Date().toISOString(),
      source: { kind: sourceKind, paths },
    },
    messages,
    heatmap,
    trendByRange,
    breakdownByDate: dayMap,
  };
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
