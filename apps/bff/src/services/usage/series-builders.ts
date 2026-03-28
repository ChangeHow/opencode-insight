import type {
  CostSeriesLine,
  CostSeriesOption,
  DashboardSummary,
  DayBreakdown,
  ProviderInsight,
  SessionBreakdown,
  TimeRange,
  TokenBreakdown,
  TrendPoint,
} from "@opencode-dashboard/shared";
import {
  DEFAULT_TIME_ZONE,
  formatDateInTimeZone,
  getDateKeyWeekday,
  getPresetDateRange,
  shiftDateKey,
} from "@opencode-dashboard/shared";
import type { RawMessage, RangeData, SourceKind, UsageSnapshot } from "./types";
import { emptyBreakdown, totalTokens } from "./sqlite-reader";

export function computeStreak(days: string[]) {
  if (days.length === 0) {
    return { current: 0, longest: 0 };
  }
  const set = new Set(days);
  let longest = 0;
  for (const day of days) {
    const previousDay = shiftDateKey(day, -1);
    if (set.has(previousDay)) {
      continue;
    }
    let streak = 1;
    let cursor = day;
    while (set.has(shiftDateKey(cursor, 1))) {
      streak += 1;
      cursor = shiftDateKey(cursor, 1);
    }
    longest = Math.max(longest, streak);
  }
  let current = 0;
  let cursor = days[days.length - 1];
  while (set.has(cursor)) {
    current += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return { current, longest };
}

export function buildSeries(
  days: DayBreakdown[],
): Pick<RangeData, "seriesOptions" | "seriesLines"> {
  const dateSet = new Set(days.map((day) => day.date));
  const sortedDates = [...dateSet].toSorted();
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
      const entry = map.get(key) ?? {
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
    .toSorted((left, right) => right.totalCost - left.totalCost)
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
      points: sortedDates.map(
        (date) => entry.points.get(date) ?? { date, cost: 0, tokens: 0, messages: 0 },
      ),
    };
  });

  return { seriesOptions, seriesLines };
}

export function buildProviderInsights(days: DayBreakdown[]) {
  const dateSet = new Set(days.map((day) => day.date));
  const sortedDates = [...dateSet].toSorted();
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
      const entry = map.get(model.providerId) ?? {
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
      const modelEntry = entry.models.get(model.modelId) ?? {
        modelId: model.modelId,
        tokens: 0,
        cost: 0,
      };
      modelEntry.tokens += model.tokens;
      modelEntry.cost += model.cost;
      entry.models.set(model.modelId, modelEntry);
      const point = entry.points.get(day.date) ?? {
        date: day.date,
        cost: 0,
        tokens: 0,
        messages: 0,
      };
      point.cost += model.cost;
      point.tokens += model.tokens;
      point.messages += model.messages;
      entry.points.set(day.date, point);
      map.set(model.providerId, entry);
    }
  }

  return [...map.values()]
    .map((entry) => {
      const topModel =
        [...entry.models.values()].toSorted(
          (left, right) => right.cost - left.cost || right.tokens - left.tokens,
        )[0] ?? null;
      return {
        providerId: entry.providerId,
        totalCost: Number(entry.totalCost.toFixed(4)),
        totalTokens: entry.totalTokens,
        pricedTokens: entry.pricedTokens,
        pricingCoverage:
          entry.totalTokens === 0 ? 0 : Number((entry.pricedTokens / entry.totalTokens).toFixed(4)),
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
        trend: sortedDates.map(
          (date) => entry.points.get(date) ?? { date, cost: 0, tokens: 0, messages: 0 },
        ),
      } satisfies ProviderInsight;
    })
    .toSorted(
      (left, right) => right.totalCost - left.totalCost || right.totalTokens - left.totalTokens,
    );
}

export function buildRangeSummary(snapshot: UsageSnapshot, summaryDays: DayBreakdown[]) {
  const totalTokens = summaryDays.reduce((sum, item) => sum + item.tokens, 0);
  const totalCost = summaryDays.reduce((sum, item) => sum + item.cost, 0);
  const pricedTokens = summaryDays.reduce((sum, item) => sum + item.pricedTokens, 0);
  const totalMessages = summaryDays.reduce((sum, item) => sum + item.messages, 0);
  const bestDay = [...summaryDays].toSorted((a, b) => b.tokens - a.tokens)[0] ?? null;
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

  const topModel = [...modelGroups.values()].toSorted((a, b) => b.tokens - a.tokens)[0] ?? null;
  const orderedDates = summaryDays.map((day) => day.date).toSorted();
  const streaks = computeStreak(orderedDates);

  return {
    ...snapshot.summary,
    totalTokens,
    totalCost: Number(totalCost.toFixed(4)),
    pricedTokens,
    pricingCoverage: totalTokens === 0 ? 0 : Number((pricedTokens / totalTokens).toFixed(4)),
    totalMessages,
    activeDays: summaryDays.length,
    averageTokensPerActiveDay:
      summaryDays.length === 0 ? 0 : Math.round(totalTokens / summaryDays.length),
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
  } satisfies DashboardSummary;
}

export function buildDayMap(messages: RawMessage[], timeZone: string) {
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
  const sessionMap = new Map<
    string,
    {
      date: string;
      sessionId: string;
      title: string;
      slug: string;
      directory: string;
      tokens: number;
      pricedTokens: number;
      cost: number;
      messages: number;
      breakdown: TokenBreakdown;
      models: Map<string, SessionBreakdown["models"][number]>;
    }
  >();

  for (const message of messages) {
    const date = formatDateInTimeZone(message.timestampMs, timeZone);
    const day = dayMap.get(date) ?? {
      date,
      tokens: 0,
      pricedTokens: 0,
      cost: 0,
      messages: 0,
      breakdown: emptyBreakdown(),
      models: [],
      sessions: [],
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

    const modelKey = `${date}:${message.providerId}:${message.modelId}`;
    const model = modelMap.get(modelKey) ?? {
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

    const sessionKey = `${date}:${message.sessionId}`;
    const sessionEntry = sessionMap.get(sessionKey) ?? {
      date,
      sessionId: message.sessionId,
      title: message.sessionTitle,
      slug: message.sessionSlug,
      directory: message.sessionDirectory,
      tokens: 0,
      pricedTokens: 0,
      cost: 0,
      messages: 0,
      breakdown: emptyBreakdown(),
      models: new Map<string, SessionBreakdown["models"][number]>(),
    };
    sessionEntry.tokens += messageTokens;
    sessionEntry.pricedTokens += message.pricedTokens;
    sessionEntry.cost += message.estimatedCost;
    sessionEntry.messages += 1;
    sessionEntry.breakdown.input += message.tokens.input;
    sessionEntry.breakdown.output += message.tokens.output;
    sessionEntry.breakdown.cacheRead += message.tokens.cacheRead;
    sessionEntry.breakdown.cacheWrite += message.tokens.cacheWrite;
    sessionEntry.breakdown.reasoning += message.tokens.reasoning;

    const sessionModelKey = `${message.providerId}:${message.modelId}`;
    const sessionModel = sessionEntry.models.get(sessionModelKey) ?? {
      modelId: message.modelId,
      providerId: message.providerId,
      tokens: 0,
      pricedTokens: 0,
      cost: 0,
      messages: 0,
      breakdown: emptyBreakdown(),
    };
    sessionModel.tokens += messageTokens;
    sessionModel.pricedTokens += message.pricedTokens;
    sessionModel.cost += message.estimatedCost;
    sessionModel.messages += 1;
    sessionModel.breakdown.input += message.tokens.input;
    sessionModel.breakdown.output += message.tokens.output;
    sessionModel.breakdown.cacheRead += message.tokens.cacheRead;
    sessionModel.breakdown.cacheWrite += message.tokens.cacheWrite;
    sessionModel.breakdown.reasoning += message.tokens.reasoning;
    sessionEntry.models.set(sessionModelKey, sessionModel);
    sessionMap.set(sessionKey, sessionEntry);
    dayMap.set(date, day);
  }

  for (const [key, model] of modelMap.entries()) {
    const [date] = key.split(":");
    const day = dayMap.get(date);
    if (day) day.models.push(model);
  }
  for (const session of sessionMap.values()) {
    const day = dayMap.get(session.date);
    if (!day) continue;
    day.sessions.push({
      sessionId: session.sessionId,
      title: session.title,
      slug: session.slug,
      directory: session.directory,
      tokens: session.tokens,
      pricedTokens: session.pricedTokens,
      cost: Number(session.cost.toFixed(4)),
      messages: session.messages,
      breakdown: session.breakdown,
      models: [...session.models.values()].toSorted(
        (a, b) => b.cost - a.cost || b.tokens - a.tokens,
      ),
    });
  }
  for (const day of dayMap.values()) {
    day.models.sort((a, b) => b.cost - a.cost || b.tokens - a.tokens);
    day.sessions.sort(
      (a, b) => b.tokens - a.tokens || b.cost - a.cost || a.sessionId.localeCompare(b.sessionId),
    );
  }
  return dayMap;
}

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
