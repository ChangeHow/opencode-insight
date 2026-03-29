import type {
  CostSeriesLine,
  CostSeriesOption,
  DashboardSummary,
  DayBreakdown,
  ProviderInsight,
  TrendPoint,
} from "@opencode-dashboard/shared";
import type { UsageSnapshot } from "./types";
import { computeStreak } from "./streak";

export function buildSeries(
  days: DayBreakdown[],
): Pick<import("./types").RangeData, "seriesOptions" | "seriesLines"> {
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
      const key = `${model.providerId}/${model.modelId}`;
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
      const key = `${model.providerId}/${model.modelId}`;
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
