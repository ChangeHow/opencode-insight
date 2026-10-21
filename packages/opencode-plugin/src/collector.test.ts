import { describe, expect, test, vi } from "vitest";
import { estimateTokens, type RequestInsight } from "@opencode-insight/telemetry";
import type { Plugin } from "@opencode/plugin";
import { Collector } from "./collector";
import { StreamCounter } from "./stream";
import { captureEvent, type NativeEvent } from "./events";
import { captureContext } from "./context";

function storage() {
  const data = new Map<string, unknown>();
  return {
    data,
    get: vi.fn(async (key: string) => structuredClone(data.get(key))),
    set: vi.fn(async (key: string, value: unknown) => {
      data.set(key, structuredClone(value));
    }),
    remove: vi.fn(),
    scan: vi.fn(),
  };
}
function request(): RequestInsight {
  return {
    id: "r1",
    model: "openai/gpt-5",
    startedAt: 0,
    status: "running",
    reasoningMode: "unknown",
    buckets: [],
    context: [],
    capture: "live",
  };
}
function event(type: string, data: Record<string, unknown>, created: number): NativeEvent {
  return {
    id: `e${created}`,
    type,
    data: { sessionID: "s1", assistantMessageID: "r1", ...data },
    created,
    location: { directory: "/a" },
  } as NativeEvent;
}

describe("numeric telemetry collector", () => {
  test("retokenizes cumulative prefixes across every BPE chunk boundary", () => {
    for (const text of [
      "antidisestablishmentarianism",
      "你好世界",
      "hello world",
      "a surprise: <|endoftext|>",
    ]) {
      for (let split = 1; split < text.length; split++) {
        const r = request();
        const counter = new StreamCounter();
        counter.delta(r, "text:0", "output", text.slice(0, split), 0);
        counter.delta(r, "text:0", "output", text.slice(split), 1000);
        expect(r.buckets.reduce((sum, bucket) => sum + bucket.output, 0)).toBe(
          estimateTokens(text),
        );
        expect(r.buckets.every((b) => b.output >= 0)).toBe(true);
      }
    }
  });

  test("keeps independent text and tool-argument streams and marks bounded capture partial", () => {
    const r = request();
    const counter = new StreamCounter();
    counter.delta(r, "text", "output", "hello", 0);
    counter.delta(r, "args", "output", '{"a":', 0);
    counter.delta(r, "args", "output", '"hello"}', 1000);
    expect(r.buckets.reduce((n, b) => n + b.output, 0)).toBe(
      estimateTokens("hello") + estimateTokens('{"a":"hello"}'),
    );
    counter.delta(r, "text", "output", "x".repeat(65537), 2000);
    expect(r.capture).toBe("partial");
  });

  test("persists no prompt or payload; reload interrupts at last observed time, not reload time", async () => {
    const store = storage();
    const collector = new Collector(store as unknown as Plugin.Context["storage"], "/a");
    const session = await collector.session("s1");
    session.interruptedCapture = false;
    const r = collector.start(session, "r1", "openai/gpt-5", 1000);
    collector.delta(session, r, "text", "output", "PRIVATE_SECRET_PAYLOAD", 2000);
    session.tools.push({
      id: "t",
      name: "shell",
      startedAt: 1500,
      status: "running",
      background: true,
    });
    await collector.flush();
    const serialized = JSON.stringify([...store.data.values()]);
    expect(serialized).not.toContain("PRIVATE_SECRET_PAYLOAD");
    const reloaded = new Collector(store as unknown as Plugin.Context["storage"], "/a");
    const restored = await reloaded.session("s1");
    expect(restored.requests[0].status).toBe("interrupted");
    expect(restored.requests[0].endedAt).toBe(session.updatedAt);
    expect(restored.tools[0].endedAt).toBe(session.updatedAt);
    expect(restored.interruptedCapture).toBe(true);
    expect(restored.revision).toBeGreaterThan(session.revision);
    const cutoff = restored.requests[0].endedAt;
    await captureEvent(
      reloaded,
      event("session.text.delta", { ordinal: 0, delta: "late text" }, 9000),
    );
    await captureEvent(reloaded, event("session.step.streamed", {}, 10000));
    await captureEvent(
      reloaded,
      event(
        "session.step.ended",
        { cost: 0.5, tokens: { input: 2, output: 5, reasoning: 10, cache: { read: 0, write: 0 } } },
        12000,
      ),
    );
    expect(restored.requests[0].endedAt).toBe(cutoff);
    expect(restored.requests[0].streamedAt).toBeUndefined();
    expect(restored.requests[0].status).toBe("interrupted");
    expect(restored.requests[0].usage?.reasoning).toBe(10);
    expect(restored.requests[0].cost).toBe(0.5);
    await collector.close();
    await reloaded.close();
  });

  test("serializes buffered disk writes and isolates directory/workspace keys", async () => {
    const store = storage();
    let active = 0;
    let maximum = 0;
    store.set.mockImplementation(async (key, value) => {
      active++;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      store.data.set(key, value);
      active--;
    });
    const c = new Collector(store as unknown as Plugin.Context["storage"], "/a", "w1");
    await Promise.all(
      [1, 2, 3].map((i) =>
        c.serialize(async () => {
          const s = await c.session("s1");
          c.touch(s, i);
          await c.flush();
        }),
      ),
    );
    expect(maximum).toBe(1);
    expect(store.data.size).toBe(1);
    const other = new Collector(store as unknown as Plugin.Context["storage"], "/a", "w2");
    expect((await other.session("s1")).revision).toBe(0);
    await c.close();
    await other.close();
  });

  test("captures assembled context once without persisting strings", () => {
    const { sources, partial } = captureContext({
      system: [{ type: "text", text: "SECRET_SYSTEM" }],
      tools: { shell: { description: "SECRET_DESCRIPTION", input: { type: "object" } } },
      messages: [{ id: "m1", role: "user", content: [{ type: "text", text: "SECRET_USER" }] }],
    } as Parameters<typeof captureContext>[0]);
    expect(sources.map((s) => s.kind)).toEqual(["system", "definitions", "user"]);
    expect(sources.every((s) => s.tokens > 0)).toBe(true);
    expect(partial).toBe(false);
    expect(JSON.stringify(sources)).not.toContain("SECRET");
    const opaque = captureContext({
      system: [],
      tools: {},
      messages: [
        {
          role: "assistant",
          content: [{ type: "reasoning", text: "", encrypted: "SECRET_CIPHERTEXT" }],
        },
      ],
    } as Parameters<typeof captureContext>[0]);
    expect(opaque.partial).toBe(true);
    expect(JSON.stringify(opaque.sources)).not.toContain("SECRET_CIPHERTEXT");
  });

  test("attributes skill messages and unclassified skill tool results without losing user text", () => {
    const { sources } = captureContext(
      {
        system: [],
        tools: {},
        messages: [
          { id: "skill-message", role: "user", content: [{ type: "text", text: "SECRET_SKILL" }] },
          {
            id: "user-message",
            role: "user",
            content: [
              {
                type: "text",
                text: 'A request <skill_content name="Review">SECRET_BODY</skill_content> after it',
              },
            ],
          },
          {
            id: "tool-message",
            role: "tool",
            content: [{ type: "tool-result", name: "skill", result: "SECRET_RESULT" }],
          },
        ],
      } as Parameters<typeof captureContext>[0],
      new Map([["skill-message", { id: "review", name: "Review" }]]),
    );
    expect(sources.find((s) => s.id === "review")?.kind).toBe("skill");
    expect(sources.filter((s) => s.id === "skill:unclassified")).toHaveLength(2);
    expect(sources.filter((s) => s.kind === "user")).toHaveLength(2);
    expect(JSON.stringify(sources)).not.toContain("SECRET");
  });

  test("attributes attached native skills by exact wrapper text and keeps spoofed wrappers unclassified", () => {
    const wrapper = '<skill_content name="insight-check">SECRET_SKILL_BODY</skill_content>';
    const spoofed = '<skill_content name="spoofed">SECRET_SPOOFED_BODY</skill_content>';
    const { sources } = captureContext(
      {
        system: [],
        tools: {},
        messages: [
          {
            id: "u1",
            role: "user",
            content: [{ type: "text", text: `Run the check\n${wrapper}` }],
          },
          {
            id: "u2",
            role: "user",
            content: [{ type: "text", text: `Plain request\n${spoofed}` }],
          },
        ],
      } as Parameters<typeof captureContext>[0],
      new Map(),
      new Map([["u1", [{ id: "insight-check", name: "insight-check", text: wrapper }]]]),
    );
    expect(sources.find((s) => s.id === "insight-check")).toMatchObject({
      kind: "skill",
      label: "insight-check",
    });
    expect(sources.filter((s) => s.id === "skill:unclassified")).toHaveLength(1);
    expect(sources.filter((s) => s.kind === "user")).toHaveLength(2);
    expect(JSON.stringify(sources)).not.toContain("SECRET");
  });

  test("maps native request IDs, summary channels and separate provider reasoning usage", async () => {
    const store = storage();
    const c = new Collector(store as unknown as Plugin.Context["storage"], "/a");
    await captureEvent(
      c,
      event(
        "session.step.started",
        { model: { providerID: "openai", id: "gpt-5" }, started: 1000 },
        1000,
      ),
    );
    const s = await c.session("s1");
    c.context(s, [
      { kind: "system", id: "base", label: "System", tokens: 10, quality: "estimated" },
    ]);
    await captureEvent(
      c,
      event("session.reasoning.delta", { ordinal: 0, delta: "A summary" }, 1500),
    );
    await captureEvent(c, event("session.text.delta", { ordinal: 1, delta: "Hello world" }, 2500));
    await captureEvent(c, event("session.step.streamed", {}, 3000));
    await captureEvent(
      c,
      event(
        "session.step.ended",
        {
          cost: 0.2,
          tokens: { input: 10, output: 5, reasoning: 100, cache: { read: 0, write: 0 } },
        },
        9000,
      ),
    );
    const r = s.requests[0];
    expect(r.id).toBe("r1");
    expect(r.reasoningMode).toBe("summary");
    expect(r.streamedAt).toBe(3000);
    expect(r.endedAt).toBe(9000);
    expect(r.usage?.output).toBe(5);
    expect(r.usage?.reasoning).toBe(100);
    expect(r.buckets.reduce((n, b) => n + b.reasoning, 0)).toBe(0);
    expect(r.buckets.reduce((n, b) => n + b.summary, 0)).toBe(estimateTokens("A summary"));
    await c.close();
  });

  test("uses actual execution boundaries and explicit parent/background metadata for tools", async () => {
    const store = storage();
    const c = new Collector(store as unknown as Plugin.Context["storage"], "/a");
    await captureEvent(
      c,
      event("session.tool.input.started", { id: "nested", name: "shell" }, 1000),
    );
    const s = await c.session("s1");
    expect(s.tools).toHaveLength(0);
    await captureEvent(c, {
      ...event("session.tool.called", { id: "nested", input: {}, executed: false }, 3000),
      metadata: { parentCallID: "codemode-parent", background: true },
    } as NativeEvent);
    await captureEvent(
      c,
      event(
        "session.tool.success",
        { id: "nested", content: [{ type: "text", text: "SECRET_RESULT" }], executed: false },
        6000,
      ),
    );
    expect(s.tools[0]).toMatchObject({
      id: "nested",
      name: "shell",
      requestID: "r1",
      parentID: "codemode-parent",
      background: true,
      startedAt: 3000,
      endedAt: 6000,
    });
    expect(s.tools[0].resultTokens).toBeGreaterThan(0);
    await c.flush();
    expect(JSON.stringify([...store.data.values()])).not.toContain("SECRET_RESULT");
    await c.close();
  });

  test("absent usage remains unknown; interruptions stop active requests", async () => {
    const c = new Collector(storage() as unknown as Plugin.Context["storage"], "/a");
    await captureEvent(
      c,
      event(
        "session.step.started",
        { model: { providerID: "anthropic", id: "claude" }, started: 1000 },
        1000,
      ),
    );
    await captureEvent(
      c,
      event("session.step.failed", { error: { type: "unknown", message: "x" } }, 2000),
    );
    const s = await c.session("s1");
    expect(s.requests[0].usage).toBeUndefined();
    expect(s.requests[0].capture).toBe("partial");
    await captureEvent(
      c,
      event(
        "session.step.started",
        {
          assistantMessageID: "r2",
          model: { providerID: "anthropic", id: "claude" },
          started: 3000,
        },
        3000,
      ),
    );
    await captureEvent(c, event("session.execution.interrupted", { reason: "user" }, 4000));
    expect(s.requests[1]).toMatchObject({
      status: "interrupted",
      endedAt: 4000,
      capture: "partial",
    });
    await c.close();
  });

  test("serves pending context at the outgoing request boundary", async () => {
    const c = new Collector(storage() as unknown as Plugin.Context["storage"], "/a");
    const s = await c.session("s1");
    c.context(s, [{ kind: "user", id: "m1", label: "user", tokens: 2, quality: "estimated" }]);
    const r = c.start(s, "r1", "x/y", 1000);
    expect(r.context[0].tokens).toBe(2);
    await c.close();
  });
});
