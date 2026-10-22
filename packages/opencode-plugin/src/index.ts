import { Plugin } from "@opencode/plugin";
import { randomUUID } from "node:crypto";
import { buildSeries, estimateTokens } from "@opencode-insight/telemetry";
import {
  buildOverview,
  buildSpeedWindow,
  buildToolPage,
} from "@opencode-insight/telemetry/queries";
import { buildSeriesWindow, buildSourcePage } from "@opencode-insight/telemetry/details";
import { Collector } from "./collector";
import { captureContext } from "./context";
import { Provenance } from "./provenance";
import { captureEvent, ensureTool, toolMetadata } from "./events";
import { Insight } from "./rpc";
import { trackToolScopes } from "./tool-scope";
import { seedHistory } from "./history";
import { snapshot } from "./snapshot";

export { Insight } from "./rpc";

export default Plugin.define({
  id: "opencode-insight",
  async setup(ctx) {
    const collector = new Collector(ctx.storage, ctx.location.directory, ctx.location.workspaceID);
    // Owned by this location's live capture/RPC setup, never by the separate RPC bundle.
    let speedScope = randomUUID();
    const controller = new AbortController();
    const provenance = new Provenance();
    let streamError: unknown;
    let captureError: unknown;
    const observe = async (operation: () => Promise<void>) => {
      try {
        await operation();
      } catch (error) {
        captureError = error;
      }
    };
    const registrations: { dispose(): Promise<void> }[] = [];
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
    const assertCapture = () => {
      collector.assertHealthy();
      if (captureError) throw new Error("Telemetry capture is incomplete", { cause: captureError });
      if (streamError)
        throw new Error("Telemetry event capture interrupted", { cause: streamError });
    };
    registrations.push(
      await trackToolScopes(ctx, collector, (error) => {
        captureError = error;
      }),
    );
    registrations.push(
      await ctx.session.hook("context", async (input) => {
        // Resolve location via the native API; context hooks have no location field.
        await observe(() =>
          collector.serialize(async () => {
            const session = await verifiedSession(input.sessionID);
            const { skills, attachments } = await provenance.context(session, input, () =>
              ctx.session.context({ sessionID: input.sessionID }),
            );
            const { sources, partial } = captureContext(input, skills, attachments);
            collector.context(session, sources, partial);
          }),
        );
      }),
    );
    registrations.push(
      await ctx.tool.hook("execute.before", async (input) => {
        await observe(() =>
          collector.serialize(async () => {
            const session = await verifiedSession(input.sessionID);
            const entry = ensureTool(session, input.id, input.tool, input.messageID, Date.now());
            entry.startedAt = Date.now();
            // Keep metadata flags, never retain the actual tool input.
            if (input.input && typeof input.input === "object")
              toolMetadata(entry, input.input as Record<string, unknown>);
            collector.touch(session, Date.now());
          }),
        );
      }),
    );
    registrations.push(
      await ctx.tool.hook("execute.after", async (input) => {
        await observe(() =>
          collector.serialize(async () => {
            const session = await verifiedSession(input.sessionID);
            const entry = ensureTool(session, input.id, input.tool, input.messageID, Date.now());
            entry.status = input.status;
            entry.endedAt = Date.now();
            if (input.status === "completed") {
              toolMetadata(entry, input.result.metadata);
              const content = input.result.content;
              if (content !== undefined)
                entry.resultTokens = estimateTokens(
                  typeof content === "string" ? content : JSON.stringify(content),
                );
            }
            collector.touch(session, Date.now());
          }),
        );
      }),
    );
    registrations.push(
      await ctx.rpc.register(Insight, {
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
            return snapshot(
              unchanged ?? buildSeries(await querySession(input.sessionID, info), input),
            );
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
            scope: speedScope,
          };
        },
        speedWindow: (input) =>
          collector.serialize(async () => {
            assertCapture();
            const scope = speedScope;
            const session = await querySession(input.sessionID);
            if (scope !== speedScope)
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
      }),
    );
    const stream = (async () => {
      let connected = false;
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          if (event.type === "server.connected") {
            provenance.clear();
            if (connected) {
              speedScope = randomUUID();
              await collector.close();
            }
            connected = true;
            continue;
          }
          if (event.location?.directory !== ctx.location.directory) continue;
          const workspaceID =
            "workspaceID" in event.location ? event.location.workspaceID : undefined;
          if (workspaceID !== ctx.location.workspaceID) continue;
          await collector.serialize(async () => {
            await captureEvent(collector, event);
            if (
              event.type === "session.step.started" ||
              event.type === "session.inbox.enqueued" ||
              event.type === "session.skill.activated"
            ) {
              const session = await collector.session(event.data.sessionID);
              if (event.type === "session.step.started")
                provenance.ordinary(session, event.data.assistantMessageID);
              else if (event.type === "session.inbox.enqueued") {
                const item = event.data.item;
                // Admission is durable and follows all prompt hooks and skill resolution.
                // Draft prompt inputs and assembled roles alone are not identity proofs.
                if (
                  item.type === "synthetic" ||
                  (item.type === "user" && !item.payload.skills?.length)
                )
                  provenance.ordinary(session, event.data.inboxID);
                else provenance.invalidate(session);
              } else provenance.invalidate(session);
            }
          });
        }
        if (!controller.signal.aborted) streamError = new Error("Telemetry event stream ended");
      } catch (error) {
        if (!controller.signal.aborted) streamError = error;
      }
      if (streamError) await collector.close();
    })().catch((error: unknown) => {
      streamError = error;
    });
    return async () => {
      controller.abort();
      await stream;
      for (const registration of registrations.reverse()) await registration.dispose();
      await collector.close(Date.now());
      if (streamError)
        throw new Error("Telemetry event capture interrupted", { cause: streamError });
    };
  },
});
