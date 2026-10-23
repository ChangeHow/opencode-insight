import type { InsightSeries, SessionInsight } from "@opencode-insight/telemetry/schema";
import type { OverviewData, OverviewResponse } from "@opencode-insight/telemetry/queries";
import type { SeriesWindow } from "@opencode-insight/telemetry/details";

export type {
  OverviewData,
  OverviewResponse,
  TokenComposition,
  TraceOverview,
  ToolPage,
} from "@opencode-insight/telemetry/queries";
export type {
  SourcePage,
  SeriesWindow,
  SeriesRequestHeader,
} from "@opencode-insight/telemetry/details";

export interface SessionInsightQueryPayload {
  overview: OverviewResponse & { data: OverviewData };
  series: SeriesWindow;
}

export type {
  ContextSource,
  InsightSeries,
  RequestInsight,
  SeriesPoint,
  SessionInsight,
  ToolInsight,
} from "@opencode-insight/telemetry/schema";
export {
  summarizeSession,
  requestTps,
  summarizeReportedCalls,
  phaseBreakdown,
  speedWindow,
  tokenBreakdown,
} from "@opencode-insight/telemetry/summary";

export interface SessionInsightPayload {
  session: SessionInsight;
  series: InsightSeries;
}
