import { advanceGenerationWindow, type SpeedWindow } from "@opencode-insight/telemetry/queries";

/** Age the authoritative server viewport by locally observed time since reception. */
export function advanceSpeedDisplay(
  speed: SpeedWindow,
  receivedAt: number,
  now = Date.now(),
): SpeedWindow {
  const elapsed = Math.max(0, now - receivedAt);
  if (!speed.generation || elapsed === 0) return speed;
  return { ...speed, generation: advanceGenerationWindow(speed.generation, elapsed) };
}
