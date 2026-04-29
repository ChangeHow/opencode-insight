import type {
  CostSeriesLine,
  CostSeriesOption,
  DashboardSummary,
  DayBreakdown,
  HeatmapDay,
  TimeRange,
  TokenBreakdown,
  TrendPoint,
  UsageSyncDay,
} from "@opencode-dashboard/shared";

export type SourceKind = DashboardSummary["source"]["kind"];

export interface RawMessage {
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
}

export interface RangeData {
  summary: DashboardSummary;
  heatmap: HeatmapDay[];
  trend: TrendPoint[];
  byDate: Map<string, DayBreakdown>;
  seriesOptions: CostSeriesOption[];
  seriesLines: CostSeriesLine[];
  providers: import("@opencode-dashboard/shared").ProviderInsight[];
}

export interface UsageSnapshot {
  summary: DashboardSummary;
  dataFingerprint: string;
  messages: RawMessage[];
  heatmap: HeatmapDay[];
  trendByRange: Record<TimeRange, TrendPoint[]>;
  breakdownByDate: Map<string, DayBreakdown>;
}

export interface SerializedUsageSnapshot {
  summary: DashboardSummary;
  messages: RawMessage[];
  heatmap: HeatmapDay[];
  trendByRange: Record<TimeRange, TrendPoint[]>;
  breakdownByDate: DayBreakdown[];
  dataFingerprint?: string;
}

export interface SyncPushState {
  dayHashes: Record<string, string>;
  lastPushedAt?: string;
}

export interface LocalUsageSyncData {
  generatedAt: string;
  days: UsageSyncDay[];
}
