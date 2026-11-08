import { Plugin } from "@opencode/plugin";
import { randomUUID } from "node:crypto";
import { estimateTokens } from "@opencode-insight/telemetry";
import { Collector } from "./collector";
import { captureContext } from "./context";
import { Provenance } from "./provenance";
import { captureEvent, ensureTool, toolMetadata } from "./events";
import { Insight } from "./rpc";
import { trackToolScopes } from "./tool-scope";
import { createQueries } from "./queries";
import { startHostSource } from "./host-source";

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
    const assertCapture = () => {
      collector.assertHealthy();
      if (captureError) throw new Error("Telemetry capture is incomplete", { cause: captureError });
      if (streamError)
        throw new Error("Telemetry event capture interrupted", { cause: streamError });
    };
    const { queries, verifiedSession } = createQueries(
      ctx,
      collector,
      assertCapture,
      () => speedScope,
    );
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
    const rpcRegistration = await ctx.rpc.register(Insight, queries);
    registrations.push(rpcRegistration);
    let hostSource: Awaited<ReturnType<typeof startHostSource>>;
    try {
      hostSource = await startHostSource(queries, () => speedScope, rpcRegistration.events.emit);
    } catch (error) {
      for (const registration of registrations.reverse()) await registration.dispose();
      await collector.close();
      throw error;
    }
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
      await hostSource.close();
      controller.abort();
      await stream;
      for (const registration of registrations.reverse()) await registration.dispose();
      await collector.close(Date.now());
      if (streamError)
        throw new Error("Telemetry event capture interrupted", { cause: streamError });
    };
  },
});
