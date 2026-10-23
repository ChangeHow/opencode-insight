import { Rpc } from "@opencode/plugin/rpc";
import {
  INSIGHT_RPC_ID,
  seriesInputSchema,
  seriesSchema,
  sessionSchema,
} from "@opencode-insight/telemetry/schema";
import {
  overviewInputSchema,
  overviewSchema,
  speedWindowInputSchema,
  speedWindowSchema,
  speedScopeSchema,
  toolPageInputSchema,
  toolPageSchema,
} from "@opencode-insight/telemetry/queries";
import {
  seriesWindowInputSchema,
  seriesWindowSchema,
  sourcePageInputSchema,
  sourcePageSchema,
} from "@opencode-insight/telemetry/details";
import { z } from "zod";

export const getSessionInputSchema = z.object({ sessionID: z.string().min(1).max(128) });
export const Insight = Rpc.define({
  id: INSIGHT_RPC_ID,
  methods: {
    session: { input: getSessionInputSchema, output: sessionSchema },
    series: { input: seriesInputSchema, output: seriesSchema },
    overview: { input: overviewInputSchema, output: overviewSchema },
    speedWindow: { input: speedWindowInputSchema, output: speedWindowSchema },
    speedScope: { input: getSessionInputSchema, output: speedScopeSchema },
    toolPage: { input: toolPageInputSchema, output: toolPageSchema },
    seriesWindow: { input: seriesWindowInputSchema, output: seriesWindowSchema },
    sourcePage: { input: sourcePageInputSchema, output: sourcePageSchema },
  },
  events: {},
});
