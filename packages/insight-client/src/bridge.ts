import { OpenCode } from "@opencode/client";
import {
  INSIGHT_RPC_ID,
  seriesInputSchema,
  seriesSchema,
  sessionSchema,
  type InsightSeries,
  type SessionInsight,
} from "@opencode-insight/telemetry/schema";
import { z } from "zod";
import { BridgeError, loadConnection, type Connection } from "./connection";

const sessionIDSchema = z
  .string()
  .regex(/^ses_[A-Za-z0-9]+$/)
  .max(128);
const targetSchema = z.object({
  sessionID: sessionIDSchema,
  directory: z.string().min(1).max(4096),
});
const querySchema = seriesInputSchema.extend({
  sessionID: sessionIDSchema,
  directory: targetSchema.shape.directory,
});

const timedFetch: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    redirect: "error",
    signal: init?.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)])
      : AbortSignal.timeout(8000),
  });

type Connect = () => Promise<Connection>;
type QueryTarget = z.input<typeof seriesInputSchema> & { directory?: string };

async function query(
  method: "session",
  target: QueryTarget,
  connect: Connect,
): Promise<SessionInsight>;
async function query(
  method: "series",
  target: QueryTarget,
  connect: Connect,
): Promise<InsightSeries>;
async function query(method: "session" | "series", target: QueryTarget, connect: Connect) {
  try {
    const endpoint = await connect();
    const client = OpenCode.make({ ...endpoint, fetch: timedFetch });
    const session = await client.session.get({ sessionID: target.sessionID });
    if (target.directory !== undefined && session.location.directory !== target.directory) {
      throw new BridgeError(
        409,
        "The session belongs to another directory. Check the selected OpenCode connection.",
      );
    }
    const directory = targetSchema.shape.directory.parse(session.location.directory);
    const { directory: _directory, ...input } = target;
    const response = await client.rpc.call({
      rpcID: INSIGHT_RPC_ID,
      method,
      location: { directory },
      input,
    });
    if (method === "series") return seriesSchema.parse(response.output);
    const snapshot = sessionSchema.parse(response.output);
    if (snapshot.sessionID !== target.sessionID || snapshot.directory !== directory) {
      throw new BridgeError(409, "Insight returned a different session scope.");
    }
    return snapshot;
  } catch (error) {
    if (error instanceof BridgeError) throw error;
    // Upstream errors may include request headers or response bodies. Never forward them.
    throw new BridgeError(
      502,
      "Cannot query Insight on this OpenCode instance. Check the plugin, session, and connection.",
    );
  }
}

export function createBridge(connect: Connect = loadConnection) {
  return async (method: "session" | "series", body: unknown) => {
    const parsed = (method === "session" ? targetSchema : querySchema).safeParse(body);
    if (!parsed.success)
      throw new BridgeError(400, "A session ID and its project directory are required.");
    return method === "series"
      ? query("series", parsed.data, connect)
      : query("session", parsed.data, connect);
  };
}

export function createInsightReader(connect: Connect = loadConnection) {
  return async (sessionID: unknown): Promise<SessionInsight> => {
    const parsed = sessionIDSchema.safeParse(sessionID);
    if (!parsed.success) throw new BridgeError(400, "A valid OpenCode session ID is required.");
    return query("session", { sessionID: parsed.data }, connect);
  };
}
