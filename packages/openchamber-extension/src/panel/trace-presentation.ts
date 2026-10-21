import type { ToolInsight } from "@opencode-insight/telemetry/schema";
import { requestInterval, toolInterval } from "./trace-model";
import type { TraceGroup, TraceInterval, TraceModel, TraceRequest } from "./trace-model";
import { duration, money, number } from "./format";

export type TraceItem =
  | { key: string; kind: "session"; model: TraceModel; sessionID: string }
  | { key: string; kind: "request"; entry: TraceRequest }
  | { key: string; kind: "group"; entry: TraceGroup; owner: TraceRequest }
  | { key: string; kind: "tool"; entry: ToolInsight; owner: TraceRequest };

export const toolName = (name: string) => (name === "execute" ? "Code Mode" : name);
export const axisOffset = (ms: number, windowMs: number) =>
  windowMs < 10000 ? `${(ms / 1000).toFixed(windowMs < 1000 ? 3 : 2)} s` : duration(ms);
export const toolCount = (entry: TraceRequest) =>
  entry.groups.reduce((sum, group) => sum + group.tools.length, 0);

export function itemLabel(item: TraceItem): string {
  if (item.kind === "session") return "Session";
  if (item.kind === "tool") return toolName(item.entry.name);
  if (item.kind === "group")
    return `${toolName(item.entry.name)} ×${number(item.entry.tools.length)}`;
  return item.entry.request
    ? `${item.entry.label} · ${item.entry.request.model}`
    : item.entry.label;
}

export function itemRange(item: TraceItem, now: number): TraceInterval | undefined {
  if (item.kind === "session")
    return item.model.elapsedMs === undefined
      ? undefined
      : { start: item.model.start, end: item.model.end };
  if (item.kind === "tool") return toolInterval(item.entry, now);
  if (item.kind === "request" && item.entry.request)
    return requestInterval(item.entry.request, now);
  const groups = item.kind === "group" ? [item.entry] : item.entry.groups;
  const intervals = groups.flatMap((group) =>
    group.tools.flatMap((tool) => toolInterval(tool, now) ?? []),
  );
  if (!intervals.length) return undefined;
  return {
    start: Math.min(...intervals.map((interval) => interval.start)),
    end: Math.max(...intervals.map((interval) => interval.end)),
  };
}

export function itemValue(item: TraceItem, now: number) {
  if (item.kind === "group")
    return item.entry.unknownCount === item.entry.tools.length
      ? "Unavailable"
      : `U ${duration(item.entry.unionMs)}`;
  if (item.kind === "request" && !item.entry.request)
    return `${number(toolCount(item.entry))} tools`;
  const range = itemRange(item, now);
  return range ? duration(range.end - range.start) : "Unavailable";
}

export function describeItem(item: TraceItem, model: TraceModel, now: number) {
  const range = itemRange(item, now);
  const fields: Array<[string, string]> = [];
  let id = item.key;
  let status = "Captured";
  let note = "";
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
    note =
      "Captured data only. Span includes gaps; foreground activity uses interval unions. Child sessions are not merged.";
  } else if (item.kind === "group") {
    fields.push(
      ["Invocations", number(item.entry.tools.length)],
      [
        "First-to-last span",
        item.entry.spanMs === undefined ? "Unavailable" : duration(item.entry.spanMs),
      ],
      [
        "Execution union U",
        item.entry.unknownCount === item.entry.tools.length
          ? "Unavailable"
          : duration(item.entry.unionMs),
      ],
      [
        "Accumulated Σ",
        item.entry.unknownCount === item.entry.tools.length
          ? "Unavailable"
          : duration(item.entry.accumulatedMs),
      ],
      ["Errors", number(item.entry.errorCount)],
      ["Background calls", number(item.entry.backgroundCount)],
      ["Unknown durations", number(item.entry.unknownCount)],
    );
    note =
      "Union excludes gaps; accumulated time includes parallel overlap. Background invocation intervals remain included in this tool group, not added to foreground totals.";
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
    note =
      tool.name === "execute"
        ? "Code Mode duration covers the parent invocation only. Script and result bodies are not stored; child calls have no independent timing or cost."
        : "Invocation timing is host-observed. Result tokens are local estimates, not provider-billed usage. Command and result bodies are not stored.";
  } else if (item.entry.request) {
    const request = item.entry.request;
    id = request.id;
    status = request.status;
    const usage = request.usage;
    fields.push(
      ["Started", `+${duration(request.startedAt - model.start)}`],
      ["Request interval", range ? duration(range.end - range.start) : "Unavailable"],
      [
        "First delta",
        request.firstDeltaAt === undefined
          ? "Not captured"
          : duration(Math.max(0, request.firstDeltaAt - request.startedAt)),
      ],
      ["Uncached input", usage ? number(usage.input) : "Unavailable"],
      [
        "Cache read / write",
        usage ? `${number(usage.cacheRead)} / ${number(usage.cacheWrite)}` : "Unavailable",
      ],
      [
        "Output / reasoning",
        usage ? `${number(usage.output)} / ${number(usage.reasoning)}` : "Unavailable",
      ],
      ["Reported cost", request.cost === undefined ? "Unavailable" : money(request.cost)],
      ["Capture", request.capture],
    );
    note =
      "Model: " +
      request.model +
      ". Request intervals may include tool settlement or waiting; overlapping rows must not be added together. Missing first deltas remain unsplit.";
  } else {
    fields.push(["Native tools", number(toolCount(item.entry))]);
    note =
      "Display grouping only: these tools have no captured matching request ID. No parent request is inferred from timing overlap.";
  }
  if (status === "running") note += " Ongoing durations are provisional.";
  return { label: itemLabel(item), id, status, fields, note, reported };
}
