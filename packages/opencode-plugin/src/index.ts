import { Plugin } from "@opencode/plugin";
import {
  buildSeries,
  estimateTokens,
  sessionSchema,
  seriesSchema,
} from "@opencode-insight/telemetry";
import { Collector } from "./collector";
import { captureContext } from "./context";
import { captureEvent, ensureTool, toolMetadata } from "./events";
import { Insight } from "./rpc";
import { trackToolScopes } from "./tool-scope";
import { seedHistory } from "./history";

export { Insight } from "./rpc";

export default Plugin.define({
  id: "opencode-insight",
  async setup(ctx) {
    const collector = new Collector(ctx.storage, ctx.location.directory, ctx.location.workspaceID);
    const controller = new AbortController();
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
    const verifiedSession = async (sessionID: string) => {
      const info = await ctx.session.get({ sessionID });
      if (info.location.directory !== ctx.location.directory)
        throw new Error("Session belongs to another location");
      return collector.session(sessionID, info.parentID);
    };
    const querySession = async (sessionID: string) => {
      const session = await verifiedSession(sessionID);
      if (
        !session.requests.length &&
        seedHistory(session, await ctx.session.context({ sessionID }))
      ) {
        collector.touch(session, Date.now());
      }
      return session;
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
            const messages = await ctx.session.context({ sessionID: input.sessionID });
            const skills = new Map(
              messages
                .filter((m) => m.type === "skill")
                .map((m) => [m.id, { id: m.skill, name: m.name }]),
            );
            const { sources, partial } = captureContext(input, skills);
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
            collector.assertHealthy();
            if (captureError)
              throw new Error("Telemetry capture is incomplete", { cause: captureError });
            if (streamError)
              throw new Error("Telemetry event capture interrupted", { cause: streamError });
            return sessionSchema.parse(
              JSON.parse(JSON.stringify(await querySession(input.sessionID))),
            );
          }),
        series: (input) =>
          collector.serialize(async () => {
            collector.assertHealthy();
            if (captureError)
              throw new Error("Telemetry capture is incomplete", { cause: captureError });
            if (streamError)
              throw new Error("Telemetry event capture interrupted", { cause: streamError });
            return seriesSchema.parse(
              JSON.parse(JSON.stringify(buildSeries(await querySession(input.sessionID), input))),
            );
          }),
      }),
    );
    const stream = (async () => {
      let connected = false;
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          if (event.type === "server.connected") {
            if (connected) await collector.close();
            connected = true;
            continue;
          }
          if (event.location?.directory !== ctx.location.directory) continue;
          const workspaceID =
            "workspaceID" in event.location ? event.location.workspaceID : undefined;
          if (workspaceID !== ctx.location.workspaceID) continue;
          await collector.serialize(() => captureEvent(collector, event));
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
