import type {
  ContextSegmentStat,
  MessageDetail,
  MessageDistributionPayload,
  MessageListPayload,
  MessageOverviewPayload,
  TimelinePoint,
  TokenBreakdown,
  ToolUsageStat,
} from "@opencode-dashboard/shared";
import { findFirstPromptContext } from "./context-window";
import { roundCost } from "./cost";

export interface MessagePayloads {
  overview: MessageOverviewPayload;
  distribution: MessageDistributionPayload;
  listFn: (page: number, pageSize: number) => MessageListPayload;
}

function totalTokenCount(tokens: TokenBreakdown): number {
  return tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite + tokens.reasoning;
}

export interface MessagePayloadContext {
  /** Authoritative context window reported by the runtime itself (codex
   * token_count events). Overrides catalog lookups when present. */
  reportedContextWindow?: number;
  /** Request tokens of the session's first API call, as reported by the
   * runtime. Overrides message-token aggregation, which reflects end-of-turn
   * cumulative context instead of the initialization request. */
  reportedFirstRequestTokens?: number;
  /** Composition of the initial context when the runtime exposes it
   * (kind/label/tokens per source, already scaled to match the total). */
  reportedSegments?: ContextSegmentStat[];
}

export function buildMessagePayloadsFromMessages(
  allMessages: MessageDetail[],
  payloadContext: MessagePayloadContext = {},
): MessagePayloads {
  const total = allMessages.length;
  const timeline: TimelinePoint[] = [];
  const toolCountMap = new Map<string, { count: number; totalTokens: number }>();
  let cumulativeTokens = 0;
  let intermediateCumulativeCost = 0;

  for (let i = 0; i < allMessages.length; i++) {
    const message = allMessages[i];
    const messageTokens = totalTokenCount(message.tokens);
    cumulativeTokens += messageTokens;
    intermediateCumulativeCost += message.cost;
    const cumulativeCost = roundCost(intermediateCumulativeCost);

    timeline.push({
      messageIndex: i,
      role: message.role,
      createdAt: message.createdAt,
      tokens: message.tokens,
      cost: roundCost(message.cost),
      cumulativeTokens,
      cumulativeCost,
    });

    for (const part of message.parts) {
      if (part.type !== "tool") continue;
      const entry = toolCountMap.get(part.toolName) ?? { count: 0, totalTokens: 0 };
      entry.count += 1;
      entry.totalTokens += messageTokens;
      toolCountMap.set(part.toolName, entry);
    }
  }

  const toolUsage: ToolUsageStat[] = [...toolCountMap.entries()]
    .map(([tool, stats]) => ({ tool, count: stats.count, totalTokens: stats.totalTokens }))
    .toSorted((a, b) => b.count - a.count || b.totalTokens - a.totalTokens);
  const overview: MessageOverviewPayload = {
    timeline,
    toolUsage,
    totalMessages: total,
    firstPromptContext: findFirstPromptContext(
      allMessages,
      payloadContext.reportedContextWindow,
      payloadContext.reportedFirstRequestTokens,
      payloadContext.reportedSegments,
    ),
  };
  const distribution: MessageDistributionPayload = {
    points: allMessages.map((message, i) => ({
      messageIndex: i,
      messageId: message.id,
      role: message.role,
      modelId: message.modelId,
      providerId: message.providerId,
      tokens: message.tokens,
    })),
    totalMessages: total,
  };
  const listFn = (page: number, pageSize: number): MessageListPayload => {
    const start = page * pageSize;
    return { messages: allMessages.slice(start, start + pageSize), total, page, pageSize };
  };

  return { overview, distribution, listFn };
}
