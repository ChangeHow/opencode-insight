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
  MessageListPayload,
  ProviderDashboardPayload,
  RemoteUsagePayload,
  SessionDetailBreakdown,
} from "@opencode-dashboard/shared";

const FIXED_NOW = new Date("2026-07-11T12:00:00.000Z");

export { makeMockSessionInsight } from "./fixtures/session-insight";

function getRelativeDate(daysOffset: number): string {
  const date = new Date(FIXED_NOW);
  date.setUTCDate(date.getUTCDate() + daysOffset);
  return date.toISOString().slice(0, 10);
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
    availableRanges: ["month", "3mo", "year", "all"],
    scannedAt: FIXED_NOW.toISOString(),
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

    const tokens = 8000 + ((i * 7919) % 12000);
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
    const tokens = 8000 + ((i * 7919) % 12000);
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

  return {
    summary: makeMockSummary(),
    heatmap,
    trend,
    series,
    selectedDay: null,
  };
}

export function makeMockProviderDashboard(providerId: string): ProviderDashboardPayload {
  const dashboard = makeMockDashboard();
  const providers = makeMockProviders();
  const provider = providers.providers.find((item) => item.providerId === providerId) ?? null;
  return {
    ...dashboard,
    provider,
    providers: providers.providers,
    trend: provider?.trend ?? [],
    series: {
      options: dashboard.series.options.filter((option) => option.providerId === providerId),
      lines: dashboard.series.lines.filter((line) => line.providerId === providerId),
    },
  };
}

export function makeMockRemoteUsage(): RemoteUsagePayload {
  return {
    enabled: true,
    status: "fresh",
    machines: [{ id: "studio-mac", label: "Studio Mac" }],
    rows: [
      {
        machineId: "studio-mac",
        machineLabel: "Studio Mac",
        date: getRelativeDate(-1),
        updatedAt: FIXED_NOW.toISOString(),
        providerId: "anthropic",
        modelId: "claude-3-5-sonnet-20241022",
        tokens: 80_000,
        pricedTokens: 78_000,
        cost: 2.8,
        messages: 96,
        breakdown: {
          input: 48_000,
          output: 16_000,
          cacheRead: 10_000,
          cacheWrite: 2_000,
          reasoning: 4_000,
        },
      },
    ],
    totals: { machines: 1, tokens: 80_000, pricedTokens: 78_000, cost: 2.8, messages: 96 },
    lastFetchedAt: FIXED_NOW.toISOString(),
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
    sessions: [],
  };
}

export function makeMockSessionDetailBreakdown(
  sessionId: string,
  overrides: Partial<SessionDetailBreakdown> = {},
): SessionDetailBreakdown {
  const day = makeMockDayBreakdown("2026-05-10");

  return {
    sessionId,
    runtime: "opencode",
    title: "Untitled session",
    slug: sessionId,
    directory: "/workspace/opencode-token-dashboard",
    tokens: day.tokens,
    pricedTokens: day.pricedTokens,
    cost: day.cost,
    messages: day.messages,
    breakdown: day.breakdown,
    models: day.models,
    longestTaskDurationMs: 9_000_000,
    ...overrides,
  };
}

export function makeMockMessageList(): MessageListPayload {
  const startedAt = Date.parse("2026-07-11T11:00:00.000Z");
  return {
    total: 2,
    page: 0,
    pageSize: 50,
    messages: [
      {
        id: "message-user",
        role: "user",
        createdAt: startedAt,
        completedAt: startedAt + 1_000,
        cost: 0,
        tokens: { input: 42, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
        parts: [
          {
            type: "text",
            text: "Review the dashboard and explain the main performance bottleneck.",
            time: { start: startedAt, end: startedAt + 1_000 },
          },
        ],
      },
      {
        id: "message-assistant",
        role: "assistant",
        createdAt: startedAt + 2_000,
        completedAt: startedAt + 16_000,
        modelId: "claude-3-5-sonnet-20241022",
        providerId: "anthropic",
        cost: 0.08,
        tokens: { input: 1200, output: 480, reasoning: 220, cacheRead: 800, cacheWrite: 0 },
        parts: [
          {
            type: "reasoning",
            text: "Inspect the render tree and compare mobile and desktop component mounts.",
            time: { start: startedAt + 2_000, end: startedAt + 6_000 },
          },
          {
            type: "tool",
            callId: "tool-1",
            toolName: "read",
            status: "completed",
            title: "Read provider dashboard",
            input: { filePath: "apps/web/src/routes/providers.tsx" },
            output: "Provider dashboard source loaded.",
            time: { start: startedAt + 6_000, end: startedAt + 7_500 },
          },
          {
            type: "text",
            text: "## Finding\n\nThe provider page mounted duplicate chart trees at each breakpoint. Rendering one responsive tree removes the largest avoidable UI cost.",
            time: { start: startedAt + 8_000, end: startedAt + 16_000 },
          },
        ],
      },
    ],
  };
}
