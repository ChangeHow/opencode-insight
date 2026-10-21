import type { InsightSeries, SessionInsight } from "@opencode-insight/telemetry/schema";

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
