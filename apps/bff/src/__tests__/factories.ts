import type {
  TokenBreakdown,
  ModelBreakdown,
  DayBreakdown,
  HeatmapDay,
  TrendPoint,
  DashboardSummary,
  CostSeriesOption,
  CostSeriesLine,
  ProviderInsight,
  SessionBreakdown,
  TimeRange,
} from "@opencode-dashboard/shared";

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
  messages: Array<{
    id: string;
    sessionId: string;
    sessionTitle: string;
    sessionSlug: string;
    sessionDirectory: string;
    date: string;
    timestampMs: number;
    modelId: string;
    providerId: string;
    cost: number;
    estimatedCost: number;
    pricedTokens: number;
    tokens: TokenBreakdown;
  }>;
  heatmap: HeatmapDay[];
  trendByRange: Record<TimeRange, TrendPoint[]>;
  breakdownByDate: Map<string, DayBreakdown>;
}

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
  const tokens = breakdown.input + breakdown.output + breakdown.cacheRead + breakdown.cacheWrite + breakdown.reasoning;
  
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

export function makeSessionBreakdown(sessionId?: string, overrides?: Partial<SessionBreakdown>): SessionBreakdown {
  const id = sessionId ?? "ses_123";
  const model = makeModelBreakdown();
  return {
    sessionId: id,
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

export function makeRawMessage(date = "2025-01-15", overrides?: Partial<UsageSnapshot["messages"][number]>) {
  const timestampMs = new Date(`${date}T12:00:00.000Z`).getTime();
  const tokens = makeTokenBreakdown();
  return {
    id: `msg_${date}`,
    sessionId: "ses_123",
    sessionTitle: "Session title",
    sessionSlug: "calm-river",
    sessionDirectory: "/Users/changehow/workspace/opencode-token-dashboard",
    date,
    timestampMs,
    modelId: "claude-3-5-sonnet-20241022",
    providerId: "anthropic",
    cost: 0.05,
    estimatedCost: 0.05,
    pricedTokens: tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite + tokens.reasoning,
    tokens,
    ...overrides,
  };
}

export function makeHeatmapDay(date?: string, overrides?: Partial<HeatmapDay>): HeatmapDay {
  const defaultDate = date ?? "2025-01-15";
  const breakdown = makeTokenBreakdown();
  const tokens = breakdown.input + breakdown.output + breakdown.cacheRead + breakdown.cacheWrite + breakdown.reasoning;
  
  const dateObj = new Date(`${defaultDate}T00:00:00.000Z`);
  const weekday = dateObj.getUTCDay();
  const firstDayOfYear = new Date(dateObj.getUTCFullYear(), 0, 1);
  const daysSinceStart = Math.floor((dateObj.getTime() - firstDayOfYear.getTime()) / (1000 * 60 * 60 * 24));
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
    availableRanges: ["7d", "month", "3mo", "year"],
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
    points: [
      makeTrendPoint("2025-01-15"),
      makeTrendPoint("2025-01-16"),
    ],
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
    trend: [
      makeTrendPoint("2025-01-15"),
      makeTrendPoint("2025-01-16"),
    ],
    ...overrides,
  };
}

export function makeRangeData(options?: {
  summary?: Partial<DashboardSummary>;
  heatmap?: HeatmapDay[];
  trend?: TrendPoint[];
  byDate?: Map<string, DayBreakdown>;
  seriesOptions?: CostSeriesOption[];
  seriesLines?: CostSeriesLine[];
  providers?: ProviderInsight[];
}): RangeData {
  return {
    summary: makeDashboardSummary(options?.summary),
    heatmap: options?.heatmap ?? [makeHeatmapDay("2025-01-15"), makeHeatmapDay("2025-01-16")],
    trend: options?.trend ?? [makeTrendPoint("2025-01-15"), makeTrendPoint("2025-01-16")],
    byDate: options?.byDate ?? new Map([
      ["2025-01-15", makeDayBreakdown("2025-01-15")],
      ["2025-01-16", makeDayBreakdown("2025-01-16")],
    ]),
    seriesOptions: options?.seriesOptions ?? [makeCostSeriesOption()],
    seriesLines: options?.seriesLines ?? [makeCostSeriesLine()],
    providers: options?.providers ?? [makeProviderInsight()],
  };
}

export function makeUsageSnapshot(options?: {
  summary?: Partial<DashboardSummary>;
  messages?: UsageSnapshot["messages"];
  heatmap?: HeatmapDay[];
  trendByRange?: Partial<Record<TimeRange, TrendPoint[]>>;
  breakdownByDate?: Map<string, DayBreakdown>;
}): UsageSnapshot {
  const defaultTrend = [makeTrendPoint("2025-01-15"), makeTrendPoint("2025-01-16")];
  const breakdownByDate = options?.breakdownByDate ?? new Map([
    ["2025-01-15", makeDayBreakdown("2025-01-15")],
    ["2025-01-16", makeDayBreakdown("2025-01-16")],
  ]);
  
  return {
    summary: makeDashboardSummary(options?.summary),
    messages: options?.messages ?? [...breakdownByDate.keys()].map((date, index) => makeRawMessage(date, { id: `msg_${index}_${date}` })),
    heatmap: options?.heatmap ?? [makeHeatmapDay("2025-01-15"), makeHeatmapDay("2025-01-16")],
    trendByRange: {
      "7d": defaultTrend,
      month: defaultTrend,
      "3mo": defaultTrend,
      year: defaultTrend,
      ...options?.trendByRange,
    },
    breakdownByDate,
  };
}

export function makePricingDataset(
  entries?: Record<string, {
    input_cost_per_token?: number;
    output_cost_per_token?: number;
    cache_read_input_token_cost?: number;
    cache_creation_input_token_cost?: number;
    input_cost_per_token_above_200k_tokens?: number;
    output_cost_per_token_above_200k_tokens?: number;
    cache_creation_input_token_cost_above_200k_tokens?: number;
    cache_read_input_token_cost_above_200k_tokens?: number;
  }>
): Record<string, {
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_read_input_token_cost?: number;
  cache_creation_input_token_cost?: number;
  input_cost_per_token_above_200k_tokens?: number;
  output_cost_per_token_above_200k_tokens?: number;
  cache_creation_input_token_cost_above_200k_tokens?: number;
  cache_read_input_token_cost_above_200k_tokens?: number;
}> {
  return {
    "claude-3-5-sonnet-20241022": {
      input_cost_per_token: 0.000003,
      output_cost_per_token: 0.000015,
      cache_read_input_token_cost: 0.0000003,
      cache_creation_input_token_cost: 0.00000375,
      input_cost_per_token_above_200k_tokens: 0.000002,
      output_cost_per_token_above_200k_tokens: 0.000012,
    },
    "gpt-4o": {
      input_cost_per_token: 0.0000025,
      output_cost_per_token: 0.00001,
    },
    ...entries,
  };
}
