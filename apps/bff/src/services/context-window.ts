import type { FirstPromptContextStat, MessageDetail } from "@opencode-dashboard/shared";

export type FirstPromptContext = FirstPromptContextStat;

// The agent's initialization context for the first user prompt: everything the
// model saw on that request (fresh input + cache read + cache write). This is
// system prompt, tool definitions, injected files (AGENTS.md, skills), and the
// user prompt itself.
export function contextRequestTokens(tokens: MessageDetail["tokens"]) {
  return tokens.input + tokens.cacheRead + tokens.cacheWrite;
}

export function findFirstPromptContext(
  allMessages: MessageDetail[],
  reportedContextWindow?: number,
  reportedFirstRequestTokens?: number,
  reportedSegments?: FirstPromptContext["segments"],
): FirstPromptContext | null {
  const rawUserPromptTokens = (() => {
    const firstUser = allMessages.find((message) => message.role === "user");
    if (!firstUser) return 0;
    const chars = firstUser.parts
      .filter(
        (part): part is Extract<MessageDetail["parts"][number], { type: "text" }> =>
          part.type === "text",
      )
      .reduce((sum, part) => sum + part.text.length, 0);
    return Math.max(1, Math.round(chars / 4));
  })();
  // The first model call at/after the first user turn carries the initialized
  // context. Prefer the first assistant reply; fall back to the user turn when
  // a session has no assistant reply.
  const firstUserIndex = allMessages.findIndex((message) => message.role === "user");
  if (firstUserIndex === -1) return null;

  const firstCall =
    allMessages
      .slice(firstUserIndex)
      .find((message) => message.role === "assistant" && message.modelId) ??
    allMessages[firstUserIndex];
  if (!firstCall?.modelId) return null;

  // Context window resolution: only trust what the runtime itself reported
  // for this session (codex token_count telemetry). Public catalogs describe
  // API limits, not the subscription caps actually in effect — showing a
  // wrong percentage is worse than showing none, so opencode sessions
  // (no runtime telemetry) get composition-only stats without a window.
  const promptTokens = reportedFirstRequestTokens ?? contextRequestTokens(firstCall.tokens);
  // Composition: use runtime-reported segments when available (codex).
  // Otherwise (opencode) split into what the transcript shows (the user
  // prompt) versus everything the runtime injects without persisting
  // (system prompt, AGENTS.md, skills, tool schemas).
  let segments = reportedSegments;
  if (!segments && rawUserPromptTokens > 0) {
    const runtime = promptTokens - rawUserPromptTokens;
    segments = [
      {
        kind: "user",
        label: "Your prompt",
        tokens: Math.min(rawUserPromptTokens, promptTokens),
      },
      ...(runtime > 200
        ? [
            {
              kind: "tools" as const,
              label: "Runtime system context (system prompt, AGENTS.md, skills — not persisted)",
              tokens: runtime,
            },
          ]
        : []),
    ];
  }
  return {
    messageIndex: allMessages.indexOf(firstCall),
    modelId: firstCall.modelId,
    providerId: firstCall.providerId,
    contextWindow: reportedContextWindow ?? 0,
    promptTokens,
    ratio: reportedContextWindow ? promptTokens / reportedContextWindow : 0,
    source: "reported",
    segments,
  };
}
