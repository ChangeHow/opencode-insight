import type { Plugin } from "@opencode/plugin";
import type { SessionInsight } from "@opencode-insight/telemetry";
import type { captureContext } from "./context";

type NativeMessages = Awaited<ReturnType<Plugin.Context["session"]["context"]>>;
type Assembled = Parameters<typeof captureContext>[0];
type Skill = { id: string; name: string };
type Attachment = Skill & { text: string };
type Index = {
  ids: Set<string>;
  skills: Map<string, Skill>;
  attachments: Map<string, Attachment[]>;
};
const limit = 4096;

/** Weak ownership follows collector eviction; no message bodies survive a read. */
export class Provenance {
  private indexes = new WeakMap<SessionInsight, Index>();
  private ordinaryIDs = new WeakMap<SessionInsight, Set<string>>();

  // Reconnect discards native identity proofs. In-flight reads cannot refill them.
  clear(): void {
    this.indexes = new WeakMap();
    this.ordinaryIDs = new WeakMap();
  }

  invalidate(session: SessionInsight): void {
    this.indexes.delete(session);
  }

  /** Only immutable native IDs proven not to carry skill provenance. */
  ordinary(session: SessionInsight, id: string): void {
    let ids = this.ordinaryIDs.get(session);
    if (!ids) this.ordinaryIDs.set(session, (ids = new Set()));
    ids.add(id);
    if (ids.size > limit) ids.delete(ids.values().next().value!);
  }

  async context(
    session: SessionInsight,
    input: Assembled,
    read: () => Promise<NativeMessages>,
  ): Promise<Index> {
    const indexes = this.indexes;
    const cached = indexes.get(session);
    const ordinary = this.ordinaryIDs.get(session);
    // captureContext can only consult native provenance for messages with an ID.
    // In particular, provider-lowered tool results may have no ID at all.
    const identified = input.messages.filter((message) => message.id);
    if (!identified.length) return { ids: new Set(), skills: new Map(), attachments: new Map() };
    if (identified.every((message) => cached?.ids.has(message.id!) || ordinary?.has(message.id!)))
      return cached ?? { ids: new Set(), skills: new Map(), attachments: new Map() };

    const messages = await read();
    const index: Index = { ids: new Set(), skills: new Map(), attachments: new Map() };
    let attachedCount = 0;
    for (const message of messages) {
      index.ids.add(message.id);
      if (message.type === "skill")
        index.skills.set(message.id, { id: message.skill, name: message.name });
      if (message.type !== "user") continue;
      const attached = (message.skills ?? []).flatMap((skill) =>
        typeof skill.text === "string"
          ? [{ id: skill.id, name: skill.name, text: skill.text }]
          : [],
      );
      attachedCount += attached.length;
      if (attached.length) index.attachments.set(message.id, attached);
    }
    // Attached bodies stay transient and keep the original exact-text comparison.
    // These captures intentionally re-read native provenance rather than retain text
    // or make authority depend on a potentially colliding fingerprint.
    if (index.ids.size <= limit && attachedCount === 0) indexes.set(session, index);
    else indexes.delete(session);
    return index;
  }
}
