import type { HostClient, JsonValue } from "@openchamber/sdk";
import {
  speedScopeSchema,
  speedWindowSchema,
  type SpeedWindow,
} from "@opencode-insight/telemetry/queries";
import { z } from "zod";

const KEY = "speed-display-v1";
const MAX_BYTES = 60 * 1024;
const displaySchema = z.object({
  version: z.literal(1),
  receivedAt: z.number().finite().nonnegative(),
  height: z.number().int().min(24).max(320),
  speed: speedWindowSchema.omit({ buckets: true, nextAt: true }).extend({
    scope: speedScopeSchema.shape.scope,
  }),
});
export type SpeedDisplay = z.infer<typeof displaySchema>;
type Storage = HostClient["storage"];
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

export async function readSpeedDisplay(storage: Storage): Promise<SpeedDisplay | undefined> {
  try {
    const value = await storage.get(KEY);
    if (value === undefined || bytes(value) > MAX_BYTES) return;
    const parsed = displaySchema.safeParse(value);
    if (parsed.success && parsed.data.receivedAt <= Date.now()) return parsed.data;
  } catch {
    // Storage is optional acceleration; a failed read must not block live telemetry.
  }
}

export async function writeSpeedDisplay(
  storage: Storage,
  speed: SpeedWindow,
  receivedAt: number,
  height: number,
): Promise<void> {
  const { buckets: _buckets, nextAt: _nextAt, ...projection } = speed;
  const parsed = displaySchema.safeParse({ version: 1, speed: projection, receivedAt, height });
  if (!parsed.success || bytes(parsed.data) > MAX_BYTES) return;
  try {
    // One fixed key, no session index, raw buckets, trace history, or teardown writes.
    await storage.set(KEY, JSON.parse(JSON.stringify(parsed.data)) as JsonValue);
  } catch {
    // Quota or permission failures leave the current display and live reads intact.
  }
}
