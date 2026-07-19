import type {
  MessageDetail,
  MessageDistributionPayload,
  MessageListPayload,
  MessageOverviewPayload,
  TimelinePoint,
  TokenBreakdown,
  ToolUsageStat,
} from "@opencode-dashboard/shared";
import { roundCost } from "./cost";

export interface MessagePayloads {
  overview: MessageOverviewPayload;
  distribution: MessageDistributionPayload;
  listFn: (page: number, pageSize: number) => MessageListPayload;
}

function totalTokenCount(tokens: TokenBreakdown): number {
  return tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite + tokens.reasoning;
}

export function buildMessagePayloadsFromMessages(allMessages: MessageDetail[]): MessagePayloads {
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
  const overview: MessageOverviewPayload = { timeline, toolUsage, totalMessages: total };
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
