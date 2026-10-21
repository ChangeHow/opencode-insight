import {
  seriesInputSchema,
  type InsightSeries,
  type SeriesInput,
  type SessionInsight,
} from "./schema";
import { requestTps } from "./summary";

export function buildSeries(
  session: SessionInsight,
  input: SeriesInput,
  now = Date.now(),
): InsightSeries {
  const { bucketMs, windowMs, after } = seriesInputSchema.parse(input);
  if (after === session.revision && !session.requests.some((r) => r.status === "running"))
    return { revision: session.revision, unchanged: true, points: [] };
  const points: InsightSeries["points"] = [];
  for (const request of [...session.requests].reverse()) {
    if (points.length >= 10000) break;
    if (!request.buckets.length) continue;
    const start = Math.floor(request.startedAt / bucketMs) * bucketMs;
    const end =
      request.streamedAt ??
      request.endedAt ??
      (request.status === "running" ? now : request.startedAt);
    const last = Math.floor(end / bucketMs) * bucketMs;
    const first = Math.max(start, last - (9999 - points.length) * bucketMs);
    const buckets = [...request.buckets].sort((a, b) => a.at - b.at);
    let left = 0;
    let right = 0;
    const sums = { output: 0, reasoning: 0, summary: 0 };
    for (let at = first; at <= last; at += bucketMs) {
      const upper = at + bucketMs;
      const lower = Math.max(start, upper - windowMs);
      while (right < buckets.length && buckets[right].at < upper) {
        const bucket = buckets[right++];
        sums.output += bucket.output;
        sums.reasoning += bucket.reasoning;
        sums.summary += bucket.summary;
      }
      while (left < right && buckets[left].at < lower) {
        const bucket = buckets[left++];
        sums.output -= bucket.output;
        sums.reasoning -= bucket.reasoning;
        sums.summary -= bucket.summary;
      }
      const seconds = Math.min(windowMs, upper - start) / 1000;
      points.push({
        at,
        requestID: request.id,
        model: request.model,
        outputTps: Math.max(0, sums.output) / seconds,
        reasoningTps: Math.max(0, sums.reasoning) / seconds,
        summaryTps: Math.max(0, sums.summary) / seconds,
        requestTps: requestTps(request),
        quality:
          request.capture === "partial" ||
          !request.usage ||
          (!request.buckets.length && request.usage.output > 0)
            ? "partial"
            : "estimated",
      });
    }
  }
  return {
    revision: session.revision,
    unchanged: false,
    points: points.sort((a, b) => a.at - b.at),
  };
}
