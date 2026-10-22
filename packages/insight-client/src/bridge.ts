import { OpenCode } from "@opencode/client";
import {
  INSIGHT_RPC_ID,
  seriesInputSchema,
  seriesSchema,
  sessionSchema,
  type InsightSeries,
  type SessionInsight,
} from "@opencode-insight/telemetry/schema";
import {
  overviewInputSchema,
  overviewSchema,
  speedWindowInputSchema,
  speedWindowSchema,
  toolPageInputSchema,
  toolPageSchema,
  type OverviewResponse,
  type SpeedWindow,
  type ToolPage,
} from "@opencode-insight/telemetry/queries";
import {
  seriesWindowInputSchema,
  seriesWindowSchema,
  sourcePageInputSchema,
  sourcePageSchema,
  type SeriesWindow,
  type SourcePage,
} from "@opencode-insight/telemetry/details";
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
interface QueryOutput {
  session: SessionInsight;
  series: InsightSeries;
  overview: OverviewResponse;
  speedWindow: SpeedWindow;
  toolPage: ToolPage;
  seriesWindow: SeriesWindow;
  sourcePage: SourcePage;
}
export type QueryMethod = keyof QueryOutput;
const inputSchemas = {
  session: targetSchema,
  series: querySchema,
  overview: overviewInputSchema.safeExtend({
    sessionID: sessionIDSchema,
    directory: targetSchema.shape.directory,
  }),
  speedWindow: speedWindowInputSchema.safeExtend({
    sessionID: sessionIDSchema,
    directory: targetSchema.shape.directory,
  }),
  toolPage: toolPageInputSchema.safeExtend({
    sessionID: sessionIDSchema,
    directory: targetSchema.shape.directory,
  }),
  seriesWindow: seriesWindowInputSchema.safeExtend({
    sessionID: sessionIDSchema,
    directory: targetSchema.shape.directory,
  }),
  sourcePage: sourcePageInputSchema.safeExtend({
    sessionID: sessionIDSchema,
    directory: targetSchema.shape.directory,
  }),
};
const outputSchemas = {
  session: sessionSchema,
  series: seriesSchema,
  overview: overviewSchema,
  speedWindow: speedWindowSchema,
  toolPage: toolPageSchema,
  seriesWindow: seriesWindowSchema,
  sourcePage: sourcePageSchema,
};
const readSchemas = {
  overview: overviewInputSchema,
  speedWindow: speedWindowInputSchema,
  toolPage: toolPageInputSchema,
  seriesWindow: seriesWindowInputSchema,
  sourcePage: sourcePageInputSchema,
};
export type InsightQueryMethod = keyof typeof readSchemas;
type QueryTarget = {
  sessionID: string;
  directory?: string;
  after?: number;
  bucketMs?: number;
  windowMs?: number;
  from?: number;
  to?: number;
  group?: string;
  toolID?: string;
  cursor?: string;
  limit?: number;
  scope?: "current" | "cumulative";
  kind?: "system" | "definitions" | "user" | "skill" | "assistant" | "tool" | "injected";
};

async function query<M extends QueryMethod>(
  method: M,
  target: QueryTarget,
  connect: Connect,
): Promise<QueryOutput[M]> {
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
    const output = outputSchemas[method].parse(response.output);
    if ("sessionID" in output) {
      if (output.sessionID !== target.sessionID || output.directory !== directory)
        throw new BridgeError(409, "Insight returned a different session scope.");
    }
    return output as QueryOutput[M];
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
  return async (method: QueryMethod, body: unknown) => {
    if (!Object.hasOwn(inputSchemas, method))
      throw new BridgeError(400, "Unknown Insight operation.");
    const parsed = inputSchemas[method].safeParse(body);
    if (!parsed.success)
      throw new BridgeError(400, "A session ID and its project directory are required.");
    return query(method, parsed.data, connect);
  };
}

export function createInsightReader(connect: Connect = loadConnection) {
  return async (sessionID: unknown): Promise<SessionInsight> => {
    const parsed = sessionIDSchema.safeParse(sessionID);
    if (!parsed.success) throw new BridgeError(400, "A valid OpenCode session ID is required.");
    return query("session", { sessionID: parsed.data }, connect);
  };
}

/** ID-only dashboard reads resolve authority before selecting a compact projection. */
export function createInsightQueryReader(connect: Connect = loadConnection) {
  return async <M extends InsightQueryMethod>(
    method: M,
    sessionID: unknown,
    options: Record<string, unknown> = {},
  ): Promise<QueryOutput[M]> => {
    const id = sessionIDSchema.safeParse(sessionID);
    if (!id.success) throw new BridgeError(400, "A valid OpenCode session ID is required.");
    if (!Object.hasOwn(readSchemas, method))
      throw new BridgeError(400, "Unknown Insight operation.");
    const parsed = readSchemas[method].safeParse({ ...options, sessionID: id.data });
    if (!parsed.success) throw new BridgeError(400, "Invalid Insight query parameters.");
    return query(method, parsed.data, connect);
  };
}
