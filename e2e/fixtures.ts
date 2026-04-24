import type {
  DashboardPayload,
  DashboardSummary,
  HeatmapDay,
  TrendPoint,
  CostSeriesPayload,
  ProviderInsightsPayload,
  DayBreakdown,
  TokenBreakdown,
  CostSeriesOption,
  CostSeriesLine,
  ModelBreakdown,
} from "@opencode-dashboard/shared";

function getTodayDate(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getRelativeDate(daysOffset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function makeMockSummary(): DashboardSummary {
  return {
    totalTokens: 250000,
    totalCost: 8.75,
    pricedTokens: 250000,
    pricingCoverage: 1.0,
    totalMessages: 320,
    activeDays: 18,
    averageTokensPerActiveDay: 13888,
    currentStreak: 5,
    longestStreak: 12,
    bestDay: {
      date: getRelativeDate(-2),
      tokens: 28000,
      cost: 0.98,
    },
    topModel: {
      modelId: "claude-3-5-sonnet-20241022",
      tokens: 150000,
      cost: 5.25,
    },
    availableRanges: ["month", "3mo", "year"],
    scannedAt: new Date().toISOString(),
    source: {
      kind: "sqlite",
      paths: ["/path/to/cursor.db"],
    },
  };
}

export function makeMockHeatmap(): HeatmapDay[] {
  const days: HeatmapDay[] = [];

  for (let i = 6; i >= 0; i--) {
    const date = getRelativeDate(-i);
    const dateObj = new Date(date);
    const weekday = dateObj.getDay();
    const firstDayOfYear = new Date(dateObj.getFullYear(), 0, 1);
    const daysSinceStart = Math.floor(
      (dateObj.getTime() - firstDayOfYear.getTime()) / (1000 * 60 * 60 * 24),
    );
    const weekIndex = Math.floor(daysSinceStart / 7);

    const tokens = 8000 + Math.floor(Math.random() * 12000);
    const cost = tokens * 0.00003;
    const messages = Math.floor(tokens / 800);

    days.push({
      date,
      weekday,
      weekIndex,
      tokens,
      cost,
      messages,
      breakdown: {
        input: Math.floor(tokens * 0.7),
        output: Math.floor(tokens * 0.25),
        cacheRead: Math.floor(tokens * 0.03),
        cacheWrite: Math.floor(tokens * 0.02),
        reasoning: 0,
      },
      intensity: Math.min(4, Math.floor(tokens / 5000)) as 0 | 1 | 2 | 3 | 4,
    });
  }

  return days;
}

export function makeMockTrend(): TrendPoint[] {
  const points: TrendPoint[] = [];

  for (let i = 6; i >= 0; i--) {
    const date = getRelativeDate(-i);
    const tokens = 8000 + Math.floor(Math.random() * 12000);
    const cost = tokens * 0.00003;
    const messages = Math.floor(tokens / 800);

    points.push({
      date,
      tokens,
      cost,
      messages,
    });
  }

  return points;
}

export function makeMockSeries(): CostSeriesPayload {
  const trendPoints = makeMockTrend();

  const options: CostSeriesOption[] = [
    {
      key: "anthropic/claude-3-5-sonnet-20241022",
      label: "Claude 3.5 Sonnet",
      providerId: "anthropic",
      modelId: "claude-3-5-sonnet-20241022",
      totalCost: 5.25,
      totalTokens: 150000,
      totalMessages: 180,
    },
    {
      key: "openai/gpt-4o",
      label: "GPT-4o",
      providerId: "openai",
      modelId: "gpt-4o",
      totalCost: 2.5,
      totalTokens: 80000,
      totalMessages: 100,
    },
    {
      key: "anthropic/claude-3-5-haiku-20241022",
      label: "Claude 3.5 Haiku",
      providerId: "anthropic",
      modelId: "claude-3-5-haiku-20241022",
      totalCost: 1.0,
      totalTokens: 20000,
      totalMessages: 40,
    },
  ];

  const lines: CostSeriesLine[] = options.map((option) => ({
    key: option.key,
    label: option.label,
    providerId: option.providerId,
    modelId: option.modelId,
    points: trendPoints.map((point) => ({
      ...point,
      cost: point.cost * (option.totalCost / 8.75),
      tokens: Math.floor(point.tokens * (option.totalTokens / 250000)),
    })),
  }));

  return { options, lines };
}

export function makeMockProviders(): ProviderInsightsPayload {
  const trendPoints = makeMockTrend();

  return {
    summary: makeMockSummary(),
    providers: [
      {
        providerId: "anthropic",
        totalCost: 6.25,
        totalTokens: 170000,
        pricedTokens: 170000,
        pricingCoverage: 1.0,
        totalMessages: 220,
        activeDays: 18,
        modelCount: 2,
        topModel: {
          modelId: "claude-3-5-sonnet-20241022",
          tokens: 150000,
          cost: 5.25,
        },
        trend: trendPoints.map((point) => ({
          ...point,
          cost: point.cost * 0.7,
          tokens: Math.floor(point.tokens * 0.68),
        })),
      },
      {
        providerId: "openai",
        totalCost: 2.5,
        totalTokens: 80000,
        pricedTokens: 80000,
        pricingCoverage: 1.0,
        totalMessages: 100,
        activeDays: 12,
        modelCount: 1,
        topModel: {
          modelId: "gpt-4o",
          tokens: 80000,
          cost: 2.5,
        },
        trend: trendPoints.map((point) => ({
          ...point,
          cost: point.cost * 0.3,
          tokens: Math.floor(point.tokens * 0.32),
        })),
      },
    ],
  };
}

export function makeMockDashboard(): DashboardPayload {
  const heatmap = makeMockHeatmap();
  const trend = makeMockTrend();
  const series = makeMockSeries();
  const providers = makeMockProviders();

  return {
    summary: makeMockSummary(),
    heatmap,
    trend,
    series,
    providers: providers.providers,
    selectedDay: null,
  };
}

export function makeMockDayBreakdown(date: string): DayBreakdown {
  const tokens = 12000;
  const breakdown: TokenBreakdown = {
    input: 8400,
    output: 3000,
    cacheRead: 400,
    cacheWrite: 200,
    reasoning: 0,
  };

  const models: ModelBreakdown[] = [
    {
      modelId: "claude-3-5-sonnet-20241022",
      providerId: "anthropic",
      tokens: 8000,
      pricedTokens: 8000,
      cost: 0.24,
      messages: 8,
      breakdown: {
        input: 5600,
        output: 2000,
        cacheRead: 300,
        cacheWrite: 100,
        reasoning: 0,
      },
    },
    {
      modelId: "gpt-4o",
      providerId: "openai",
      tokens: 4000,
      pricedTokens: 4000,
      cost: 0.12,
      messages: 4,
      breakdown: {
        input: 2800,
        output: 1000,
        cacheRead: 100,
        cacheWrite: 100,
        reasoning: 0,
      },
    },
  ];

  return {
    date,
    tokens,
    pricedTokens: tokens,
    cost: 0.36,
    messages: 12,
    breakdown,
    models,
  };
}
