export { createBridge, createInsightReader, createInsightQueryReader } from "./bridge";
export type { QueryMethod, InsightQueryMethod } from "./bridge";
export { BridgeError, loadConnection, type Connection } from "./connection";
export { createHostBridge } from "./host";
export type {
  SessionInsight,
  InsightSeries,
  SeriesInput,
} from "@opencode-insight/telemetry/schema";
