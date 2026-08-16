export type TimeRange = "7d" | "month" | "3mo" | "year" | "all";
export type AgentRuntime = "opencode" | "codex";

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
  summary?: DashboardSummary;
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
  runtime: AgentRuntime;
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

export interface SessionDetailBreakdown extends SessionBreakdown {
  longestTaskDurationMs: number;
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
  selectedDay: DayBreakdown | null;
  remoteSync?: RemoteUsagePayload;
}

export interface UsageSyncMachine {
  id: string;
  label: string;
}

export interface UsageSyncRow {
  providerId: string;
  modelId: string;
  tokens: number;
  pricedTokens: number;
  cost: number;
  messages: number;
  breakdown: TokenBreakdown;
}

export interface UsageSyncDay {
  date: string;
  hash: string;
  rows: UsageSyncRow[];
}

export interface UsageSyncPushPayload {
  schemaVersion: 1;
  machine: UsageSyncMachine;
  mode: "replace-days";
  generatedAt: string;
  days: UsageSyncDay[];
}

export interface RemoteUsageRow extends UsageSyncRow {
  machineId: string;
  machineLabel: string;
  date: string;
  updatedAt: string;
}

export interface RemoteUsageTotals {
  machines: number;
  tokens: number;
  pricedTokens: number;
  cost: number;
  messages: number;
}

export interface RemoteUsagePayload {
  enabled: boolean;
  status: "disabled" | "fresh" | "stale";
  machines: UsageSyncMachine[];
  rows: RemoteUsageRow[];
  totals: RemoteUsageTotals;
  lastFetchedAt?: string;
  error?: string;
}

export interface RemoteSyncActionPayload {
  ok: true;
  scannedAt: string;
  push: {
    pushed: boolean;
    days?: number;
    reason?: "disabled" | "unchanged";
    error?: string;
  };
  remote: RemoteUsagePayload;
}

export interface ProviderDashboardPayload extends DashboardPayload {
  provider: ProviderInsight | null;
  providers: ProviderInsight[];
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

/** Where the initialization context came from. */
export type ContextSegmentKind =
  | "user" // the user's own prompt
  | "instructions" // AGENTS.md / user_instructions / persona files
  | "environment" // environment_context: cwd, sandbox, git, tool output
  | "tools" // tool/schema definitions (estimated)
  | "other"; // unclassified content

export interface ContextSegmentStat {
  kind: ContextSegmentKind;
  label: string;
  tokens: number;
}

export interface FirstPromptContextStat {
  messageIndex: number;
  modelId: string;
  providerId?: string;
  /** 0 = unknown. Only sessions with runtime telemetry (codex) get a real
   *  window; catalogs describe API limits, not subscription caps, so a
   *  catalog-derived percentage would be misleading. */
  contextWindow: number;
  promptTokens: number;
  /** 0 when the window is unknown. */
  ratio: number;
  source?: "reported" | "catalog";
  /** Composition of the initial context when the runtime exposes it. */
  segments?: ContextSegmentStat[];
}

export interface MessageOverviewPayload {
  timeline: TimelinePoint[];
  toolUsage: ToolUsageStat[];
  totalMessages: number;
  firstPromptContext?: FirstPromptContextStat | null;
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
