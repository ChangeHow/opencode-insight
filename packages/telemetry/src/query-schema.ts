import { z } from "zod";
import { sourceKinds, tokenUsageSchema, toolSchema, requestSchema } from "./schema";
import { generationWindowSchema } from "./query-generation";

const sessionID = z.string().min(1).max(128);
const revision = z.number().int().nonnegative();
const identity = { sessionID, directory: z.string(), revision };
const intervalSchema = z.object({ start: z.number(), end: z.number() });
export const toolPreviewSchema = toolSchema.omit({
  reportedCalls: true,
  reportedCallsTruncated: true,
});
export type ToolPreview = z.infer<typeof toolPreviewSchema>;
export const tokenCompositionSchema = z.object({
  total: z.number().nonnegative(),
  reported: z.boolean(),
  groups: z.array(
    z.object({
      kind: z.enum(sourceKinds),
      label: z.string(),
      tokens: z.number().nonnegative(),
      share: z.number().nonnegative(),
    }),
  ),
});
export type TokenComposition = z.infer<typeof tokenCompositionSchema>;
export const traceGroupOverviewSchema = z.object({
  name: z.string(),
  count: z.number().int().nonnegative(),
  intervals: z.array(intervalSchema),
  zeroStarts: z.array(z.number()),
  errorIntervals: z.array(intervalSchema),
  unknownStarts: z.array(z.number()),
  range: intervalSchema.optional(),
  spanMs: z.number().optional(),
  unionMs: z.number(),
  accumulatedMs: z.number(),
  unknownCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  backgroundCount: z.number().int().nonnegative(),
  runningStarts: z.array(z.number()),
  singleTool: toolPreviewSchema.optional(),
});
export type TraceGroupOverview = z.infer<typeof traceGroupOverviewSchema>;
export const traceOverviewSchema = z.object({
  start: requestSchema.shape.startedAt,
  end: z.number(),
  measuredAt: z.number(),
  elapsedMs: z.number().optional(),
  running: z.boolean(),
  summary: z.object({
    requestCount: z.number().int().nonnegative(),
    toolCount: z.number().int().nonnegative(),
    errorCount: z.number().int().nonnegative(),
    unknownCount: z.number().int().nonnegative(),
    tokens: z.number().optional(),
    cost: z.number().optional(),
    partialUsage: z.boolean(),
    partialCost: z.boolean(),
  }),
  groups: z.array(traceGroupOverviewSchema),
});
export type TraceOverview = z.infer<typeof traceOverviewSchema>;
export const phaseBreakdownSchema = z.object({
  phases: z.array(
    z.object({
      id: z.enum(["waiting", "streaming", "unsplit", "parallel", "tools"]),
      label: z.string(),
      color: z.string(),
      description: z.string(),
      ms: z.number(),
      share: z.number(),
      count: z.number().int().nonnegative(),
    }),
  ),
  totalMs: z.number(),
  backgroundMs: z.number(),
  unknownCount: z.number().int().nonnegative(),
});
export type PhaseBreakdown = z.infer<typeof phaseBreakdownSchema>;
export const overviewInputSchema = z.object({ sessionID, after: revision.optional() });
export const overviewDataSchema = z.object({
  updatedAt: z.number(),
  measuredAt: z.number(),
  hasActivity: z.boolean(),
  running: z.boolean(),
  summary: z.object({
    usage: tokenUsageSchema,
    cost: z.number(),
    modelMs: z.number(),
    toolMs: z.number(),
    foregroundMs: z.number(),
    backgroundToolMs: z.number(),
    tps: z.number().optional(),
    capturePartial: z.boolean(),
    hasUsage: z.boolean(),
    hasCost: z.boolean(),
  }),
  tokens: z.object({ current: tokenCompositionSchema, cumulative: tokenCompositionSchema }),
  trace: traceOverviewSchema,
  phases: phaseBreakdownSchema,
});
export type OverviewData = z.infer<typeof overviewDataSchema>;
export const overviewSchema = z.object({
  ...identity,
  unchanged: z.boolean(),
  data: overviewDataSchema.optional(),
});
export type OverviewResponse = z.infer<typeof overviewSchema>;
export const speedWindowInputSchema = z
  .object({ sessionID, from: z.number().optional(), to: z.number().optional() })
  .refine(
    ({ from, to }) =>
      (from === undefined && to === undefined) ||
      (from !== undefined && to !== undefined && from < to && to - from <= 600000),
    { message: "Provide both range bounds with a positive span of at most ten minutes" },
  );
export type SpeedWindowInput = z.input<typeof speedWindowInputSchema>;
export const speedBucketSchema = z.object({
  start: z.number(),
  end: z.number(),
  at: z.number(),
  state: z.enum(["output", "waiting", "tools", "unobserved"]),
  tps: z.number().optional(),
});
export type SpeedBucket = z.infer<typeof speedBucketSchema>;
export type SpeedState = SpeedBucket["state"];
export const speedWindowSchema = z.object({
  ...identity,
  start: z.number(),
  end: z.number(),
  buckets: z.array(speedBucketSchema),
  nextAt: z.number().optional(),
  generation: generationWindowSchema.optional(),
});
export type SpeedWindow = z.infer<typeof speedWindowSchema>;
export const toolPageInputSchema = z
  .object({
    sessionID,
    group: z.string().optional(),
    toolID: z.string().optional(),
    cursor: z.string().max(4096).optional(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .refine(
    ({ toolID, cursor, group }) =>
      toolID === undefined || (cursor === undefined && group === undefined),
    { message: "Tool selection cannot be combined with a cursor or group" },
  );
export type ToolPageInput = z.input<typeof toolPageInputSchema>;
export const toolPageSchema = z.object({
  ...identity,
  group: z.string().optional(),
  total: z.number().int().nonnegative(),
  entries: z.array(toolSchema),
  cursor: z.string().max(4096).optional(),
  start: z.number().int().nonnegative().optional(),
  end: z.number().int().nonnegative().optional(),
  previousCursor: z.string().max(4096).optional(),
  nextCursor: z.string().max(4096).optional(),
  reset: z.boolean(),
});
export type ToolPage = z.infer<typeof toolPageSchema>;
