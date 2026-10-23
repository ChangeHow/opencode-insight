import type {
  ContextSource,
  RequestInsight,
  SessionInsight,
  TokenUsage,
  ToolInsight,
} from "./schema";

export { phaseBreakdown, speedWindow, tokenBreakdown } from "./visuals";

export function summarizeReportedCalls(calls: ToolInsight["reportedCalls"] = []) {
  const groups = new Map<
    string,
    {
      name: string;
      status: NonNullable<ToolInsight["reportedCalls"]>[number]["status"];
      count: number;
    }
  >();
  for (const call of calls) {
    const key = `${call.name}\0${call.status}`;
    const group = groups.get(key);
    if (group) group.count++;
    else groups.set(key, { ...call, count: 1 });
  }
  return [...groups.values()];
}

type Interval = [number, number];
function union(intervals: Interval[]): Interval[] {
  const result: Interval[] = [];
  for (const [start, end] of intervals.sort((a, b) => a[0] - b[0])) {
    if (end <= start) continue;
    const last = result.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else result.push([start, end]);
  }
  return result;
}
const duration = (intervals: Interval[]) =>
  union(intervals).reduce((sum, [a, b]) => sum + b - a, 0);

export function requestTps(request: RequestInsight): number | undefined {
  const end = request.streamedAt;
  if (
    request.status !== "completed" ||
    !request.usage ||
    end === undefined ||
    end <= request.startedAt
  )
    return undefined;
  return ((request.usage.output + request.usage.reasoning) * 1000) / (end - request.startedAt);
}

export interface SessionSummary {
  usage: TokenUsage;
  cost: number;
  currentContext: ContextSource[];
  cumulativeContext: ContextSource[];
  modelMs: number;
  toolMs: number;
  foregroundMs: number;
  backgroundToolMs: number;
  tps?: number;
  capturePartial: boolean;
}

export function summarizeSession(session: SessionInsight, now = Date.now()): SessionSummary {
  const usage: TokenUsage = { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 };
  const sources = new Map<string, ContextSource>();
  const model: Interval[] = [];
  let tokens = 0;
  const measured: Interval[] = [];
  for (const request of session.requests) {
    if (request.usage)
      for (const key of Object.keys(usage) as (keyof TokenUsage)[])
        usage[key] += request.usage[key];
    for (const source of request.context) {
      const key = `${source.kind}:${source.id}`;
      const existing = sources.get(key);
      if (existing) existing.tokens += source.tokens;
      else sources.set(key, { ...source });
    }
    const end =
      request.streamedAt ??
      request.endedAt ??
      (request.status === "running" ? now : request.startedAt);
    model.push([request.startedAt, end]);
    if (requestTps(request) !== undefined) {
      tokens += request.usage!.output + request.usage!.reasoning;
      measured.push([request.startedAt, request.streamedAt!]);
    }
  }
  const tools = session.tools.map(
    (tool): Interval => [
      tool.startedAt,
      tool.endedAt ?? (tool.status === "running" ? now : tool.startedAt),
    ],
  );
  const foregroundTools = tools.filter((_, i) => !session.tools[i].background);
  const backgroundTools = tools.filter((_, i) => session.tools[i].background);
  const measuredMs = measured.reduce((sum, [start, end]) => sum + Math.max(0, end - start), 0);
  return {
    usage,
    cost: session.requests.reduce((sum, request) => sum + (request.cost ?? 0), 0),
    currentContext: session.requests.at(-1)?.context.map((source) => ({ ...source })) ?? [],
    cumulativeContext: [...sources.values()],
    modelMs: duration(model),
    toolMs: duration(tools),
    foregroundMs: duration([...model, ...foregroundTools]),
    backgroundToolMs: duration(backgroundTools),
    tps: measuredMs > 0 ? (tokens * 1000) / measuredMs : undefined,
    capturePartial:
      session.interruptedCapture ||
      session.requests.some((r) => r.capture === "partial" || !r.usage),
  };
}
