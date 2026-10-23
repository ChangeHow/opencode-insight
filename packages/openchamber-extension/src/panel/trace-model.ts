import type {
  RequestInsight,
  SessionInsight,
  ToolInsight,
} from "@opencode-insight/telemetry/schema";

export interface TraceInterval {
  start: number;
  end: number;
}

export interface TraceGroup {
  name: string;
  tools: ToolInsight[];
  intervals: TraceInterval[];
  spanMs?: number;
  unionMs: number;
  accumulatedMs: number;
  unknownCount: number;
  errorCount: number;
  backgroundCount: number;
}

export interface TraceModel {
  start: number;
  end: number;
  elapsedMs?: number;
  groups: TraceGroup[];
  running: boolean;
  summary: {
    requestCount: number;
    toolCount: number;
    errorCount: number;
    unknownCount: number;
    tokens?: number;
    cost?: number;
    partialUsage: boolean;
    partialCost: boolean;
  };
}

function interval(start: number, end: number | undefined): TraceInterval | undefined {
  return end === undefined ? undefined : { start, end: Math.max(start, end) };
}

export function toolInterval(tool: ToolInsight, now = Date.now()): TraceInterval | undefined {
  return interval(tool.startedAt, tool.endedAt ?? (tool.status === "running" ? now : undefined));
}

function createGroups(tools: ToolInsight[], now: number): TraceGroup[] {
  const groups = new Map<string, TraceGroup>();
  for (const tool of tools) {
    let group = groups.get(tool.name);
    if (!group) {
      group = {
        name: tool.name,
        tools: [],
        intervals: [],
        unionMs: 0,
        accumulatedMs: 0,
        unknownCount: 0,
        errorCount: 0,
        backgroundCount: 0,
      };
      groups.set(tool.name, group);
    }
    group.tools.push(tool);
    if (tool.status === "error") group.errorCount++;
    if (tool.background) group.backgroundCount++;
    const execution = toolInterval(tool, now);
    if (execution) group.intervals.push(execution);
    else group.unknownCount++;
  }
  for (const group of groups.values()) {
    const known = group.intervals;
    if (known.length) {
      const start = known[0].start;
      let end = start;
      for (const execution of known) {
        end = Math.max(end, execution.end);
        group.accumulatedMs += execution.end - execution.start;
      }
      group.spanMs = end - start;
    }
    const merged: TraceInterval[] = [];
    for (const execution of known) {
      if (execution.end <= execution.start) continue;
      const last = merged.at(-1);
      if (last && execution.start <= last.end) last.end = Math.max(last.end, execution.end);
      else merged.push({ ...execution });
    }
    group.intervals = merged;
    group.unionMs = merged.reduce((sum, execution) => sum + execution.end - execution.start, 0);
  }
  return [...groups.values()];
}

export function createTraceModel(session: SessionInsight, now = Date.now()): TraceModel {
  const snapshot = structuredClone(session);
  let start: number | undefined;
  let end: number | undefined;
  let hasEndpoint = false;
  let running = false;
  const summary: TraceModel["summary"] = {
    requestCount: snapshot.requests.length,
    toolCount: snapshot.tools.length,
    errorCount: 0,
    unknownCount: 0,
    partialUsage: false,
    partialCost: false,
  };
  const record = (item: RequestInsight | ToolInsight, execution: TraceInterval | undefined) => {
    start = Math.min(start ?? item.startedAt, item.startedAt);
    end = Math.max(end ?? item.startedAt, execution?.end ?? item.startedAt);
    hasEndpoint ||= execution !== undefined;
    running ||= item.status === "running";
    if (item.status === "error") summary.errorCount++;
    if (!execution) summary.unknownCount++;
  };
  for (const request of snapshot.requests) {
    record(
      request,
      interval(
        request.startedAt,
        request.endedAt ?? request.streamedAt ?? (request.status === "running" ? now : undefined),
      ),
    );
    if (request.usage) {
      const usage = request.usage;
      summary.tokens =
        (summary.tokens ?? 0) +
        usage.input +
        usage.output +
        usage.reasoning +
        usage.cacheRead +
        usage.cacheWrite;
    } else summary.partialUsage = true;
    if (request.cost !== undefined) summary.cost = (summary.cost ?? 0) + request.cost;
    else summary.partialCost = true;
  }
  for (const tool of snapshot.tools.sort((a, b) => a.startedAt - b.startedAt)) {
    record(tool, toolInterval(tool, now));
  }
  return {
    start: start ?? 0,
    end: end ?? 0,
    elapsedMs: hasEndpoint ? end! - start! : undefined,
    groups: createGroups(snapshot.tools, now),
    running,
    summary,
  };
}

/** Clock refreshes reuse closed aggregates instead of regrouping the session. */
export function advanceTraceClock(model: TraceModel, now: number): TraceModel {
  if (!model.running) return model;
  const end = Math.max(model.end, now);
  return {
    ...model,
    end,
    elapsedMs: end - model.start,
    groups: model.groups.map((group) =>
      group.tools.some((tool) => tool.status === "running")
        ? createGroups(group.tools, now)[0]
        : group,
    ),
  };
}
