import { OpenCode } from "@opencode/client";
import {
  INSIGHT_RPC_ID,
  seriesInputSchema,
  seriesSchema,
  sessionSchema,
} from "@opencode-insight/telemetry/schema";
import { z } from "zod";
import { BridgeError, loadConnection, type Connection } from "./connection";

const targetSchema = z.object({
  sessionID: z
    .string()
    .regex(/^ses_[A-Za-z0-9]+$/)
    .max(128),
  directory: z.string().min(1).max(4096),
});
const querySchema = seriesInputSchema.extend({ directory: targetSchema.shape.directory });

const timedFetch: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    redirect: "error",
    signal: init?.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)])
      : AbortSignal.timeout(8000),
  });

export function createBridge(connect: () => Promise<Connection> = loadConnection) {
  return async (method: "session" | "series", body: unknown) => {
    const parsed = (method === "session" ? targetSchema : querySchema).safeParse(body);
    if (!parsed.success)
      throw new BridgeError(400, "A session ID and its project directory are required.");
    const target = parsed.data;
    const endpoint = await connect();
    const client = OpenCode.make({ ...endpoint, fetch: timedFetch });
    try {
      const session = await client.session.get({ sessionID: target.sessionID });
      if (session.location.directory !== target.directory) {
        throw new BridgeError(
          409,
          "The session belongs to another directory. Check the selected OpenCode connection.",
        );
      }
      const { directory, ...input } = target;
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
      // Upstream errors may include request headers or response bodies. Never forward them to the iframe.
      throw new BridgeError(
        502,
        "Cannot query Insight on this OpenCode instance. Check the plugin, session, and connection.",
      );
    }
  };
}
