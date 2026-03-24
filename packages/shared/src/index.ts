export type TimeRange = "7d" | "30d" | "90d";

export interface TokenBreakdown {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  reasoning: number;
}

export interface DashboardSummary {
  totalTokens: number;
  totalCost: number;
  totalMessages: number;
  activeDays: number;
  averageTokensPerActiveDay: number;
  currentStreak: number;
  longestStreak: number;
  bestDay: {
    date: string;
    tokens: number;
    cost: number;
  } | null;
  topModel: {
    modelId: string;
    tokens: number;
    cost: number;
  } | null;
  availableRanges: TimeRange[];
  scannedAt: string;
  source: {
    kind: "sqlite" | "json" | "mixed" | "none";
    paths: string[];
  };
}

export interface HeatmapDay {
  date: string;
  weekday: number;
  weekIndex: number;
  tokens: number;
  cost: number;
  messages: number;
  breakdown: TokenBreakdown;
  intensity: 0 | 1 | 2 | 3 | 4;
}

export interface TrendPoint {
  date: string;
  tokens: number;
  cost: number;
  messages: number;
}

export interface ModelBreakdown {
  modelId: string;
  providerId: string;
  tokens: number;
  cost: number;
  messages: number;
  breakdown: TokenBreakdown;
}

export interface DayBreakdown {
  date: string;
  tokens: number;
  cost: number;
  messages: number;
  breakdown: TokenBreakdown;
  models: ModelBreakdown[];
}

export interface DashboardPayload {
  summary: DashboardSummary;
  heatmap: HeatmapDay[];
  trend: TrendPoint[];
  selectedDay: DayBreakdown | null;
}

export interface ApiErrorPayload {
  error: string;
}
