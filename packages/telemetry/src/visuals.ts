import type { ContextSource, RequestInsight, SeriesPoint, SessionInsight } from "./schema";

const WINDOW_MS = 10 * 60 * 1000;

/** Live windows follow wall time; completed sessions freeze at their last activity. */
export function speedWindow(input: SeriesPoint[], requests: RequestInsight[], now = Date.now()) {
  const sorted = input.toSorted((a, b) => a.at - b.at);
  const running = requests.some((request) => request.status === "running");
  const lastActivity = Math.max(
    sorted.at(-1)?.at ?? 0,
    ...requests.map((request) => request.endedAt ?? request.streamedAt ?? request.startedAt),
  );
  const end = running ? now : lastActivity;
  const firstActivity = Math.min(
    sorted[0]?.at ?? end,
    ...requests.map((request) => request.startedAt),
  );
  const start = Math.max(end - WINDOW_MS, Math.min(firstActivity, end - 1000));
  return { points: sorted.filter((point) => point.at >= start && point.at <= end), start, end };
}

const sourceStyle: Record<ContextSource["kind"], [string, string]> = {
  system: ["System prompt", "#8b5cf6"],
  definitions: ["Tool definitions", "#f59e0b"],
  user: ["User messages", "#22c55e"],
  skill: ["Skills", "#f97316"],
  assistant: ["Assistant messages", "#3b82f6"],
  tool: ["Tool results", "#14b8a6"],
  injected: ["Injected content", "#d946ef"],
};

export function tokenBreakdown(sources: ContextSource[]) {
  const groups = new Map<ContextSource["kind"], ContextSource[]>();
  for (const source of sources) {
    const items = groups.get(source.kind) ?? [];
    items.push(source);
    groups.set(source.kind, items);
  }
  const total = sources.reduce((sum, source) => sum + source.tokens, 0);
  return [...groups]
    .map(([kind, items]) => {
      const tokens = items.reduce((sum, item) => sum + item.tokens, 0);
      const [label, color] = sourceStyle[kind];
      return { kind, label, color, tokens, share: total ? tokens / total : 0, items };
    })
    .sort((a, b) => b.tokens - a.tokens);
}

const phaseStyles = [
  [
    "waiting",
    "Waiting",
    "#3b82f6",
    "Before the first observable model delta; includes latency, not measured model compute.",
  ],
  [
    "streaming",
    "Streaming",
    "#a855f7",
    "From the first observable delta to the model stream end; output and observable reasoning may share this interval.",
  ],
  [
    "unsplit",
    "Unsplit model",
    "#64748b",
    "Model activity without a captured first delta; cannot be split into waiting, thinking, or reply.",
  ],
  [
    "parallel",
    "Parallel model",
    "#ec4899",
    "Overlapping model requests in different phases, counted once.",
  ],
  [
    "tools",
    "Tool execution",
    "#14b8a6",
    "Blocking tool activity outside model intervals; overlapping model/tool time is counted in the model phase.",
  ],
] as const;

type Activity = 0 | 1 | 2 | 4 | 5;
type Event = { at: number; kind: Activity; id: number; delta: 1 | -1 };

/** Partition foreground activity into disjoint phases, without inferring hidden reasoning. */
export function phaseBreakdown(session: SessionInsight, now = Date.now()) {
  const events: Event[] = [];
  let unknownCount = 0;
  const add = (start: number, end: number, kind: Activity, id: number) => {
    if (end <= start) return;
    events.push({ at: start, kind, id, delta: 1 }, { at: end, kind, id, delta: -1 });
  };
  session.requests.forEach((request, id) => {
    const end =
      request.streamedAt ?? request.endedAt ?? (request.status === "running" ? now : undefined);
    if (end === undefined) {
      unknownCount++;
      return;
    }
    if (request.firstDeltaAt === undefined) add(request.startedAt, end, 2, id);
    else {
      const split = Math.max(request.startedAt, Math.min(end, request.firstDeltaAt));
      add(request.startedAt, split, 0, id);
      add(split, end, 1, id);
    }
  });
  session.tools.forEach((tool, id) => {
    const end = tool.endedAt ?? (tool.status === "running" ? now : undefined);
    if (end === undefined) {
      unknownCount++;
      return;
    }
    add(tool.startedAt, end, tool.background ? 5 : 4, id);
  });
  events.sort((a, b) => a.at - b.at);
  const active = Array.from({ length: 6 }, () => new Set<number>());
  const contributors = phaseStyles.map(() => new Set<number>());
  const elapsed = phaseStyles.map(() => 0);
  let backgroundMs = 0;
  for (let i = 0; i < events.length; ) {
    const at = events[i].at;
    while (i < events.length && events[i].at === at) {
      const event = events[i++];
      if (event.delta === 1) active[event.kind].add(event.id);
      else active[event.kind].delete(event.id);
    }
    const ms = (events[i]?.at ?? at) - at;
    if (active[5].size) backgroundMs += ms;
    const modelKinds = [0, 1, 2].filter((kind) => active[kind].size);
    const phase = modelKinds.length > 1 ? 3 : (modelKinds[0] ?? (active[4].size ? 4 : -1));
    if (phase < 0 || ms <= 0) continue;
    elapsed[phase] += ms;
    for (const kind of phase === 3 ? modelKinds : [phase]) {
      for (const id of active[kind]) contributors[phase].add(id);
    }
  }
  const totalMs = elapsed.reduce((sum, ms) => sum + ms, 0);
  const phases = phaseStyles.map(([id, label, color, description], index) => ({
    id,
    label,
    color,
    description,
    ms: elapsed[index],
    share: totalMs ? elapsed[index] / totalMs : 0,
    count: contributors[index].size,
  }));
  return { phases, totalMs, backgroundMs, unknownCount };
}
