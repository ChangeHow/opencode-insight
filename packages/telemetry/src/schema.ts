import { z } from "zod";

export const INSIGHT_RPC_ID = "opencode-insight";

export const tokenUsageSchema = z.object({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  reasoning: z.number().nonnegative(),
  cacheRead: z.number().nonnegative(),
  cacheWrite: z.number().nonnegative(),
});
export type TokenUsage = z.infer<typeof tokenUsageSchema>;

export const sourceKinds = [
  "system",
  "definitions",
  "user",
  "skill",
  "assistant",
  "tool",
  "injected",
] as const;
export const sourceSchema = z.object({
  kind: z.enum(sourceKinds),
  id: z.string(),
  label: z.string(),
  tokens: z.number().nonnegative(),
  quality: z.enum(["estimated", "reported"]),
});
export type ContextSource = z.infer<typeof sourceSchema>;

export const bucketSchema = z.object({
  at: z.number(),
  output: z.number().nonnegative(),
  reasoning: z.number().nonnegative(),
  summary: z.number().nonnegative(),
});
export type TokenBucket = z.infer<typeof bucketSchema>;

export const requestSchema = z.object({
  id: z.string(),
  model: z.string(),
  startedAt: z.number(),
  firstDeltaAt: z.number().optional(),
  streamedAt: z.number().optional(),
  endedAt: z.number().optional(),
  status: z.enum(["running", "completed", "error", "interrupted"]),
  reasoningMode: z.enum(["unknown", "visible", "summary", "hidden"]),
  usage: tokenUsageSchema.optional(),
  cost: z.number().nonnegative().optional(),
  buckets: z.array(bucketSchema),
  context: z.array(sourceSchema),
  capture: z.enum(["live", "partial"]),
});
export type RequestInsight = z.infer<typeof requestSchema>;

export const toolSchema = z.object({
  id: z.string(),
  name: z.string(),
  requestID: z.string().optional(),
  parentID: z.string().optional(),
  startedAt: z.number(),
  endedAt: z.number().optional(),
  status: z.enum(["running", "completed", "error", "interrupted"]),
  background: z.boolean(),
  resultTokens: z.number().nonnegative().optional(),
});
export type ToolInsight = z.infer<typeof toolSchema>;

export const sessionSchema = z.object({
  version: z.literal(1),
  sessionID: z.string().min(1),
  parentID: z.string().optional(),
  directory: z.string(),
  updatedAt: z.number(),
  revision: z.number().int().nonnegative(),
  requests: z.array(requestSchema),
  tools: z.array(toolSchema),
  interruptedCapture: z.boolean(),
});
export type SessionInsight = z.infer<typeof sessionSchema>;

export const seriesPointSchema = z.object({
  at: z.number(),
  requestID: z.string(),
  model: z.string(),
  outputTps: z.number().nonnegative(),
  reasoningTps: z.number().nonnegative(),
  summaryTps: z.number().nonnegative(),
  requestTps: z.number().nonnegative().optional(),
  quality: z.enum(["estimated", "partial"]),
});
export type SeriesPoint = z.infer<typeof seriesPointSchema>;

export const seriesInputSchema = z.object({
  sessionID: z.string().min(1).max(128),
  bucketMs: z.number().int().min(1000).max(60000).default(1000),
  windowMs: z.number().int().min(1000).max(60000).default(5000),
  after: z.number().int().nonnegative().optional(),
});
export type SeriesInput = z.input<typeof seriesInputSchema>;
export const seriesSchema = z.object({
  revision: z.number().int().nonnegative(),
  unchanged: z.boolean(),
  points: z.array(seriesPointSchema),
});
export type InsightSeries = z.infer<typeof seriesSchema>;
