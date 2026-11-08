import { z } from "zod";

export const INSIGHT_HOST_SOURCE_EVENT = "rpc.opencode-insight.hostSource";

export const hostSourceSchema = z.object({
  version: z.literal(1),
  scope: z.string().uuid(),
  port: z.number().int().min(1).max(65535),
  token: z.string().min(32).max(128),
  nonce: z.string().uuid().optional(),
});
export type HostSource = z.infer<typeof hostSourceSchema>;

export const hostQuerySchema = z.object({
  method: z.enum([
    "session",
    "series",
    "overview",
    "speedWindow",
    "speedScope",
    "toolPage",
    "seriesWindow",
    "sourcePage",
  ]),
  input: z.unknown(),
  nonce: z.string().uuid(),
});
