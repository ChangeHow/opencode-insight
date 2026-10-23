import type { ToolInsight } from "@opencode-insight/telemetry/schema";
import { toolInterval } from "./trace-model";
import type {
  TraceGroupOverview as TraceGroup,
  TraceOverview as TraceModel,
} from "@opencode-insight/telemetry/queries";
import type { TraceInterval } from "./trace-model";
import { duration, money, number } from "./format";

export type TraceItem =
  | { key: string; kind: "session"; model: TraceModel; sessionID: string }
  | { key: string; kind: "group"; entry: TraceGroup }
  | { key: string; kind: "tool"; entry: ToolInsight };

export const toolName = (name: string) => (name === "execute" ? "Code Mode" : name);
export const axisOffset = (ms: number, windowMs: number) =>
  windowMs < 10000 ? `${(ms / 1000).toFixed(windowMs < 1000 ? 3 : 2)} s` : duration(ms);

export function itemLabel(item: TraceItem): string {
  if (item.kind === "session") return "Session";
  if (item.kind === "tool") return toolName(item.entry.name);
  return `${toolName(item.entry.name)} ×${number(item.entry.count)}`;
}

export function itemRange(item: TraceItem, now: number): TraceInterval | undefined {
  if (item.kind === "session")
    return item.model.elapsedMs === undefined
      ? undefined
      : { start: item.model.start, end: item.model.end };
  if (item.kind === "tool") return toolInterval(item.entry, now);
  return item.entry.range;
}

export function itemValue(item: TraceItem, now: number) {
  if (item.kind === "group")
    return item.entry.unknownCount === item.entry.count
      ? "Unavailable"
      : `U ${duration(item.entry.unionMs)}`;
  const range = itemRange(item, now);
  return range ? duration(range.end - range.start) : "Unavailable";
}

export function describeItem(item: TraceItem, model: TraceModel, now: number) {
  const range = itemRange(item, now);
  const fields: Array<[string, string]> = [];
  let id = item.key;
  let status = "Captured";
  let reported: ToolInsight | undefined;
  if (item.kind === "session") {
    id = item.sessionID;
    status = model.running ? "Live" : "Captured";
    fields.push(
      ["Captured span", model.elapsedMs === undefined ? "Unavailable" : duration(model.elapsedMs)],
      ["Model requests", number(model.summary.requestCount)],
      ["Native tools", number(model.summary.toolCount)],
      ["Error spans", number(model.summary.errorCount)],
      [
        "Reported tokens",
        model.summary.tokens === undefined ? "Unavailable" : number(model.summary.tokens),
      ],
      [
        "Reported cost",
        model.summary.cost === undefined ? "Unavailable" : money(model.summary.cost),
      ],
    );
  } else if (item.kind === "group") {
    fields.push(
      ["Invocations", number(item.entry.count)],
      [
        "First-to-last span",
        item.entry.spanMs === undefined ? "Unavailable" : duration(item.entry.spanMs),
      ],
      [
        "Execution union U",
        item.entry.unknownCount === item.entry.count ? "Unavailable" : duration(item.entry.unionMs),
      ],
      [
        "Accumulated Σ",
        item.entry.unknownCount === item.entry.count
          ? "Unavailable"
          : duration(item.entry.accumulatedMs),
      ],
      ["Errors", number(item.entry.errorCount)],
      ["Background calls", number(item.entry.backgroundCount)],
      ["Unknown durations", number(item.entry.unknownCount)],
    );
  } else if (item.kind === "tool") {
    const tool = item.entry;
    id = tool.id;
    status = tool.status;
    fields.push(
      ["Started", `+${duration(tool.startedAt - model.start)}`],
      ["Invocation", range ? duration(range.end - range.start) : "Unavailable"],
      ["Native tool", tool.name],
      ["Background", tool.background ? "Yes" : "No"],
      [
        "Result tokens · estimated",
        tool.resultTokens === undefined ? "Unavailable" : `≈${number(tool.resultTokens)}`,
      ],
      ["Request ID", tool.requestID ?? "Unassociated"],
    );
    if (tool.parentID) fields.push(["Recorded parent call", tool.parentID]);
    reported = tool.reportedCalls?.length ? tool : undefined;
  }
  return { label: itemLabel(item), id, status, fields, reported };
}
