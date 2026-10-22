import type { SessionInsightPayload } from "@opencode-dashboard/shared";
import {
  BridgeError,
  createInsightReader,
  createInsightQueryReader,
  type InsightQueryMethod,
} from "@opencode-insight/client";
import { buildSeries } from "@opencode-insight/telemetry";

const readSession = createInsightReader();
const readQuery = createInsightQueryReader();

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

export async function readSessionInsightQuery(
  method: InsightQueryMethod,
  sessionID: string,
  parameters: Record<string, string | undefined>,
  read = readQuery,
) {
  const options: Record<string, unknown> = {};
  for (const key of [
    "after",
    "from",
    "to",
    "limit",
    "scope",
    "kind",
    "group",
    "toolID",
    "cursor",
  ]) {
    const value = parameters[key];
    if (value === undefined) continue;
    if (["after", "from", "to", "limit"].includes(key)) {
      if (!/^-?\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value)))
        throw new BridgeError(400, "Invalid numeric Insight query parameter.");
      options[key] = Number(value);
    } else options[key] = value;
  }
  return read(method, sessionID, options);
}
