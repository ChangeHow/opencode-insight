import { z } from "zod";
import { requestSchema, type SessionInsight } from "./schema";
import { requestTps } from "./summary";

export const MAX_GENERATION_STAGES = 40;

export const generationStageSchema = z.object({
  requestID: z.string(),
  model: z.string(),
  start: z.number(),
  end: z.number(),
  offsetMs: z.number().nonnegative(),
  durationMs: z.number().positive(),
  status: requestSchema.shape.status,
  tps: z.number().nonnegative().optional(),
  output: z.number().nonnegative().optional(),
  reasoning: z.number().nonnegative().optional(),
  breakBefore: z.boolean().optional(),
});
export type GenerationStage = z.infer<typeof generationStageSchema>;

export const generationWindowSchema = z.object({
  durationMs: z.number().nonnegative(),
  stages: z.array(generationStageSchema).max(MAX_GENERATION_STAGES),
  tps: z.number().nonnegative().optional(),
  unavailableCount: z.number().int().nonnegative(),
});
export type GenerationWindow = z.infer<typeof generationWindowSchema>;

/** Compress gaps between requests, retaining each request's full elapsed time. */
export function buildGenerationWindow(
  session: SessionInsight,
  input?: { from?: number; to?: number },
  now = Date.now(),
): GenerationWindow {
  // Select before removing unplottable requests so unknown durations consume the bound.
  const selected = session.requests
    .map((request) => ({
      request,
      end:
        request.streamedAt ??
        request.endedAt ??
        (request.status === "running" ? now : request.startedAt),
    }))
    .filter(({ request, end }) => {
      if (input?.to !== undefined && request.startedAt >= input.to) return false;
      if (input?.from === undefined) return true;
      return end > request.startedAt ? end > input.from : request.startedAt >= input.from;
    })
    .sort((a, b) => a.request.startedAt - b.request.startedAt)
    .slice(-MAX_GENERATION_STAGES);

  const stages: GenerationStage[] = [];
  let durationMs = 0;
  let measuredMs = 0;
  let tokens = 0;
  let unavailableCount = 0;
  let breakBefore = false;
  for (const { request, end } of selected) {
    const elapsed = end - request.startedAt;
    const tps = requestTps(request);
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
      offsetMs: durationMs,
      durationMs: elapsed,
      status: request.status,
      tps,
      output: request.usage?.output,
      reasoning: request.usage?.reasoning,
      ...(breakBefore ? { breakBefore: true } : {}),
    });
    breakBefore = false;
    durationMs += elapsed;
    if (tps !== undefined) {
      measuredMs += elapsed;
      tokens += request.usage!.output + request.usage!.reasoning;
    }
  }
  return {
    durationMs,
    stages,
    tps: measuredMs > 0 ? (tokens * 1000) / measuredMs : undefined,
    unavailableCount,
  };
}
