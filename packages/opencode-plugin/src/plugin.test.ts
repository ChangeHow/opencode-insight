import { describe, expect, test, vi } from "vitest";
import type { Plugin } from "@opencode/plugin";
import type { SessionInsight } from "@opencode-insight/telemetry";
import plugin from "./index";
import { Insight, getSessionInputSchema } from "./rpc";
import type { NativeEvent } from "./events";
import { Collector } from "./collector";
import { trackToolScopes } from "./tool-scope";
import { Host } from "@opencode/plugin/host";
import { fileURLToPath } from "node:url";

type Handler = (input: { sessionID: string; after?: number }) => Promise<unknown>;
type NativeContextMessage = Awaited<ReturnType<Plugin.Context["session"]["context"]>>[number];
function harness(events: NativeEvent[] = []) {
  const persisted = new Map<string, unknown>();
  const hooks = new Map<string, (input: unknown) => Promise<void>>();
  let handlers: Record<string, Handler> = {};
  const dispose = vi.fn(async () => {});
  const context = {
    location: { directory: "/a", workspaceID: undefined },
    storage: {
      get: vi.fn(async (key: string) => persisted.get(key)),
      set: vi.fn(async (key: string, value: unknown) => {
        persisted.set(key, structuredClone(value));
      }),
    },
    session: {
      context: vi.fn(async (): Promise<NativeContextMessage[]> => []),
      get: vi.fn(async ({ sessionID }: { sessionID: string }) => {
        if (sessionID === "missing") throw new Error("Session not found");
        return { location: { directory: sessionID === "foreign" ? "/b" : "/a" } };
      }),
      hook: vi.fn(async (name: string, callback: (input: unknown) => Promise<void>) => {
        hooks.set(name, callback);
        return { dispose };
      }),
    },
    tool: {
      transform: vi.fn(async () => ({ dispose })),
      hook: vi.fn(async (name: string, callback: (input: unknown) => Promise<void>) => {
        hooks.set(name, callback);
        return { dispose };
      }),
    },
    rpc: {
      register: vi.fn(async (_definition: unknown, input: Record<string, Handler>) => {
        handlers = input;
        return { dispose };
      }),
    },
    event: {
      async *subscribe({ signal }: { signal: AbortSignal }) {
        for (const event of events) yield event;
        await new Promise<void>((resolve) => {
          if (signal.aborted) resolve();
          else signal.addEventListener("abort", () => resolve(), { once: true });
        });
      },
    },
  };
  return {
    context,
    hooks,
    persisted,
    dispose,
    get handlers() {
      return handlers;
    },
  };
}
function native(directory: string, id: string): NativeEvent {
  return {
    id: `e-${id}`,
    created: 1000,
    type: "session.step.started",
    location: { directory },
    data: {
      sessionID: "s1",
      assistantMessageID: id,
      agent: "build",
      model: { providerID: "openai", id: "gpt-5" },
      started: 1000,
    },
  } as NativeEvent;
}

describe("native V2 plugin", () => {
  test("registers the shared typed RPC and rejects missing/foreign sessions", async () => {
    const h = harness();
    const cleanup = await plugin.setup(h.context as unknown as Plugin.Context);
    expect(h.context.rpc.register.mock.calls[0][0]).toBe(Insight);
    expect(getSessionInputSchema.safeParse({ sessionID: "" }).success).toBe(false);
    await expect(h.handlers.session({ sessionID: "missing" })).rejects.toThrow("Session not found");
    await expect(h.handlers.series({ sessionID: "foreign" })).rejects.toThrow("another location");
    const s = (await h.handlers.session({ sessionID: "s1" })) as SessionInsight;
    expect(s.sessionID).toBe("s1");
    expect(s.interruptedCapture).toBe(true);
    expect(Object.keys(s)).not.toContain("parentID");
    expect(await h.handlers.series({ sessionID: "s1", after: s.revision })).toMatchObject({
      unchanged: true,
      points: [],
    });
    await cleanup!();
    expect(h.dispose).toHaveBeenCalledTimes(5);
  });

  test("provides a discoverable local-directory entrypoint for the native loader", () => {
    expect(
      Host.resolve({ directory: fileURLToPath(new URL("../../../", import.meta.url)) }).server,
    ).toBe(new URL("../../../server.ts", import.meta.url).href);
  });

  test("subscribes to native events, filters other locations, and flushes on cleanup", async () => {
    const h = harness([native("/b", "foreign-request"), native("/a", "own-request")]);
    const cleanup = await plugin.setup(h.context as unknown as Plugin.Context);
    await vi.waitFor(async () => {
      const s = (await h.handlers.session({ sessionID: "s1" })) as SessionInsight;
      expect(s.requests.map((r) => r.id)).toEqual(["own-request"]);
    });
    await cleanup!();
    const saved = [...h.persisted.values()][0] as SessionInsight;
    expect(saved.requests[0].status).toBe("interrupted");
    expect(saved.requests[0].capture).toBe("partial");
  });

  test("records tool hooks without retaining tool arguments", async () => {
    const h = harness();
    const cleanup = await plugin.setup(h.context as unknown as Plugin.Context);
    await h.hooks.get("execute.before")!({
      sessionID: "s1",
      messageID: "r1",
      id: "t1",
      tool: "shell",
      input: { background: true, command: "SECRET_COMMAND" },
    });
    await h.hooks.get("execute.after")!({
      sessionID: "s1",
      messageID: "r1",
      id: "t1",
      tool: "shell",
      status: "completed",
      result: { content: "SECRET_RESULT" },
    });
    const s = (await h.handlers.session({ sessionID: "s1" })) as SessionInsight;
    expect(s.tools[0]).toMatchObject({
      id: "t1",
      requestID: "r1",
      name: "shell",
      status: "completed",
      background: true,
    });
    await cleanup!();
    expect(JSON.stringify([...h.persisted.values()])).not.toContain("SECRET");
  });

  test("attributes native user.skills attachments through the context hook without persisting text", async () => {
    const h = harness([native("/a", "own-request")]);
    const cleanup = await plugin.setup(h.context as unknown as Plugin.Context);
    await vi.waitFor(async () => {
      const s = (await h.handlers.session({ sessionID: "s1" })) as SessionInsight;
      expect(s.requests.map((r) => r.id)).toEqual(["own-request"]);
    });
    const wrapper = '<skill_content name="insight-check">SECRET_SKILL_BODY</skill_content>';
    h.context.session.context.mockResolvedValueOnce([
      {
        type: "user",
        id: "u1",
        text: "Run the check",
        skills: [{ id: "insight-check", name: "insight-check", text: wrapper }],
        time: { created: 1000 },
      },
      { type: "user", id: "u2", text: "Plain request", time: { created: 1001 } },
    ]);
    await h.hooks.get("context")!({
      sessionID: "s1",
      system: [],
      tools: {},
      messages: [
        { id: "u1", role: "user", content: [{ type: "text", text: `Run the check\n${wrapper}` }] },
        {
          id: "u2",
          role: "user",
          content: [
            {
              type: "text",
              text: `Plain request\n<skill_content name="spoofed">SECRET_SPOOFED_BODY</skill_content>`,
            },
          ],
        },
      ],
    });
    const s = (await h.handlers.session({ sessionID: "s1" })) as SessionInsight;
    const context = s.requests[0].context;
    expect(context.find((c) => c.id === "insight-check")).toMatchObject({
      kind: "skill",
      label: "insight-check",
    });
    expect(context.filter((c) => c.id === "skill:unclassified")).toHaveLength(1);
    expect(context.filter((c) => c.kind === "user")).toHaveLength(2);
    await cleanup!();
    const persisted = JSON.stringify([...h.persisted.values()]);
    expect(persisted).not.toContain("SECRET");
    expect(persisted).not.toContain("skill_content");
  });

  test("telemetry failures never reject the model context hook", async () => {
    const h = harness();
    const cleanup = await plugin.setup(h.context as unknown as Plugin.Context);
    h.context.storage.get.mockRejectedValueOnce(new Error("Unavailable telemetry storage"));
    await expect(
      h.hooks.get("context")!({ sessionID: "s1", system: [], messages: [], tools: {} }),
    ).resolves.toBeUndefined();
    await expect(h.handlers.session({ sessionID: "s1" })).rejects.toThrow("capture is incomplete");
    await cleanup!();
  });

  test("links nested codemode tools via async scope without conflating concurrent siblings", async () => {
    const h = harness();
    type Definition = {
      id: string;
      execute: (
        input: unknown,
        context: { sessionID: string; messageID: string; id: string },
      ) => Promise<unknown>;
    };
    const definitions: Definition[] = [];
    const child: Definition = { id: "shell", execute: async () => ({ content: "ok" }) };
    const parent: Definition = {
      id: "codemode",
      execute: async (_input, context) => {
        await Promise.all(["c1", "c2"].map((id) => child.execute({}, { ...context, id })));
        return { content: "ok" };
      },
    };
    definitions.push(parent, child);
    const transform: Plugin.Context["tool"]["transform"] = async (callback) => {
      callback({
        list: () => definitions,
        update: (id: string, update: (tool: Definition) => void) =>
          update(definitions.find((d) => d.id === id)!),
      } as unknown as Parameters<Parameters<Plugin.Context["tool"]["transform"]>[0]>[0]);
      return { dispose: h.dispose };
    };
    const ctx = {
      ...h.context,
      tool: { ...h.context.tool, transform },
    } as unknown as Plugin.Context;
    const collector = new Collector(ctx.storage, "/a");
    await trackToolScopes(ctx, collector);
    await parent.execute({ background: true }, { sessionID: "s1", messageID: "r1", id: "p1" });
    const s = await collector.session("s1");
    expect(s.tools.find((t) => t.id === "p1")?.parentID).toBeUndefined();
    for (const id of ["c1", "c2"])
      expect(s.tools.find((t) => t.id === id)).toMatchObject({ parentID: "p1", background: true });
    await collector.close();
  });
});
