import type { Plugin } from "@opencode/plugin";
import type { SessionInsight } from "@opencode-insight/telemetry/schema";
import { toolMetadata } from "./events";

type Messages = Awaited<ReturnType<Plugin.Context["session"]["context"]>>;

/** Recover persisted usage and timing, never token-arrival buckets or missing context. */
export function seedHistory(session: SessionInsight, messages: Messages): boolean {
  if (session.requests.length) return false;
  const assistants = messages.filter((message) => message.type === "assistant").slice(-512);
  for (const message of assistants) {
    const completed = message.time.completed !== undefined;
    session.requests.push({
      id: message.id,
      model: `${message.model.providerID}/${message.model.id}`,
      startedAt: message.time.created,
      streamedAt: message.time.streamed,
      endedAt: message.time.completed ?? message.time.streamed ?? message.time.created,
      status: completed ? (message.error ? "error" : "completed") : "interrupted",
      reasoningMode: message.tokens?.reasoning ? "hidden" : "unknown",
      usage: message.tokens
        ? {
            input: message.tokens.input,
            output: message.tokens.output,
            reasoning: message.tokens.reasoning,
            cacheRead: message.tokens.cache.read,
            cacheWrite: message.tokens.cache.write,
          }
        : undefined,
      cost: message.cost,
      buckets: [],
      context: [],
      capture: "partial",
    });
    for (const part of message.content) {
      if (part.type !== "tool" || session.tools.some((tool) => tool.id === part.id)) continue;
      const input = part.state.input;
      session.tools.push({
        id: part.id,
        name: part.name,
        requestID: message.id,
        startedAt: part.time.ran ?? part.time.created,
        endedAt: part.time.completed ?? part.time.ran ?? part.time.created,
        status:
          part.state.status === "completed" || part.state.status === "error"
            ? part.state.status
            : "interrupted",
        background:
          typeof input === "object" &&
          input !== null &&
          "background" in input &&
          input.background === true,
      });
      toolMetadata(
        session.tools.at(-1)!,
        "metadata" in part.state ? part.state.metadata : undefined,
      );
    }
  }
  if (session.tools.length > 2048) session.tools.splice(0, session.tools.length - 2048);
  if (assistants.length) session.interruptedCapture = true;
  return assistants.length > 0;
}
