import type {
  CostSeriesOption,
  DashboardSummary,
  RemoteUsagePayload,
  TrendPoint,
} from "@opencode-dashboard/shared";

function buildBreakdown(local: number, remote: number) {
  return { local, remote, total: local + remote };
}

function dateToTime(value: string) {
  return new Date(`${value}T00:00:00Z`).getTime();
}

function buildStreaks(dates: string[]) {
  const sorted = [...new Set(dates)].toSorted();
  let longest = 0;
  let current = 0;
  let previous = 0;

  for (const date of sorted) {
    const time = dateToTime(date);
    current = previous > 0 && time - previous === 86_400_000 ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = time;
  }

  return { current, longest };
}

function buildCombinedTrend(trend: TrendPoint[], remote: RemoteUsagePayload | null) {
  const byDate = new Map<string, TrendPoint>();
  for (const point of trend) {
    byDate.set(point.date, { ...point });
  }
  for (const row of remote?.rows ?? []) {
    const current = byDate.get(row.date) ?? { date: row.date, tokens: 0, cost: 0, messages: 0 };
    current.tokens += row.tokens;
    current.cost = Number((current.cost + row.cost).toFixed(4));
    current.messages += row.messages;
    byDate.set(row.date, current);
  }
  return [...byDate.values()].toSorted((left, right) => left.date.localeCompare(right.date));
}

function findBestDay(trend: TrendPoint[]) {
  return trend.reduce<TrendPoint | null>(
    (best, point) => (!best || point.tokens > best.tokens ? point : best),
    null,
  );
}

function findTopModel(options: CostSeriesOption[], remote: RemoteUsagePayload | null) {
  type TopModel = { providerId: string; modelId: string; tokens: number; cost: number };
  const byKey = new Map<string, TopModel>();

  for (const option of options) {
    byKey.set(option.key, {
      providerId: option.providerId,
      modelId: option.modelId,
      tokens: option.totalTokens,
      cost: option.totalCost,
    });
  }
  for (const row of remote?.rows ?? []) {
    const key = `${row.providerId}:${row.modelId}`;
    const current = byKey.get(key) ?? {
      providerId: row.providerId,
      modelId: row.modelId,
      tokens: 0,
      cost: 0,
    };
    current.tokens += row.tokens;
    current.cost += row.cost;
    byKey.set(key, current);
  }

  return [...byKey.values()].reduce<TopModel | null>(
    (best, model) => (!best || model.tokens > best.tokens ? model : best),
    null,
  );
}

export function buildCombinedOverviewMetrics(input: {
  summary: DashboardSummary | null;
  trend: TrendPoint[];
  seriesOptions: CostSeriesOption[];
  remote: RemoteUsagePayload | null;
}) {
  const localCost = input.summary?.totalCost ?? 0;
  const localTokens = input.summary?.totalTokens ?? 0;
  const localPricedTokens = input.summary?.pricedTokens ?? 0;
  const localMessages = input.summary?.totalMessages ?? 0;
  const remoteCost = input.remote?.totals.cost ?? 0;
  const remoteTokens = input.remote?.totals.tokens ?? 0;
  const remotePricedTokens = input.remote?.totals.pricedTokens ?? 0;
  const remoteMessages = input.remote?.totals.messages ?? 0;
  const combinedTrend = buildCombinedTrend(input.trend, input.remote);
  const activeDates = combinedTrend
    .filter((point) => point.tokens > 0 || point.cost > 0 || point.messages > 0)
    .map((point) => point.date);
  const remoteActiveDays = new Set(input.remote?.rows.map((row) => row.date) ?? []).size;
  const activeDays = activeDates.length;
  const averageTokens = activeDays > 0 ? (localTokens + remoteTokens) / activeDays : 0;
  const remoteAverageTokens = remoteActiveDays > 0 ? remoteTokens / remoteActiveDays : 0;
  const streaks = buildStreaks(activeDates);
  const bestDay = findBestDay(combinedTrend);
  const topModel = findTopModel(input.seriesOptions, input.remote);
  const pricedTokens = localPricedTokens + remotePricedTokens;
  const totalTokens = localTokens + remoteTokens;

  return {
    trend: combinedTrend,
    cost: buildBreakdown(localCost, remoteCost),
    tokens: buildBreakdown(localTokens, remoteTokens),
    messages: buildBreakdown(localMessages, remoteMessages),
    activeDays: buildBreakdown(input.summary?.activeDays ?? 0, remoteActiveDays),
    averageTokens: buildBreakdown(
      input.summary?.averageTokensPerActiveDay ?? 0,
      remoteAverageTokens,
    ),
    combinedActiveDays: activeDays,
    combinedAverageTokens: averageTokens,
    currentStreak: streaks.current,
    longestStreak: streaks.longest,
    bestDay,
    topModel,
    pricingCoverage: totalTokens > 0 ? pricedTokens / totalTokens : 0,
  };
}
