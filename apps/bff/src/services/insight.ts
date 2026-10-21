import type { SessionInsightPayload } from "@opencode-dashboard/shared";
import { BridgeError, createInsightReader } from "@opencode-insight/client";
import { buildSeries } from "@opencode-insight/telemetry";

const readSession = createInsightReader();

export async function readSessionInsight(
  sessionID: string,
  afterValue?: string,
  read = readSession,
): Promise<SessionInsightPayload> {
  if (!/^ses_[A-Za-z0-9]+$/.test(sessionID) || sessionID.length > 128) {
    throw new BridgeError(400, "A valid OpenCode session ID is required.");
  }
  const after = afterValue === undefined ? undefined : Number(afterValue);
  if (
    afterValue !== undefined &&
    (afterValue.length === 0 || /\D/.test(afterValue) || !Number.isSafeInteger(after))
  ) {
    throw new BridgeError(400, "after must be a nonnegative safe integer.");
  }
  const session = await read(sessionID);
  return { session, series: buildSeries(session, { sessionID, after }) };
}
