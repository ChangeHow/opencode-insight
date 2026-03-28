export type TimeRange = "7d" | "month" | "3mo" | "year";

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
  pricedTokens: number;
  pricingCoverage: number;
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

export interface CostSeriesOption {
  key: string;
  label: string;
  providerId: string;
  modelId: string;
  totalCost: number;
  totalTokens: number;
  totalMessages: number;
}

export interface CostSeriesLine {
  key: string;
  label: string;
  providerId: string;
  modelId: string;
  points: TrendPoint[];
}

export interface CostSeriesPayload {
  options: CostSeriesOption[];
  lines: CostSeriesLine[];
}

export interface ProviderInsight {
  providerId: string;
  totalCost: number;
  totalTokens: number;
  pricedTokens: number;
  pricingCoverage: number;
  totalMessages: number;
  activeDays: number;
  modelCount: number;
  topModel: {
    modelId: string;
    tokens: number;
    cost: number;
  } | null;
  trend: TrendPoint[];
}

export interface ProviderInsightsPayload {
  providers: ProviderInsight[];
}

export interface ModelBreakdown {
  modelId: string;
  providerId: string;
  tokens: number;
  pricedTokens: number;
  cost: number;
  messages: number;
  breakdown: TokenBreakdown;
}

export interface SessionBreakdown {
  sessionId: string;
  title: string;
  slug: string;
  directory: string;
  tokens: number;
  pricedTokens: number;
  cost: number;
  messages: number;
  breakdown: TokenBreakdown;
  models: ModelBreakdown[];
}

export interface DayBreakdown {
  date: string;
  tokens: number;
  pricedTokens: number;
  cost: number;
  messages: number;
  breakdown: TokenBreakdown;
  models: ModelBreakdown[];
  sessions: SessionBreakdown[];
}

export interface DashboardPayload {
  summary: DashboardSummary;
  heatmap: HeatmapDay[];
  trend: TrendPoint[];
  series: CostSeriesPayload;
  providers: ProviderInsight[];
  selectedDay: DayBreakdown | null;
}

export interface ProviderDashboardPayload extends DashboardPayload {
  provider: ProviderInsight | null;
}

export interface ApiErrorPayload {
  error: string;
}

// --- Message-level analytics types ---

export interface MessagePartText {
  type: "text";
  text: string;
  time: { start: number; end: number };
}

export interface MessagePartTool {
  type: "tool";
  callId: string;
  toolName: string;
  status: "completed" | "error" | "pending";
  input: unknown;
  output: string;
  title?: string;
  time: { start: number; end: number };
}

export interface MessagePartReasoning {
  type: "reasoning";
  text: string;
  time: { start: number; end: number };
}

export type MessagePart = MessagePartText | MessagePartTool | MessagePartReasoning;

export interface MessageDetail {
  id: string;
  role: "user" | "assistant";
  createdAt: number;
  completedAt?: number;
  modelId?: string;
  providerId?: string;
  cost: number;
  tokens: TokenBreakdown;
  finish?: string;
  parts: MessagePart[];
}

export interface MessageListPayload {
  messages: MessageDetail[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TimelinePoint {
  messageIndex: number;
  role: "user" | "assistant";
  createdAt: number;
  tokens: TokenBreakdown;
  cost: number;
  cumulativeTokens: number;
  cumulativeCost: number;
}

export interface ToolUsageStat {
  tool: string;
  count: number;
  totalTokens: number;
}

export interface MessageOverviewPayload {
  timeline: TimelinePoint[];
  toolUsage: ToolUsageStat[];
  totalMessages: number;
}

export interface MessageTokenPoint {
  messageIndex: number;
  messageId: string;
  role: "user" | "assistant";
  modelId?: string;
  providerId?: string;
  tokens: TokenBreakdown;
}

export interface MessageDistributionPayload {
  points: MessageTokenPoint[];
  totalMessages: number;
}

export interface MessageAnalyticsPayload {
  overview: MessageOverviewPayload;
  distribution: MessageDistributionPayload;
}

export * from "./date";
