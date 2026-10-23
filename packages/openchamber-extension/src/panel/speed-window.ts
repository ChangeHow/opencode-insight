import { advanceGenerationWindow, type SpeedWindow } from "@opencode-insight/telemetry/queries";

/** Advance active viewports by local elapsed time; retain the last idle window. */
export function advanceSpeedDisplay(
  speed: SpeedWindow,
  receivedAt: number,
  now = Date.now(),
): SpeedWindow {
  const elapsed = Math.max(0, now - receivedAt);
  if (!speed.generation?.active || elapsed === 0) return speed;
  return { ...speed, generation: advanceGenerationWindow(speed.generation, elapsed) };
}
