import type {
  TokenBreakdown,
  ModelBreakdown,
  DayBreakdown,
  HeatmapDay,
  TrendPoint,
  DashboardSummary,
  CostSeriesOption,
  CostSeriesLine,
  CostSeriesPayload,
  ProviderDashboardPayload,
  ProviderInsight,
  ProviderInsightsPayload,
  SessionBreakdown,
} from "@opencode-dashboard/shared";

export function makeTokenBreakdown(overrides?: Partial<TokenBreakdown>): TokenBreakdown {
  return {
    input: 5000,
    output: 1500,
    cacheRead: 0,
    cacheWrite: 0,
    reasoning: 0,
    ...overrides,
  };
}

export function makeModelBreakdown(overrides?: Partial<ModelBreakdown>): ModelBreakdown {
  const breakdown = makeTokenBreakdown();
  const tokens =
    breakdown.input +
    breakdown.output +
    breakdown.cacheRead +
    breakdown.cacheWrite +
    breakdown.reasoning;

  return {
    modelId: "claude-3-5-sonnet-20241022",
    providerId: "anthropic",
    tokens,
    pricedTokens: tokens,
    cost: 0.05,
    messages: 10,
    breakdown,
    ...overrides,
  };
}

export function makeDayBreakdown(date?: string, overrides?: Partial<DayBreakdown>): DayBreakdown {
  const defaultDate = date ?? "2025-01-15";
  const model = makeModelBreakdown();

  return {
    date: defaultDate,
    tokens: model.tokens,
    pricedTokens: model.pricedTokens,
    cost: model.cost,
    messages: model.messages,
    breakdown: model.breakdown,
    models: [model],
    sessions: [makeSessionBreakdown(undefined, { models: [model] })],
    ...overrides,
  };
}

export function makeSessionBreakdown(
  sessionId?: string,
  overrides?: Partial<SessionBreakdown>,
): SessionBreakdown {
  const id = sessionId ?? "ses_123";
  const model = makeModelBreakdown();

  return {
    sessionId: id,
    runtime: "opencode",
    title: "Session title",
    slug: "calm-river",
    directory: "/Users/changehow/workspace/opencode-token-dashboard",
    tokens: model.tokens,
    pricedTokens: model.pricedTokens,
    cost: model.cost,
    messages: model.messages,
    breakdown: model.breakdown,
    models: [model],
    ...overrides,
  };
}

export function makeHeatmapDay(date?: string, overrides?: Partial<HeatmapDay>): HeatmapDay {
  const defaultDate = date ?? "2025-01-15";
  const breakdown = makeTokenBreakdown();
  const tokens =
    breakdown.input +
    breakdown.output +
    breakdown.cacheRead +
    breakdown.cacheWrite +
    breakdown.reasoning;

  const dateObj = new Date(`${defaultDate}T00:00:00.000Z`);
  const weekday = dateObj.getUTCDay();
  const firstDayOfYear = new Date(dateObj.getUTCFullYear(), 0, 1);
  const daysSinceStart = Math.floor(
    (dateObj.getTime() - firstDayOfYear.getTime()) / (1000 * 60 * 60 * 24),
  );
  const weekIndex = Math.floor(daysSinceStart / 7);

  return {
    date: defaultDate,
    weekday,
    weekIndex,
    tokens,
    cost: 0.05,
    messages: 10,
    breakdown,
    intensity: 2 as 0 | 1 | 2 | 3 | 4,
    ...overrides,
  };
}

export function makeTrendPoint(date?: string, overrides?: Partial<TrendPoint>): TrendPoint {
  const defaultDate = date ?? "2025-01-15";

  return {
    date: defaultDate,
    tokens: 6500,
    cost: 0.05,
    messages: 10,
    ...overrides,
  };
}

export function makeDashboardSummary(overrides?: Partial<DashboardSummary>): DashboardSummary {
  return {
    totalTokens: 100000,
    totalCost: 2.5,
    pricedTokens: 100000,
    pricingCoverage: 1.0,
    totalMessages: 150,
    activeDays: 12,
    averageTokensPerActiveDay: 8333,
    currentStreak: 3,
    longestStreak: 7,
    bestDay: {
      date: "2025-01-15",
      tokens: 15000,
      cost: 0.35,
    },
    topModel: {
      modelId: "claude-3-5-sonnet-20241022",
      tokens: 50000,
      cost: 1.2,
    },
    availableRanges: ["month", "3mo", "year", "all"],
    scannedAt: new Date().toISOString(),
    source: {
      kind: "sqlite",
      paths: ["/path/to/db.sqlite"],
    },
    ...overrides,
  };
}

export function makeCostSeriesOption(overrides?: Partial<CostSeriesOption>): CostSeriesOption {
  return {
    key: "anthropic/claude-3-5-sonnet-20241022",
    label: "Claude 3.5 Sonnet",
    providerId: "anthropic",
    modelId: "claude-3-5-sonnet-20241022",
    totalCost: 1.2,
    totalTokens: 50000,
    totalMessages: 75,
    ...overrides,
  };
}

export function makeCostSeriesLine(overrides?: Partial<CostSeriesLine>): CostSeriesLine {
  return {
    key: "anthropic/claude-3-5-sonnet-20241022",
    label: "Claude 3.5 Sonnet",
    providerId: "anthropic",
    modelId: "claude-3-5-sonnet-20241022",
    points: [makeTrendPoint("2025-01-15"), makeTrendPoint("2025-01-16")],
    ...overrides,
  };
}

export function makeProviderInsight(overrides?: Partial<ProviderInsight>): ProviderInsight {
  return {
    providerId: "anthropic",
    totalCost: 1.5,
    totalTokens: 60000,
    pricedTokens: 60000,
    pricingCoverage: 1.0,
    totalMessages: 90,
    activeDays: 10,
    modelCount: 2,
    topModel: {
      modelId: "claude-3-5-sonnet-20241022",
      tokens: 50000,
      cost: 1.2,
    },
    trend: [makeTrendPoint("2025-01-15"), makeTrendPoint("2025-01-16")],
    ...overrides,
  };
}

export function makeCostSeriesPayload(overrides?: Partial<CostSeriesPayload>): CostSeriesPayload {
  return {
    options: [makeCostSeriesOption()],
    lines: [makeCostSeriesLine()],
    ...overrides,
  };
}

export function makeProviderInsightsPayload(
  overrides?: Partial<ProviderInsightsPayload>,
): ProviderInsightsPayload {
  return {
    providers: [makeProviderInsight()],
    ...overrides,
  };
}

export function makeProviderDashboardPayload(
  overrides?: Partial<ProviderDashboardPayload>,
): ProviderDashboardPayload {
  const provider = makeProviderInsight();
  const summary = makeDashboardSummary({
    totalCost: provider.totalCost,
    totalTokens: provider.totalTokens,
    totalMessages: provider.totalMessages,
  });
  const series = makeCostSeriesPayload({
    options: [makeCostSeriesOption({ providerId: provider.providerId })],
    lines: [makeCostSeriesLine({ providerId: provider.providerId })],
  });

  return {
    provider,
    summary,
    heatmap: [makeHeatmapDay()],
    trend: provider.trend,
    series,
    providers: [provider],
    selectedDay: null,
    ...overrides,
  };
}
