import type { SessionDetailBreakdown } from "@opencode-dashboard/shared";
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

export function calculateLongestTaskDuration(
  sessions: SessionTreeRow[],
  rows: MessageRow[],
  rootSessionId: string,
) {
  const childSessionIds = new Set(
    sessions.filter((session) => session.id !== rootSessionId).map((session) => session.id),
  );
  const seenChildUserSessionIds = new Set<string>();
  const messages = rows
    .map(parseMessage)
    .filter((message): message is NonNullable<ReturnType<typeof parseMessage>> => message !== null)
    .toSorted((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));

  let currentTaskDurationMs = 0;
  let hasCurrentTask = false;
  let longestTaskDurationMs = 0;
  let previousAssistantHadError = false;

  for (const message of messages) {
    if (message.role === "user") {
      if (
        hasCurrentTask &&
        ((childSessionIds.has(message.sessionId) &&
          !seenChildUserSessionIds.has(message.sessionId)) ||
          previousAssistantHadError)
      ) {
        seenChildUserSessionIds.add(message.sessionId);
        previousAssistantHadError = false;
        continue;
      }

      longestTaskDurationMs = Math.max(longestTaskDurationMs, currentTaskDurationMs);
      currentTaskDurationMs = 0;
      hasCurrentTask = true;
      previousAssistantHadError = false;
      continue;
    }

    if (!hasCurrentTask) {
      continue;
    }

    currentTaskDurationMs += Math.max(0, message.completedAt - message.createdAt);
    previousAssistantHadError = message.hasError;
  }

  return Math.max(longestTaskDurationMs, currentTaskDurationMs);
}

export async function buildSessionDetailBreakdown(
  dbPath: string,
  session: Omit<SessionDetailBreakdown, "longestTaskDurationMs">,
) {
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

  return {
    ...session,
    longestTaskDurationMs: calculateLongestTaskDuration(sessions, rows, session.sessionId),
  } satisfies SessionDetailBreakdown;
}
