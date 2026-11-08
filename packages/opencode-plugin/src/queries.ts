import type { Plugin } from "@opencode/plugin";
import type { z } from "zod";
import { buildSeries } from "@opencode-insight/telemetry";
import {
  buildOverview,
  buildSpeedWindow,
  buildToolPage,
} from "@opencode-insight/telemetry/queries";
import { buildSeriesWindow, buildSourcePage } from "@opencode-insight/telemetry/details";
import { Insight } from "./rpc";
import type { Collector } from "./collector";
import { seedHistory } from "./history";
import { snapshot } from "./snapshot";

type QueryHandlers = {
  [K in keyof typeof Insight.methods]: (
    input: z.output<(typeof Insight.methods)[K]["input"]>,
  ) => Promise<z.input<(typeof Insight.methods)[K]["output"]>>;
};

export function createQueries(
  ctx: Plugin.Context,
  collector: Collector,
  assertCapture: () => void,
  getCurrentSpeedScope: () => string,
) {
  const verifiedInfo = async (sessionID: string) => {
    const info = await ctx.session.get({ sessionID });
    if (info.location.directory !== ctx.location.directory)
      throw new Error("Session belongs to another location");
    return info;
  };
  const verifiedSession = async (sessionID: string) => {
    const info = await verifiedInfo(sessionID);
    return collector.session(sessionID, info.parentID);
  };
  const querySession = async (
    sessionID: string,
    info?: Awaited<ReturnType<typeof verifiedInfo>>,
  ) => {
    const verified = info ?? (await verifiedInfo(sessionID));
    const session = await collector.session(sessionID, verified.parentID);
    if (
      !session.requests.length &&
      seedHistory(session, await ctx.session.context({ sessionID }))
    ) {
      collector.touch(session, Date.now());
    }
    return session;
  };
  const queries: QueryHandlers = {
    session: (input) =>
      collector.serialize(async () => {
        assertCapture();
        return snapshot(await querySession(input.sessionID));
      }),
    series: (input) =>
      collector.serialize(async () => {
        assertCapture();
        const info = await verifiedInfo(input.sessionID);
        const unchanged = collector.unchanged(input.sessionID, input.after);
        return snapshot(unchanged ?? buildSeries(await querySession(input.sessionID, info), input));
      }),
    overview: (input) =>
      collector.serialize(async () => {
        assertCapture();
        const info = await verifiedInfo(input.sessionID);
        const idle = collector.unchanged(input.sessionID, input.after);
        const unchanged = (revision: number) => ({
          sessionID: input.sessionID,
          directory: ctx.location.directory,
          revision,
          unchanged: true,
        });
        if (idle) return unchanged(idle.revision);
        const session = await querySession(input.sessionID, info);
        if (
          input.after === session.revision &&
          !session.requests.some((request) => request.status === "running") &&
          !session.tools.some((tool) => tool.status === "running")
        )
          return unchanged(session.revision);
        return snapshot(buildOverview(session));
      }),
    speedScope: async (input) => {
      assertCapture();
      await verifiedInfo(input.sessionID);
      return {
        sessionID: input.sessionID,
        directory: ctx.location.directory,
        scope: getCurrentSpeedScope(),
      };
    },
    speedWindow: (input) =>
      collector.serialize(async () => {
        assertCapture();
        const scope = getCurrentSpeedScope();
        const session = await querySession(input.sessionID);
        if (scope !== getCurrentSpeedScope())
          throw new Error("Telemetry source changed during speed query");
        const measuredAt = Date.now();
        return snapshot({ ...buildSpeedWindow(session, input, measuredAt), scope });
      }),
    toolPage: (input) =>
      collector.serialize(async () => {
        assertCapture();
        return snapshot(buildToolPage(await querySession(input.sessionID), input));
      }),
    seriesWindow: (input) =>
      collector.serialize(async () => {
        assertCapture();
        return snapshot(buildSeriesWindow(await querySession(input.sessionID), input));
      }),
    sourcePage: (input) =>
      collector.serialize(async () => {
        assertCapture();
        return snapshot(buildSourcePage(await querySession(input.sessionID), input));
      }),
  };
  return { queries, verifiedSession };
}
