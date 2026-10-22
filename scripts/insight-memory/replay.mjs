import { Plugin } from "@opencode/plugin";
import { Rpc } from "@opencode/plugin/rpc";
import { replayContext } from "./replay-context.mjs";

const Replay = Rpc.define({
  id: "insight-memory-replay",
  methods: {
    run: {
      input: { type: "object", additionalProperties: false },
      output: { type: "object", additionalProperties: true },
    },
  },
  events: {},
});

async function run(subject) {
  const fixture = replayContext();
  globalThis.__insightReplayClock = fixture.clock;
  const transcript = [];
  let cleanup = await subject.setup(fixture.context);
  const sessionID = "ses_fixture";
  const wrapper =
    '<skill_content name="review">Review the controlled fixture carefully.</skill_content>';
  const attached = {
    type: "user",
    id: "user-1",
    text: "Use the skill",
    skills: [{ id: "review", name: "Review", text: wrapper }],
    time: { created: fixture.clock.now() },
  };
  let messages = [
    { id: "user-1", role: "user", content: [{ type: "text", text: `Use the skill\n${wrapper}` }] },
  ];
  const hook = async (name, input) => {
    await fixture.clock.advance(11);
    await fixture.hooks.get(name)?.(input);
  };
  const event = async (type, data) => {
    await fixture.clock.advance(17);
    await fixture.event(type, { sessionID, ...data });
  };
  const capture = async (label) => {
    const session = await fixture.handlers.session({ sessionID });
    const series = await fixture.handlers.series({ sessionID });
    const unchanged = await fixture.handlers.series({ sessionID, after: session.revision });
    transcript.push({ label, session, series, unchanged });
  };
  const context = () =>
    hook("context", {
      sessionID,
      system: [{ type: "text", text: "Controlled system prompt" }],
      tools: { shell: { description: "Read local fixture", input: { type: "object" } } },
      messages,
    });
  try {
    await fixture.event("server.connected", {});
    await event("session.created", {});
    fixture.setHistory([attached]);
    await hook("prompt", {
      sessionID,
      messageID: attached.id,
      prompt: { text: attached.text, skills: attached.skills },
      delivery: "steer",
    });
    await event("session.inbox.enqueued", {
      inboxID: attached.id,
      item: {
        type: "user",
        delivery: "steer",
        payload: { text: attached.text, skills: attached.skills },
      },
    });
    await context();
    for (let turn = 0; turn < 3; turn++) {
      const id = `request-${turn}`;
      await event("session.step.started", {
        assistantMessageID: id,
        agent: "build",
        model: { providerID: "openai", id: "gpt-fixture" },
        started: fixture.clock.now(),
      });
      if (turn) await context();
      const streams =
        turn === 1
          ? [
              ["session.reasoning.delta", "A visible summary. ".repeat(250)],
              ["session.text.delta", "中文和 emoji 👍 mixed output. ".repeat(1400)],
            ]
          : [["session.text.delta", "antidisestablishmentarianism <|endoftext|> ".repeat(100)]];
      for (const [type, text] of streams) {
        for (let offset = 0; offset < text.length; offset += 257) {
          await event(type, {
            assistantMessageID: id,
            ordinal: 0,
            delta: text.slice(offset, offset + 257),
          });
          if (offset === 0 || offset === 2056) await capture(`${id}-${type}-${offset}`);
        }
      }
      await event("session.step.streamed", { assistantMessageID: id });
      if (!turn) {
        await hook("execute.before", {
          sessionID,
          messageID: id,
          id: "tool-1",
          tool: "execute",
          input: { background: true },
        });
        await hook("execute.after", {
          sessionID,
          messageID: id,
          id: "tool-1",
          tool: "execute",
          status: "completed",
          result: {
            content: "Controlled result",
            metadata: { toolCalls: [{ tool: "files.read", status: "completed" }] },
          },
        });
      }
      await event("session.step.ended", {
        assistantMessageID: id,
        cost: 0.01,
        tokens: { input: 80, output: 100, reasoning: 20, cache: { read: 4, write: 0 } },
      });
      await capture(`completed-${turn}`);
      messages = [
        ...messages,
        {
          id,
          role: "assistant",
          content: [{ type: "text", text: "Controlled assistant continuation" }],
        },
      ];
      if (!turn)
        messages.push({
          role: "tool",
          content: [{ type: "tool-result", name: "execute", result: "Controlled result" }],
        });
    }
    const skill = {
      type: "skill",
      id: "skill-message",
      skill: "dynamic",
      name: "Dynamic",
      text: "Dynamic skill instructions",
      time: { created: fixture.clock.now() },
    };
    fixture.setHistory([attached, skill]);
    messages.push({ id: skill.id, role: "user", content: [{ type: "text", text: skill.text }] });
    messages.push({ id: "spoof", role: "user", content: [{ type: "text", text: wrapper }] });
    await context();
    await event("session.step.started", {
      assistantMessageID: "interrupted",
      agent: "build",
      model: { providerID: "anthropic", id: "fixture" },
      started: fixture.clock.now(),
    });
    await event("session.reasoning.delta", {
      assistantMessageID: "interrupted",
      ordinal: 0,
      delta: "Visible reasoning",
    });
    await event("session.execution.interrupted", {});
    await capture("interrupted");
    messages = [{ role: "user", content: [{ type: "text", text: wrapper }] }];
    await context();
    await event("session.step.started", {
      assistantMessageID: "idless",
      agent: "build",
      model: { providerID: "openai", id: "fixture" },
      started: fixture.clock.now(),
    });
    await event("session.text.delta", {
      assistantMessageID: "idless",
      ordinal: 0,
      delta: "Identifierless provider context",
    });
    await event("session.step.ended", {
      assistantMessageID: "idless",
      tokens: { input: 10, output: 5, reasoning: 0, cache: { read: 0, write: 0 } },
    });
    await capture("identifierless");
    for (const id of ["missing", "foreign"]) {
      try {
        await fixture.handlers.session({ sessionID: id });
        transcript.push({ invalidScope: id, accepted: true });
      } catch (error) {
        transcript.push({ invalidScope: id, error: error.message });
      }
    }
    await fixture.clock.advance(1100);
    await capture("timer-flush");
    const revision = transcript.at(-1).session.revision;
    await fixture.clock.advance(20000);
    transcript.push({
      label: "idle-poll",
      unchanged: await fixture.handlers.series({ sessionID, after: revision }),
    });
    await capture("after-idle");
    await context();
    await event("session.step.started", {
      assistantMessageID: "after-idle",
      agent: "build",
      model: { providerID: "openai", id: "fixture" },
      started: fixture.clock.now(),
    });
    await event("session.text.delta", {
      assistantMessageID: "after-idle",
      ordinal: 0,
      delta: "Resume 中文 👍",
    });
    await event("session.step.streamed", { assistantMessageID: "after-idle" });
    await event("session.step.ended", {
      assistantMessageID: "after-idle",
      tokens: { input: 10, output: 5, reasoning: 0, cache: { read: 0, write: 0 } },
    });
    await capture("resumed-after-idle");
    const ordinarySession = "ses_ordinary";
    const ordinaryUser = {
      type: "user",
      id: "ordinary-user",
      text: "Plain fixture",
      time: { created: fixture.clock.now() },
    };
    fixture.setHistory([ordinaryUser]);
    await event("session.created", { sessionID: ordinarySession });
    await event("session.inbox.enqueued", {
      sessionID: ordinarySession,
      inboxID: ordinaryUser.id,
      item: { type: "user", delivery: "steer", payload: { text: ordinaryUser.text } },
    });
    await hook("context", {
      sessionID: ordinarySession,
      system: [],
      tools: {},
      messages: [
        { id: ordinaryUser.id, role: "user", content: [{ type: "text", text: ordinaryUser.text }] },
      ],
    });
    await event("session.step.started", {
      sessionID: ordinarySession,
      assistantMessageID: "ordinary-request",
      agent: "build",
      model: { providerID: "openai", id: "fixture" },
      started: fixture.clock.now(),
    });
    await event("session.text.delta", {
      sessionID: ordinarySession,
      assistantMessageID: "ordinary-request",
      ordinal: 0,
      delta: "Done",
    });
    await event("session.step.streamed", {
      sessionID: ordinarySession,
      assistantMessageID: "ordinary-request",
    });
    await event("session.step.ended", {
      sessionID: ordinarySession,
      assistantMessageID: "ordinary-request",
      tokens: { input: 10, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
    });
    transcript.push({
      label: "ordinary-admission",
      session: await fixture.handlers.session({ sessionID: ordinarySession }),
    });
    for (let index = 0; index < 65; index++)
      await event("session.created", { sessionID: `ses_eviction${index}` });
    await capture("after-session-eviction");
    const captureOperations = { ...globalThis[Symbol.for("insight-memory.operations")] };
    await cleanup();
    cleanup = undefined;
    const persisted = [...fixture.persisted].sort(([left], [right]) => left.localeCompare(right));
    cleanup = await subject.setup(fixture.context);
    await capture("restored");
    await cleanup();
    cleanup = undefined;
    return {
      contract: { transcript, persisted },
      diagnostics: {
        captureOperations,
        recoveryOperations: globalThis[Symbol.for("insight-memory.operations")],
      },
    };
  } finally {
    if (cleanup) await cleanup();
    delete globalThis.__insightReplayClock;
  }
}

export function replayPlugin(subject) {
  return Plugin.define({
    id: "insight-memory-replay",
    async setup(ctx) {
      const registration = await ctx.rpc.register(Replay, { run: () => run(subject) });
      return () => registration.dispose();
    },
  });
}
