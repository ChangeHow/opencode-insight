import type { DayBreakdown, HeatmapDay, TimeRange } from "@opencode-dashboard/shared";
import {
  DEFAULT_TIME_ZONE,
  getDateKeyWeekday,
  getPresetDateRange,
  shiftDateKey,
} from "@opencode-dashboard/shared";
import { roundCost } from "../cost";
import type { RangeData, UsageSnapshot } from "./types";
import { emptyBreakdown } from "./sqlite-reader";
import { filterMessagesByProvider } from "./snapshot";
import { buildDayMap } from "./day-map-builder";
import { buildProviderInsights, buildRangeSummary, buildSeries } from "./range-summary";
import { buildSnapshot } from "./snapshot-builder";

export { buildDayMap, buildSnapshot };

function emptyDayBreakdown(date: string): DayBreakdown {
  return {
    date,
    tokens: 0,
    pricedTokens: 0,
    cost: 0,
    messages: 0,
    breakdown: emptyBreakdown(),
    models: [],
    sessions: [],
  };
}

function getPresetBounds(range: TimeRange, timeZone: string) {
  return getPresetDateRange(range, { timeZone });
}

function nextDate(date: string) {
  return shiftDateKey(date, 1);
}

function resolveWindowBounds(dates: string[], start?: string, end?: string) {
  const sortedDates = [...dates].toSorted();
  const rangeStart = start ?? sortedDates[0] ?? end;
  const rangeEnd = end ?? sortedDates[sortedDates.length - 1] ?? start;
  if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) {
    return null;
  }
  return { start: rangeStart, end: rangeEnd };
}

function buildContinuousBreakdowns(
  daysByDate: Map<string, DayBreakdown>,
  start?: string,
  end?: string,
) {
  const bounds = resolveWindowBounds([...daysByDate.keys()], start, end);
  if (!bounds) {
    return [] as DayBreakdown[];
  }
  const days: DayBreakdown[] = [];
  let cursor = bounds.start;
  while (cursor <= bounds.end) {
    days.push(daysByDate.get(cursor) ?? emptyDayBreakdown(cursor));
    cursor = nextDate(cursor);
  }
  return days;
}

function filterDayByModels(day: DayBreakdown, modelKeys: string[]) {
  if (modelKeys.length === 0) {
    return day;
  }
  const allowed = new Set(modelKeys);
  const models = day.models.filter((model) => allowed.has(`${model.providerId}/${model.modelId}`));
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
    sessions: day.sessions,
  } satisfies DayBreakdown;
}

function buildHeatmap(days: DayBreakdown[]) {
  const maxTokens = Math.max(...days.map((item) => item.tokens), 0);
  return days.map((day, index) => {
    const weekday = getDateKeyWeekday(day.date);
    const intensity: HeatmapDay["intensity"] =
      day.tokens === 0 || maxTokens === 0
        ? 0
        : (Math.ceil((day.tokens / maxTokens) * 4) as 1 | 2 | 3 | 4);
    return {
      date: day.date,
      weekday,
      weekIndex: Math.floor(index / 7),
      tokens: day.tokens,
      cost: roundCost(day.cost),
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
    cost: roundCost(day.cost),
    messages: day.messages,
  }));
}

export function getRangeData(
  snapshot: UsageSnapshot,
  range: TimeRange,
  modelKeys: string[] = [],
  timeZone = DEFAULT_TIME_ZONE,
  providerId?: string,
): RangeData {
  const { start, end } = getPresetBounds(range, timeZone);
  const sourceByDate = buildDayMap(
    filterMessagesByProvider(snapshot.messages, providerId),
    timeZone,
  );
  const byDate = new Map<string, DayBreakdown>();
  for (const [date, breakdown] of sourceByDate.entries()) {
    if (date >= start && date <= end) {
      byDate.set(date, filterDayByModels(breakdown, modelKeys));
    }
  }
  const windowBreakdowns = buildContinuousBreakdowns(byDate, start, end);
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

export function getDateFilteredData(
  snapshot: UsageSnapshot,
  start?: string,
  end?: string,
  modelKeys: string[] = [],
  timeZone = DEFAULT_TIME_ZONE,
  providerId?: string,
): RangeData {
  const sourceByDate = buildDayMap(
    filterMessagesByProvider(snapshot.messages, providerId),
    timeZone,
  );
  const byDate = new Map<string, DayBreakdown>();
  for (const [date, breakdown] of sourceByDate.entries()) {
    if ((!start || date >= start) && (!end || date <= end)) {
      byDate.set(date, filterDayByModels(breakdown, modelKeys));
    }
  }
  const windowBreakdowns = buildContinuousBreakdowns(byDate, start, end);
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
