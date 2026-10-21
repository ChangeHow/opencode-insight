import { Rpc } from "@opencode/plugin/rpc";
import {
  INSIGHT_RPC_ID,
  seriesInputSchema,
  seriesSchema,
  sessionSchema,
} from "@opencode-insight/telemetry/schema";
import { z } from "zod";

export const getSessionInputSchema = z.object({ sessionID: z.string().min(1).max(128) });
export const Insight = Rpc.define({
  id: INSIGHT_RPC_ID,
  methods: {
    session: { input: getSessionInputSchema, output: sessionSchema },
    series: { input: seriesInputSchema, output: seriesSchema },
  },
  events: {},
});
