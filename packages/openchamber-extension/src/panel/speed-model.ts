import type { SessionInsight } from "@opencode-insight/telemetry/schema";

export const SPEED_BUCKET_MS = 15000;
const WINDOW_MS = 10 * 60 * 1000;

export type SpeedState = "output" | "waiting" | "tools" | "unobserved";
export interface SpeedBucket {
  start: number;
  end: number;
  at: number;
  state: SpeedState;
  tps?: number;
}

/** Aggregate raw counts, not already averaged rates or final cumulative usage. */
export function speedModel(session: SessionInsight | undefined, now = Date.now()) {
  let first = Infinity;
  let last = -Infinity;
  let running = false;
  const track = (start: number, end = start) => {
    first = Math.min(first, start);
    last = Math.max(last, end);
  };
  for (const request of session?.requests ?? []) {
    track(request.startedAt, request.endedAt ?? request.streamedAt ?? request.startedAt);
    running ||= request.status === "running";
    for (const bucket of request.buckets) track(bucket.at, bucket.at + 1000);
  }
  for (const tool of session?.tools ?? []) {
    track(tool.startedAt, tool.endedAt ?? tool.startedAt);
    running ||= tool.status === "running";
  }
  const closedEnd = Math.floor(now / SPEED_BUCKET_MS) * SPEED_BUCKET_MS;
  const finalEnd = Math.ceil(last / SPEED_BUCKET_MS) * SPEED_BUCKET_MS;
  const nextAt = running || closedEnd < finalEnd ? closedEnd + SPEED_BUCKET_MS : undefined;
  // Finished sessions freeze only after their final observation's bucket closes.
  const end = running ? closedEnd : Math.min(closedEnd, finalEnd);
  const start = Math.max(end - WINDOW_MS, Math.floor(first / SPEED_BUCKET_MS) * SPEED_BUCKET_MS);
  const buckets: SpeedBucket[] = [];
  if (!session || start >= end) return { start: closedEnd, end: closedEnd, buckets, nextAt };

  const counts = new Map<number, number>();
  for (const request of session.requests) {
    for (const bucket of request.buckets) {
      if (bucket.at < start || bucket.at >= end) continue;
      const at = Math.floor(bucket.at / SPEED_BUCKET_MS) * SPEED_BUCKET_MS;
      counts.set(at, (counts.get(at) ?? 0) + bucket.output);
    }
  }
  for (let at = start; at < end; at += SPEED_BUCKET_MS) {
    const upper = at + SPEED_BUCKET_MS;
    const tokens = counts.get(at) ?? 0;
    const toolActive = session.tools.some((tool) => {
      const end = tool.endedAt ?? (tool.status === "running" ? now : undefined);
      return end !== undefined && tool.startedAt < upper && end > at;
    });
    const unobserved = session.requests.some((request) => {
      const end = request.streamedAt ?? request.endedAt ?? now;
      if (request.startedAt >= upper || end <= at) return false;
      if (request.firstDeltaAt !== undefined && request.firstDeltaAt >= upper) return false;
      if (request.status === "running" && request.firstDeltaAt === undefined) return false;
      return request.capture === "partial" || !request.buckets.length;
    });
    buckets.push({
      start: at,
      end: upper,
      at: at + SPEED_BUCKET_MS / 2,
      state: tokens > 0 ? "output" : toolActive ? "tools" : unobserved ? "unobserved" : "waiting",
      tps: tokens > 0 ? tokens / (SPEED_BUCKET_MS / 1000) : undefined,
    });
  }
  return { start, end, buckets, nextAt };
}
