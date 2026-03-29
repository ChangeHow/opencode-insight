import type { DayBreakdown, SessionBreakdown, TokenBreakdown } from "@opencode-dashboard/shared";
import { formatDateInTimeZone } from "@opencode-dashboard/shared";
import type { RawMessage } from "./types";
import { emptyBreakdown, totalTokens } from "./sqlite-reader";

export function buildDayMap(messages: RawMessage[], timeZone: string) {
  const dayMap = new Map<string, DayBreakdown>();
  const modelMap = new Map<
    string,
    {
      modelId: string;
      providerId: string;
      tokens: number;
      pricedTokens: number;
      cost: number;
      messages: number;
      breakdown: TokenBreakdown;
    }
  >();
  const sessionMap = new Map<
    string,
    {
      date: string;
      sessionId: string;
      title: string;
      slug: string;
      directory: string;
      tokens: number;
      pricedTokens: number;
      cost: number;
      messages: number;
      breakdown: TokenBreakdown;
      models: Map<string, SessionBreakdown["models"][number]>;
    }
  >();

  for (const message of messages) {
    const date = formatDateInTimeZone(message.timestampMs, timeZone);
    const day = dayMap.get(date) ?? {
      date,
      tokens: 0,
      pricedTokens: 0,
      cost: 0,
      messages: 0,
      breakdown: emptyBreakdown(),
      models: [],
      sessions: [],
    };
    const messageTokens = totalTokens(message.tokens);
    day.tokens += messageTokens;
    day.pricedTokens += message.pricedTokens;
    day.cost += message.estimatedCost;
    day.messages += 1;
    day.breakdown.input += message.tokens.input;
    day.breakdown.output += message.tokens.output;
    day.breakdown.cacheRead += message.tokens.cacheRead;
    day.breakdown.cacheWrite += message.tokens.cacheWrite;
    day.breakdown.reasoning += message.tokens.reasoning;

    const modelKey = `${date}:${message.providerId}:${message.modelId}`;
    const model = modelMap.get(modelKey) ?? {
      modelId: message.modelId,
      providerId: message.providerId,
      tokens: 0,
      pricedTokens: 0,
      cost: 0,
      messages: 0,
      breakdown: emptyBreakdown(),
    };
    model.tokens += messageTokens;
    model.pricedTokens += message.pricedTokens;
    model.cost += message.estimatedCost;
    model.messages += 1;
    model.breakdown.input += message.tokens.input;
    model.breakdown.output += message.tokens.output;
    model.breakdown.cacheRead += message.tokens.cacheRead;
    model.breakdown.cacheWrite += message.tokens.cacheWrite;
    model.breakdown.reasoning += message.tokens.reasoning;
    modelMap.set(modelKey, model);

    const sessionKey = `${date}:${message.sessionId}`;
    const sessionEntry = sessionMap.get(sessionKey) ?? {
      date,
      sessionId: message.sessionId,
      title: message.sessionTitle,
      slug: message.sessionSlug,
      directory: message.sessionDirectory,
      tokens: 0,
      pricedTokens: 0,
      cost: 0,
      messages: 0,
      breakdown: emptyBreakdown(),
      models: new Map<string, SessionBreakdown["models"][number]>(),
    };
    sessionEntry.tokens += messageTokens;
    sessionEntry.pricedTokens += message.pricedTokens;
    sessionEntry.cost += message.estimatedCost;
    sessionEntry.messages += 1;
    sessionEntry.breakdown.input += message.tokens.input;
    sessionEntry.breakdown.output += message.tokens.output;
    sessionEntry.breakdown.cacheRead += message.tokens.cacheRead;
    sessionEntry.breakdown.cacheWrite += message.tokens.cacheWrite;
    sessionEntry.breakdown.reasoning += message.tokens.reasoning;

    const sessionModelKey = `${message.providerId}:${message.modelId}`;
    const sessionModel = sessionEntry.models.get(sessionModelKey) ?? {
      modelId: message.modelId,
      providerId: message.providerId,
      tokens: 0,
      pricedTokens: 0,
      cost: 0,
      messages: 0,
      breakdown: emptyBreakdown(),
    };
    sessionModel.tokens += messageTokens;
    sessionModel.pricedTokens += message.pricedTokens;
    sessionModel.cost += message.estimatedCost;
    sessionModel.messages += 1;
    sessionModel.breakdown.input += message.tokens.input;
    sessionModel.breakdown.output += message.tokens.output;
    sessionModel.breakdown.cacheRead += message.tokens.cacheRead;
    sessionModel.breakdown.cacheWrite += message.tokens.cacheWrite;
    sessionModel.breakdown.reasoning += message.tokens.reasoning;
    sessionEntry.models.set(sessionModelKey, sessionModel);
    sessionMap.set(sessionKey, sessionEntry);
    dayMap.set(date, day);
  }

  for (const [key, model] of modelMap.entries()) {
    const [date] = key.split(":");
    const day = dayMap.get(date);
    if (day) day.models.push(model);
  }
  for (const session of sessionMap.values()) {
    const day = dayMap.get(session.date);
    if (!day) continue;
    day.sessions.push({
      sessionId: session.sessionId,
      title: session.title,
      slug: session.slug,
      directory: session.directory,
      tokens: session.tokens,
      pricedTokens: session.pricedTokens,
      cost: Number(session.cost.toFixed(4)),
      messages: session.messages,
      breakdown: session.breakdown,
      models: [...session.models.values()].toSorted(
        (a, b) => b.cost - a.cost || b.tokens - a.tokens,
      ),
    });
  }
  for (const day of dayMap.values()) {
    day.models.sort((a, b) => b.cost - a.cost || b.tokens - a.tokens);
    day.sessions.sort(
      (a, b) => b.tokens - a.tokens || b.cost - a.cost || a.sessionId.localeCompare(b.sessionId),
    );
  }
  return dayMap;
}
