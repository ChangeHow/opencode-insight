import { z } from "zod";
import { requestSchema, type RequestInsight, type SessionInsight } from "./schema";
import { requestTps } from "./summary";

export const MAX_GENERATION_STAGES = 40;
export const GENERATION_WINDOW_MS = 15 * 60 * 1000;

export const generationStageSchema = z.object({
  requestID: z.string(),
  model: z.string(),
  start: z.number(),
  end: z.number(),
  offsetMs: z.number(),
  durationMs: z.number().positive(),
  status: requestSchema.shape.status,
  tps: z.number().nonnegative().optional(),
  estimated: z.literal(true).optional(),
  output: z.number().nonnegative().optional(),
  reasoning: z.number().nonnegative().optional(),
  breakBefore: z.boolean().optional(),
});
export type GenerationStage = z.infer<typeof generationStageSchema>;

export const generationWindowSchema = z.object({
  start: z.number().finite(),
  end: z.number().finite(),
  partial: z.boolean(),
  active: z.literal(true).optional(),
  durationMs: z.number().nonnegative(),
  stages: z.array(generationStageSchema).max(MAX_GENERATION_STAGES),
  tps: z.number().nonnegative().optional(),
  estimated: z.literal(true).optional(),
  unavailableCount: z.number().int().nonnegative(),
});
export type GenerationWindow = z.infer<typeof generationWindowSchema>;

/** Reproject captured request averages, never infer token arrivals or extend running requests. */
export function advanceGenerationWindow(
  window: GenerationWindow,
  elapsedMs: number,
): GenerationWindow {
  const start = window.start + elapsedMs;
  const end = window.end + elapsedMs;
  const stages = window.stages
    .filter((stage) => stage.end > start && stage.start < end)
    .map((stage) => ({ ...stage, offsetMs: stage.start - start }));
  const measured = stages.filter((stage) => stage.tps !== undefined);
  const measuredMs = measured.reduce((sum, stage) => sum + stage.durationMs, 0);
  return {
    ...window,
    start,
    end,
    stages,
    estimated: measured.some((stage) => stage.estimated) ? true : undefined,
    tps:
      measuredMs > 0
        ? measured.reduce((sum, stage) => sum + stage.tps! * stage.durationMs, 0) / measuredMs
        : undefined,
    unavailableCount: stages.filter((stage) => stage.tps === undefined).length,
  };
}

function liveTokens(request: RequestInsight, end: number) {
  if (
    request.status !== "running" ||
    request.capture !== "live" ||
    request.firstDeltaAt === undefined ||
    request.firstDeltaAt > end ||
    end <= request.startedAt
  )
    return;
  // Partial capture includes evicted buckets and rejected stream text. Only a
  // complete captured prefix can represent the whole request-to-observation mean.
  let output = 0;
  let reasoning = 0;
  for (const bucket of request.buckets) {
    output += bucket.output;
    reasoning += bucket.reasoning;
  }
  // Summary text is not reasoning; summary-only and pre-first-chunk stay unknown.
  return output + reasoning > 0 ? { output, reasoning } : undefined;
}

/** Follow active sessions and freeze idle ones; rates retain the full measured request duration. */
export function buildGenerationWindow(
  session: SessionInsight,
  input?: { from?: number; to?: number },
  now = Date.now(),
): GenerationWindow {
  const active =
    session.requests.some((request) => request.status === "running") ||
    session.tools.some((tool) => tool.status === "running" && !tool.background);
  const end = input?.to ?? (active ? now : Math.min(now, session.updatedAt));
  const start = input?.from ?? end - GENERATION_WINDOW_MS;
  // Select before removing unplottable requests so unknown durations consume the bound.
  const candidates = session.requests
    .map((request) => ({
      request,
      end:
        request.streamedAt ??
        request.endedAt ??
        (request.status === "running" ? now : request.startedAt),
    }))
    .filter(({ request, end: requestEnd }) => {
      if (request.startedAt >= end) return false;
      return requestEnd > request.startedAt ? requestEnd > start : request.startedAt >= start;
    })
    .sort((a, b) => a.request.startedAt - b.request.startedAt);
  const selected = candidates.slice(-MAX_GENERATION_STAGES);

  const stages: GenerationStage[] = [];
  let measuredMs = 0;
  let tokens = 0;
  let unavailableCount = 0;
  let breakBefore = false;
  for (const { request, end } of selected) {
    const elapsed = end - request.startedAt;
    const estimate = liveTokens(request, end);
    const tps =
      requestTps(request) ??
      (estimate && ((estimate.output + estimate.reasoning) * 1000) / elapsed);
    if (tps === undefined) unavailableCount++;
    if (elapsed <= 0) {
      breakBefore = true;
      continue;
    }
    stages.push({
      requestID: request.id,
      model: request.model,
      start: request.startedAt,
      end,
      offsetMs: request.startedAt - start,
      durationMs: elapsed,
      status: request.status,
      tps,
      ...(estimate ? { estimated: true as const } : {}),
      output: estimate?.output ?? request.usage?.output,
      reasoning: estimate?.reasoning ?? request.usage?.reasoning,
      ...(breakBefore ? { breakBefore: true } : {}),
    });
    breakBefore = false;
    if (tps !== undefined) {
      measuredMs += elapsed;
      tokens += estimate
        ? estimate.output + estimate.reasoning
        : request.usage!.output + request.usage!.reasoning;
    }
  }
  return {
    start,
    end,
    partial: session.interruptedCapture || candidates.length > MAX_GENERATION_STAGES,
    ...(active ? { active: true as const } : {}),
    durationMs: end - start,
    stages,
    tps: measuredMs > 0 ? (tokens * 1000) / measuredMs : undefined,
    ...(stages.some((stage) => stage.estimated) ? { estimated: true as const } : {}),
    unavailableCount,
  };
}
