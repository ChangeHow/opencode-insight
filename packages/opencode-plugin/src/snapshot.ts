import type { InsightSeries, SessionInsight } from "@opencode-insight/telemetry";
import type { OverviewResponse, SpeedWindow, ToolPage } from "@opencode-insight/telemetry/queries";
import type { SeriesWindow, SourcePage } from "@opencode-insight/telemetry/details";

type Value = string | number | boolean | null | undefined | Value[] | { [key: string]: Value };

// Only plain telemetry data: no toJSON hooks, class instances, or cyclic references.
function copy(value: Value): Value {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? (value === 0 ? 0 : value) : null;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(copy);
  const result: Record<string, Value> = {};
  for (const key of Object.keys(value)) {
    const item = value[key];
    if (item !== undefined) result[key] = copy(item);
  }
  return result;
}

/** Detach inside the collector queue; the native RPC host validates the unchanged schema. */
export function snapshot<
  T extends
    | SessionInsight
    | InsightSeries
    | OverviewResponse
    | SpeedWindow
    | ToolPage
    | SeriesWindow
    | SourcePage,
>(value: T): T {
  return copy(value) as T;
}
