/// <reference types="node" />
import { AsyncLocalStorage } from "node:async_hooks";
import type { Plugin } from "@opencode/plugin";
import type { Collector } from "./collector";
import { ensureTool } from "./events";

interface Scope {
  sessionID: string;
  id: string;
  background: boolean;
}

/** Async scope distinguishes nested codemode execution from concurrent siblings. */
export async function trackToolScopes(
  ctx: Plugin.Context,
  collector: Collector,
  reportError: (error: unknown) => void = () => {},
) {
  const scopes = new AsyncLocalStorage<Scope>();
  return ctx.tool.transform((editor) => {
    for (const definition of editor.list()) {
      editor.update(definition.id, (tool) => {
        const execute = tool.execute;
        tool.execute = async (input, context) => {
          const parent = scopes.getStore();
          const inherited = parent?.sessionID === context.sessionID ? parent : undefined;
          const background =
            inherited?.background ||
            Boolean(
              input &&
              typeof input === "object" &&
              "background" in input &&
              input.background === true,
            );
          let ownLocation = false;
          try {
            const info = await ctx.session.get({ sessionID: context.sessionID });
            ownLocation = info.location.directory === ctx.location.directory;
            if (ownLocation)
              await collector.serialize(async () => {
                const session = await collector.session(context.sessionID, info.parentID);
                const entry = ensureTool(
                  session,
                  context.id,
                  definition.id,
                  context.messageID,
                  Date.now(),
                );
                if (inherited) entry.parentID = inherited.id;
                entry.background ||= background;
                collector.touch(session, Date.now());
              });
          } catch (error) {
            reportError(error);
            return execute(input, context);
          }
          if (!ownLocation) return execute(input, context);
          return scopes.run({ sessionID: context.sessionID, id: context.id, background }, () =>
            execute(input, context),
          );
        };
      });
    }
  });
}
