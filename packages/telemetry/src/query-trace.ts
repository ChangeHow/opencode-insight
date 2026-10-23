import { z } from "zod";
import type { RequestInsight, SessionInsight, ToolInsight } from "./schema";
import {
  toolPageInputSchema,
  type ToolPage,
  type ToolPageInput,
  type TraceGroupOverview,
  type TraceOverview,
} from "./query-schema";

type Interval = { start: number; end: number };
function interval(start: number, end: number | undefined): Interval | undefined {
  return end === undefined ? undefined : { start, end: Math.max(start, end) };
}
function merge(intervals: Interval[]): Interval[] {
  const merged: Interval[] = [];
  for (const execution of intervals.toSorted((a, b) => a.start - b.start)) {
    if (execution.end <= execution.start) continue;
    const last = merged.at(-1);
    if (last && execution.start <= last.end) last.end = Math.max(last.end, execution.end);
    else merged.push({ ...execution });
  }
  return merged;
}
const duration = (intervals: Interval[]) =>
  intervals.reduce((sum, execution) => sum + execution.end - execution.start, 0);

export function buildTraceOverview(session: SessionInsight, now = Date.now()): TraceOverview {
  let start: number | undefined;
  let end: number | undefined;
  let hasEndpoint = false;
  let running = false;
  const summary: TraceOverview["summary"] = {
    requestCount: session.requests.length,
    toolCount: session.tools.length,
    errorCount: 0,
    unknownCount: 0,
    partialUsage: false,
    partialCost: false,
  };
  const record = (item: RequestInsight | ToolInsight, execution: Interval | undefined) => {
    start = Math.min(start ?? item.startedAt, item.startedAt);
    end = Math.max(end ?? item.startedAt, execution?.end ?? item.startedAt);
    hasEndpoint ||= execution !== undefined;
    running ||= item.status === "running";
    if (item.status === "error") summary.errorCount++;
    if (!execution) summary.unknownCount++;
  };
  for (const request of session.requests) {
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
  const groups = new Map<string, TraceGroupOverview>();
  for (const tool of session.tools.toSorted((a, b) => a.startedAt - b.startedAt)) {
    const execution = interval(
      tool.startedAt,
      tool.endedAt ?? (tool.status === "running" ? now : undefined),
    );
    record(tool, execution);
    let group = groups.get(tool.name);
    if (!group) {
      const { reportedCalls: _, reportedCallsTruncated: __, ...singleTool } = tool;
      group = {
        name: tool.name,
        count: 0,
        intervals: [],
        zeroStarts: [],
        errorIntervals: [],
        unknownStarts: [],
        unionMs: 0,
        accumulatedMs: 0,
        unknownCount: 0,
        errorCount: 0,
        backgroundCount: 0,
        runningStarts: [],
        singleTool,
      };
      groups.set(tool.name, group);
    }
    group.count++;
    if (group.count > 1) delete group.singleTool;
    if (tool.status === "error") group.errorCount++;
    if (tool.background) group.backgroundCount++;
    if (tool.status === "running" && tool.endedAt === undefined)
      group.runningStarts.push(tool.startedAt);
    if (execution) {
      group.intervals.push(execution);
      if (
        execution.start === execution.end &&
        (tool.status !== "running" || tool.endedAt !== undefined)
      )
        group.zeroStarts.push(execution.start);
      if (tool.status === "error") group.errorIntervals.push(execution);
      group.range = {
        start: group.range?.start ?? execution.start,
        end: Math.max(group.range?.end ?? execution.start, execution.end),
      };
      group.accumulatedMs += execution.end - execution.start;
    } else {
      group.unknownCount++;
      group.unknownStarts.push(tool.startedAt);
    }
  }
  for (const group of groups.values()) {
    if (group.range) group.spanMs = group.range.end - group.range.start;
    group.intervals = merge(group.intervals);
    group.unionMs = duration(group.intervals);
  }
  return {
    start: start ?? 0,
    end: end ?? 0,
    measuredAt: now,
    elapsedMs: hasEndpoint ? end! - start! : undefined,
    running,
    summary,
    groups: [...groups.values()],
  };
}

/** Extend ongoing intervals without reloading tools or touching closed group objects. */
export function advanceTraceOverview(model: TraceOverview, now: number): TraceOverview {
  if (!model.running) return model;
  const end = Math.max(model.end, now);
  return {
    ...model,
    end,
    elapsedMs: end - model.start,
    measuredAt: now,
    groups: model.groups.map((group) => {
      if (!group.runningStarts.length) return group;
      const ongoing = group.runningStarts.map((start) => ({ start, end: Math.max(start, now) }));
      const intervals = merge([...group.intervals, ...ongoing]);
      const range = {
        start: group.range!.start,
        end: Math.max(group.range!.end, ...ongoing.map((item) => item.end)),
      };
      const added = group.runningStarts.reduce(
        (sum, start) => sum + Math.max(start, now) - Math.max(start, model.measuredAt),
        0,
      );
      return {
        ...group,
        intervals,
        range,
        spanMs: range.end - range.start,
        unionMs: duration(intervals),
        accumulatedMs: group.accumulatedMs + added,
      };
    }),
  };
}

const cursorSchema = z.object({
  sessionID: z.string(),
  directory: z.string(),
  group: z.string().optional(),
  limit: z.number().int().min(1).max(50),
  headID: z.string(),
  tailID: z.string(),
  anchorID: z.string().optional(),
  direction: z.enum(["older", "newer"]),
});
type Cursor = z.infer<typeof cursorSchema>;
const PAGE_BYTES = 256000;
const encodedBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
function encodeCursor(cursor: Cursor): string {
  const encoded = encodeURIComponent(JSON.stringify(cursor));
  if (encoded.length > 4096) throw new Error("Tool cursor exceeds size limit");
  return encoded;
}

/** Capture-order pages are anchored to IDs in a fixed original prefix, never mutable timestamps. */
export function buildToolPage(session: SessionInsight, input: ToolPageInput): ToolPage {
  const query = toolPageInputSchema.parse(input);
  if (query.sessionID !== session.sessionID) throw new Error("Session does not match tool query");
  const base: ToolPage = {
    sessionID: session.sessionID,
    directory: session.directory,
    revision: session.revision,
    group: query.group,
    total: 0,
    entries: [],
    reset: false,
  };
  if (query.toolID !== undefined) {
    const tool = session.tools.find((item) => item.id === query.toolID);
    const page = { ...base, total: tool ? 1 : 0, entries: tool ? [tool] : [] };
    if (encodedBytes(page) > PAGE_BYTES) throw new Error("Tool exceeds page byte limit");
    return page;
  }
  let cursor: Cursor | undefined;
  let prefix = session.tools;
  if (query.cursor !== undefined) {
    cursor = cursorSchema.parse(JSON.parse(decodeURIComponent(query.cursor)));
    if (
      cursor.sessionID !== session.sessionID ||
      cursor.directory !== session.directory ||
      cursor.group !== query.group ||
      cursor.limit !== query.limit
    ) {
      throw new Error("Tool cursor does not match query scope");
    }
    const tail = session.tools.findIndex((tool) => tool.id === cursor!.tailID);
    if (session.tools[0]?.id !== cursor.headID || tail < 0) return { ...base, reset: true };
    prefix = session.tools.slice(0, tail + 1);
  }
  const tools =
    query.group === undefined ? prefix : prefix.filter((tool) => tool.name === query.group);
  base.total = tools.length;
  if (!tools.length) {
    if (cursor) return { ...base, reset: true };
    return base;
  }
  const anchor = cursor?.anchorID
    ? tools.findIndex((tool) => tool.id === cursor!.anchorID)
    : tools.length;
  if (anchor < 0) return { ...base, reset: true };
  const newer = cursor?.direction === "newer";
  let start = newer ? anchor + 1 : anchor;
  let end = start;
  const scope = {
    sessionID: session.sessionID,
    directory: session.directory,
    group: query.group,
    limit: query.limit,
    headID: prefix[0].id,
    tailID: prefix.at(-1)!.id,
  };
  const pageAt = (): ToolPage => ({
    ...base,
    entries: tools.slice(start, end),
    cursor: encodeCursor({
      ...scope,
      anchorID: cursor?.anchorID,
      direction: cursor?.direction ?? "older",
    }),
    start,
    end,
    previousCursor:
      end < tools.length && start < end
        ? encodeCursor({ ...scope, anchorID: tools[end - 1].id, direction: "newer" })
        : undefined,
    nextCursor:
      start > 0 && start < end
        ? encodeCursor({ ...scope, anchorID: tools[start].id, direction: "older" })
        : undefined,
  });
  let page = pageAt();
  let entryBytes = 0;
  while (end - start < query.limit && (newer ? end < tools.length : start > 0)) {
    const tool = tools[newer ? end : start - 1];
    const bytes = encodedBytes(tool);
    if (newer) end++;
    else start--;
    const candidate = pageAt();
    const size = encodedBytes({ ...candidate, entries: [] }) + entryBytes + bytes + end - start - 1;
    if (size > PAGE_BYTES) {
      if (!page.entries.length) throw new Error("Tool exceeds page byte limit");
      break;
    }
    entryBytes += bytes;
    page = candidate;
  }
  return page;
}
