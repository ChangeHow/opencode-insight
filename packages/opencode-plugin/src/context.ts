import type { Plugin } from "@opencode/plugin";
import { estimateTokens, type ContextSource } from "@opencode-insight/telemetry";

type Context = Parameters<Parameters<Plugin.Context["session"]["hook"]>[1]>[0];
type AssembledContext = Extract<Context, { tools: unknown }>;

/** Only source identities and numeric estimates survive this function. */
export function captureContext(
  input: Pick<AssembledContext, "system" | "messages" | "tools">,
  skills: ReadonlyMap<string, { id: string; name: string }> = new Map(),
  attachments: ReadonlyMap<
    string,
    readonly { id: string; name: string; text: string }[]
  > = new Map(),
): {
  sources: ContextSource[];
  partial: boolean;
} {
  let partial = input.system.length > 2048;
  const sources: ContextSource[] = input.system.slice(0, 2049).map((part, i) => ({
    kind: "system",
    id: `system:${i}`,
    label: "System",
    tokens: estimateTokens(part.text),
    quality: "estimated",
  }));
  for (const [id, definition] of Object.entries(input.tools)) {
    if (sources.length >= 2049) return { sources, partial: true };
    sources.push({
      kind: "definitions",
      id,
      label: id,
      tokens: estimateTokens(JSON.stringify(definition)),
      quality: "estimated",
    });
  }
  for (const [i, message] of input.messages.entries()) {
    const kind = message.role === "system" ? "injected" : message.role;
    for (const [ordinal, part] of message.content.entries()) {
      if (sources.length >= 2049) return { sources, partial: true };
      if (
        part.type === "media" ||
        (part.type === "compaction" && part.encrypted !== undefined) ||
        (part.type === "reasoning" && part.encrypted !== undefined)
      )
        partial = true;
      let text: string | undefined;
      if (part.type === "text" || part.type === "reasoning") text = part.text;
      if (part.type === "tool-call") text = JSON.stringify(part.input);
      if (part.type === "tool-result") text = JSON.stringify(part.result);
      if (part.type === "compaction") text = part.text ?? undefined;
      if (text === undefined) continue;
      const skill = message.id ? skills.get(message.id) : undefined;
      const attached = message.id ? attachments.get(message.id) : undefined;
      const skillResult = part.type === "tool-result" && part.name === "skill";
      if (skill || skillResult) {
        sources.push({
          kind: "skill",
          id: skill?.id ?? "skill:unclassified",
          label: skill?.name ?? "Unclassified Skill",
          tokens: estimateTokens(text),
          quality: "estimated",
        });
        continue;
      }
      // The native skill wrapper remains recognizable after prompt attachments are lowered.
      // The wrapper text is only matched transiently; ids and names come solely from
      // authoritative native attachments, never from the prompt string itself.
      const wrapped = /<skill_content\b[^>]*>[\s\S]*?<\/skill_content>/g;
      let end = 0;
      for (const match of text.matchAll(wrapped)) {
        if (sources.length >= 2048) return { sources, partial: true };
        if (match.index > end)
          sources.push({
            kind,
            id: `${message.id ?? `message:${i}`}:${ordinal}:${end}`,
            label: kind,
            tokens: estimateTokens(text.slice(end, match.index)),
            quality: "estimated",
          });
        const named = attached?.find((definition) => definition.text === match[0]);
        sources.push({
          kind: "skill",
          id: named?.id ?? "skill:unclassified",
          label: named?.name ?? "Unclassified Skill",
          tokens: estimateTokens(match[0]),
          quality: "estimated",
        });
        end = match.index + match[0].length;
      }
      if (end < text.length)
        sources.push({
          kind,
          id:
            part.type === "tool-result"
              ? `tool:${part.name}`
              : `${message.id ?? `message:${i}`}:${ordinal}`,
          label: part.type === "tool-result" ? part.name : kind,
          tokens: estimateTokens(text.slice(end)),
          quality: "estimated",
        });
    }
  }
  return { sources, partial };
}
