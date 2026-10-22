import { describe, expect, test, vi } from "vitest";
import type { Plugin } from "@opencode/plugin";
import type { SessionInsight } from "@opencode-insight/telemetry";
import { captureContext } from "./context";
import { Provenance } from "./provenance";

type NativeMessages = Awaited<ReturnType<Plugin.Context["session"]["context"]>>;
type Input = Parameters<typeof captureContext>[0];
const wrapper = '<skill_content name="check">SECRET_SKILL_BODY</skill_content>';
const user = (id: string, text = "Run check", skills = false) => ({
  type: "user",
  id,
  text,
  skills: skills ? [{ id: "check", name: "Check", text: wrapper }] : [],
  time: { created: 1 },
});
const assembled = (id: string | undefined, text: string, role = "user") => ({
  id,
  role,
  content: [{ type: "text", text }],
});
function harness(initial: unknown[]) {
  const provenance = new Provenance();
  let native = initial;
  const read = vi.fn(async () => native as NativeMessages);
  const session = { sessionID: "s1" } as SessionInsight;
  const context = async (messages: unknown[], owner = session) => {
    const input = { system: [], tools: {}, messages } as Input;
    const { skills, attachments } = await provenance.context(owner, input, read);
    const result = captureContext(input, skills, attachments);
    // Compare the entire source sequence, including ids, token counts and partial,
    // against the original transient native-message extraction on every capture.
    const raw = native as NativeMessages;
    expect(result).toEqual(
      captureContext(
        input,
        new Map(
          raw
            .filter((message) => message.type === "skill")
            .map((message) => [message.id, { id: message.skill, name: message.name }]),
        ),
        new Map(
          raw.flatMap((message) => {
            if (message.type !== "user") return [];
            const attached = (message.skills ?? []).flatMap((skill) =>
              typeof skill.text === "string"
                ? [{ id: skill.id, name: skill.name, text: skill.text }]
                : [],
            );
            return attached.length ? ([[message.id, attached]] as const) : [];
          }),
        ),
      ),
    );
    return result;
  };
  return {
    provenance,
    read,
    session,
    context,
    setNative(messages: unknown[]) {
      native = messages;
    },
  };
}

describe("native context provenance cache", () => {
  test("reuses same-prompt provenance across tool continuations with proven assistant ids", async () => {
    const h = harness([user("u1")]);
    const prompt = assembled("u1", "Run check");
    await h.context([prompt]);
    h.provenance.ordinary(h.session, "a1");
    await h.context([
      prompt,
      { id: "a1", role: "assistant", content: [{ type: "tool-call", name: "shell", input: {} }] },
      { role: "tool", content: [{ type: "tool-result", name: "shell", result: "ok" }] },
    ]);
    h.provenance.ordinary(h.session, "a2");
    await h.context([prompt, assembled("a2", "Done", "assistant")]);
    expect(h.read).toHaveBeenCalledTimes(1);
  });

  test("uses only native-admitted ordinary identities across prompts, never assembled roles", async () => {
    const h = harness([user("u1")]);
    h.provenance.ordinary(h.session, "u1");
    const first = assembled("u1", "Run check");
    await h.context([first]);
    h.setNative([user("u1"), user("u2")]);
    h.provenance.ordinary(h.session, "u2");
    await h.context([first, assembled("u2", wrapper)]);
    expect(h.read).not.toHaveBeenCalled();
    h.setNative([user("u1"), user("u2"), user("attached", "Next", true)]);
    const captured = await h.context([first, assembled("attached", wrapper)]);
    expect(h.read).toHaveBeenCalledTimes(1);
    expect(captured.sources.at(-1)).toMatchObject({ kind: "skill", id: "check" });
    await h.context([first, assembled("unobserved-user", wrapper)]);
    expect(h.read).toHaveBeenCalledTimes(2);
  });

  test("refreshes for unknown ids even without events, regardless of the assembled role", async () => {
    const h = harness([user("u1")]);
    const prompt = assembled("u1", "Run check");
    await h.context([prompt]);
    h.setNative([
      user("u1"),
      { type: "skill", id: "skill-message", skill: "native-check", name: "Native Check" },
    ]);
    const skill = assembled("skill-message", "SECRET_NATIVE_BODY", "assistant");
    const captured = await h.context([prompt, skill]);
    expect(h.read).toHaveBeenCalledTimes(2);
    expect(captured.sources.at(-1)).toMatchObject({
      kind: "skill",
      id: "native-check",
      label: "Native Check",
    });
    await h.context([prompt, skill]);
    expect(h.read).toHaveBeenCalledTimes(2);
    // Unknown assistant ids are never inferred from their role alone.
    await h.context([prompt, skill, assembled("unobserved-assistant", "Done", "assistant")]);
    await h.context([prompt, skill, assembled("unobserved-assistant", "Done", "assistant")]);
    expect(h.read).toHaveBeenCalledTimes(4);
  });

  test("new attached-skill prompts refresh without waiting for admission events", async () => {
    const h = harness([user("u1")]);
    await h.context([assembled("u1", "Run check")]);
    h.setNative([user("u1"), user("u2", "Next", true)]);
    const result = await h.context([assembled("u2", `Next\n${wrapper}`)]);
    expect(h.read).toHaveBeenCalledTimes(2);
    expect(result.sources.at(-1)).toMatchObject({ kind: "skill", id: "check", label: "Check" });
    await h.context([assembled("u2", `Next\n${wrapper}`)]);
    expect(h.read).toHaveBeenCalledTimes(3);
  });

  test("matches exact attached wrappers after edits, never spoofed names or other owners", async () => {
    const h = harness([user("u1", "Run check", true), user("u2")]);
    await h.context([assembled("u1", wrapper)]);
    const changed = wrapper.replace("SECRET_SKILL_BODY", "SPOOFED_SKILL_BODY");
    const result = await h.context([
      assembled("u1", changed),
      assembled("u2", wrapper),
      assembled("u1", wrapper),
    ]);
    expect(result.sources.map(({ id }) => id)).toEqual([
      "skill:unclassified",
      "skill:unclassified",
      "check",
    ]);
    expect(h.read).toHaveBeenCalledTimes(2);
  });

  test("keeps exact attached-text equality for non-ASCII and lone UTF-16 surrogates", async () => {
    const first = `<skill_content>中文😀\ud800</skill_content>`;
    const second = first.replace("\ud800", "\ud801");
    const native = user("u1");
    native.skills = [{ id: "check", name: "Check", text: first }];
    const h = harness([native]);
    const result = await h.context([assembled("u1", first), assembled("u1", second)]);
    expect(result.sources.map(({ id }) => id)).toEqual(["check", "skill:unclassified"]);
  });

  test("invalidates native proofs and cannot reuse a reloaded session identity", async () => {
    const h = harness([user("u1")]);
    const prompt = assembled("u1", "Run check");
    await h.context([prompt]);
    h.provenance.clear();
    await h.context([prompt]);
    h.provenance.invalidate(h.session);
    await h.context([prompt]);
    await h.context([prompt], { sessionID: "s1" } as SessionInsight);
    expect(h.read).toHaveBeenCalledTimes(4);
  });

  test("reconnect invalidation during a context read cannot refill the new cache", async () => {
    const h = harness([user("u1")]);
    let resolve!: (messages: NativeMessages) => void;
    h.read.mockImplementationOnce(
      () =>
        new Promise<NativeMessages>((done) => {
          resolve = done;
        }),
    );
    const pending = h.context([assembled("u1", "Run check")]);
    h.provenance.clear();
    resolve([user("u1")] as NativeMessages);
    await pending;
    await h.context([assembled("u1", "Run check")]);
    expect(h.read).toHaveBeenCalledTimes(2);
  });

  test("does not read unused provenance for identifierless messages and falls back on overflow", async () => {
    const h = harness([user("u1", "Run check", true)]);
    await h.context([assembled(undefined, wrapper)]);
    await h.context([assembled(undefined, wrapper)]);
    expect(h.read).not.toHaveBeenCalled();
    h.setNative([
      ...Array.from({ length: 4097 }, (_, index) => user(`u${index}`)),
      user("attached", "Run check", true),
    ]);
    await h.context([assembled("attached", wrapper)]);
    await h.context([assembled("attached", wrapper)]);
    expect(h.read).toHaveBeenCalledTimes(2);
  });
});
