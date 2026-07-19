import type {
  DayBreakdown,
  SessionBreakdown,
  SessionDetailBreakdown,
} from "@opencode-dashboard/shared";
import { roundCost } from "./cost";
import { querySqliteRows } from "./sqlite";

interface SessionTreeRow {
  id: string;
  parent_id: string | null;
  time_created: number;
  depth: number;
}

interface MessageRow {
  id: string;
  session_id: string;
  time_created: number;
  time_updated: number;
  data: string;
}

interface ParsedMessage {
  role?: string;
  time?: { created?: number; completed?: number };
  error?: unknown;
}

export function mergeSessionBreakdowns(days: Iterable<DayBreakdown>, sessionId: string) {
  let merged: SessionBreakdown | undefined;
  const models = new Map<string, SessionBreakdown["models"][number]>();

  for (const day of days) {
    const session = day.sessions.find((item) => item.sessionId === sessionId);
    if (!session) continue;
    if (!merged) {
      merged = { ...session, breakdown: { ...session.breakdown }, models: [] };
    } else {
      merged.tokens += session.tokens;
      merged.pricedTokens += session.pricedTokens;
      merged.cost += session.cost;
      merged.messages += session.messages;
      for (const key of Object.keys(merged.breakdown) as (keyof typeof merged.breakdown)[]) {
        merged.breakdown[key] += session.breakdown[key];
      }
    }
    for (const model of session.models) {
      const key = `${model.providerId}:${model.modelId}`;
      const entry = models.get(key) ?? { ...model, breakdown: { ...model.breakdown } };
      if (models.has(key)) {
        entry.tokens += model.tokens;
        entry.pricedTokens += model.pricedTokens;
        entry.cost += model.cost;
        entry.messages += model.messages;
        for (const part of Object.keys(entry.breakdown) as (keyof typeof entry.breakdown)[]) {
          entry.breakdown[part] += model.breakdown[part];
        }
      }
      models.set(key, entry);
    }
  }

  if (!merged) return undefined;
  merged.cost = roundCost(merged.cost);
  merged.models = [...models.values()].toSorted((a, b) => b.cost - a.cost || b.tokens - a.tokens);
  return merged;
}

interface SessionInputRow {
  id: string;
  session_id: string;
  delivery: "steer" | "queue";
}

const SESSION_TREE_QUERY = `
  WITH RECURSIVE session_tree(id, parent_id, time_created, depth) AS (
    SELECT id, parent_id, time_created, 0
    FROM session
    WHERE id = ?

    UNION ALL

    SELECT s.id, s.parent_id, s.time_created, session_tree.depth + 1
    FROM session s
    JOIN session_tree ON s.parent_id = session_tree.id
  )
  SELECT id, parent_id, time_created, depth
  FROM session_tree
  ORDER BY depth ASC, time_created ASC, id ASC
`;

function parseMessage(row: MessageRow) {
  let data: ParsedMessage;
  try {
    data = JSON.parse(row.data) as ParsedMessage;
  } catch {
    return null;
  }

  const role = data.role === "user" ? "user" : data.role === "assistant" ? "assistant" : null;
  if (!role) {
    return null;
  }

  const createdAt = Math.trunc(data.time?.created ?? row.time_created ?? 0);
  const completedAt = Math.trunc(data.time?.completed ?? row.time_updated ?? createdAt);

  return {
    id: row.id,
    sessionId: row.session_id,
    role,
    createdAt,
    completedAt,
    hasError: data.error !== undefined && data.error !== null,
  };
}

function buildMessageQuery(sessionCount: number) {
  const placeholders = Array.from({ length: sessionCount }, () => "?").join(", ");
  return `
    SELECT id, session_id, time_created, time_updated, data
    FROM message
    WHERE session_id IN (${placeholders})
    ORDER BY time_created ASC, id ASC
  `;
}

function activeDuration(intervals: Array<{ start: number; end: number }>) {
  const ordered = intervals.toSorted((a, b) => a.start - b.start || a.end - b.end);
  let total = 0;
  let currentStart = 0;
  let currentEnd = 0;

  for (const interval of ordered) {
    if (interval.end <= interval.start) continue;
    if (currentEnd === 0 || interval.start > currentEnd) {
      total += currentEnd - currentStart;
      currentStart = interval.start;
      currentEnd = interval.end;
    } else {
      currentEnd = Math.max(currentEnd, interval.end);
    }
  }

  return total + currentEnd - currentStart;
}

export function calculateLongestTaskDuration(
  sessions: SessionTreeRow[],
  rows: MessageRow[],
  rootSessionId: string,
  deliveryByMessage = new Map<string, "steer" | "queue">(),
) {
  const childSessionIds = new Set(
    sessions.filter((session) => session.id !== rootSessionId).map((session) => session.id),
  );
  const seenChildUserSessionIds = new Set<string>();
  const messages = rows
    .map(parseMessage)
    .filter((message): message is NonNullable<ReturnType<typeof parseMessage>> => message !== null)
    .toSorted((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));

  let currentTaskIntervals: Array<{ start: number; end: number }> = [];
  let hasCurrentTask = false;
  let longestTaskDurationMs = 0;
  let previousAssistantHadError = false;

  for (const message of messages) {
    if (message.role === "user") {
      const delivery = deliveryByMessage.get(`${message.sessionId}:${message.id}`);
      if (
        hasCurrentTask &&
        (delivery === "steer" ||
          (childSessionIds.has(message.sessionId) &&
            !seenChildUserSessionIds.has(message.sessionId)) ||
          (delivery === undefined && previousAssistantHadError))
      ) {
        seenChildUserSessionIds.add(message.sessionId);
        previousAssistantHadError = false;
        continue;
      }

      longestTaskDurationMs = Math.max(longestTaskDurationMs, activeDuration(currentTaskIntervals));
      currentTaskIntervals = [];
      hasCurrentTask = true;
      previousAssistantHadError = false;
      continue;
    }

    if (!hasCurrentTask) {
      continue;
    }

    currentTaskIntervals.push({ start: message.createdAt, end: message.completedAt });
    previousAssistantHadError = message.hasError;
  }

  return Math.max(longestTaskDurationMs, activeDuration(currentTaskIntervals));
}

async function readSessionInputDeliveries(dbPath: string, sessionIds: string[]) {
  try {
    const placeholders = sessionIds.map(() => "?").join(", ");
    const rows = await querySqliteRows<SessionInputRow>(
      dbPath,
      `SELECT id, session_id, delivery
       FROM session_input
       WHERE session_id IN (${placeholders})
         AND promoted_seq IS NOT NULL
         AND delivery IN ('steer', 'queue')`,
      sessionIds,
      "Failed to query session input deliveries",
    );
    return new Map(rows.map((row) => [`${row.session_id}:${row.id}`, row.delivery]));
  } catch {
    return new Map<string, "steer" | "queue">();
  }
}

export async function buildSessionDetailBreakdown(
  dbPath: string,
  session: Omit<SessionDetailBreakdown, "longestTaskDurationMs">,
) {
  if (session.runtime !== "opencode") {
    return { ...session, longestTaskDurationMs: 0 } satisfies SessionDetailBreakdown;
  }

  const sessions = await querySqliteRows<SessionTreeRow>(
    dbPath,
    SESSION_TREE_QUERY,
    [session.sessionId],
    "Failed to query session tree",
  );
  if (sessions.length === 0) {
    return { ...session, longestTaskDurationMs: 0 } satisfies SessionDetailBreakdown;
  }

  const rows = await querySqliteRows<MessageRow>(
    dbPath,
    buildMessageQuery(sessions.length),
    sessions.map((item) => item.id),
    "Failed to query session task messages",
  );
  const deliveryByMessage = await readSessionInputDeliveries(
    dbPath,
    sessions.map((item) => item.id),
  );

  return {
    ...session,
    longestTaskDurationMs: calculateLongestTaskDuration(
      sessions,
      rows,
      session.sessionId,
      deliveryByMessage,
    ),
  } satisfies SessionDetailBreakdown;
}
