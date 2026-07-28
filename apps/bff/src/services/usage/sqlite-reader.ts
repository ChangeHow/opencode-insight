import fs from "node:fs";
import type { TokenBreakdown } from "@opencode-dashboard/shared";
import { formatDateInTimeZone, DEFAULT_TIME_ZONE } from "@opencode-dashboard/shared";
import { logger } from "../../logger";
import { roundCost } from "../cost";
import { querySqliteRows } from "../sqlite";
import type { RawMessage } from "./types";

const SQLITE_USAGE_QUERY_PREFIX = `
  WITH RECURSIVE session_owner(id, root_id, root_title, root_slug, root_directory) AS (
    SELECT id, id, title, slug, directory
    FROM session
    WHERE parent_id IS NULL

    UNION ALL

    SELECT child.id, owner.root_id, owner.root_title, owner.root_slug, owner.root_directory
    FROM session child
    JOIN session_owner owner ON child.parent_id = owner.id
  )
  SELECT
    m.id,
    m.time_created,
    json_extract(m.data, '$.modelID') AS model_id,
    json_extract(m.data, '$.providerID') AS provider_id,
    json_extract(m.data, '$.cost') AS cost,
    json_extract(m.data, '$.tokens.input') AS input_tokens,
    json_extract(m.data, '$.tokens.output') AS output_tokens,
    json_extract(m.data, '$.tokens.reasoning') AS reasoning_tokens,
    json_extract(m.data, '$.tokens.cache.read') AS cache_read_tokens,
    json_extract(m.data, '$.tokens.cache.write') AS cache_write_tokens,
    COALESCE(owner.root_id, s.id) AS session_id,
    COALESCE(owner.root_title, s.title) AS session_title,
    COALESCE(owner.root_slug, s.slug) AS session_slug,
    COALESCE(owner.root_directory, s.directory) AS session_directory
`;

const SQLITE_USAGE_QUERY = `${SQLITE_USAGE_QUERY_PREFIX}
  FROM message m
  JOIN session s ON s.id = m.session_id
  LEFT JOIN session_owner owner ON owner.id = s.id
  WHERE json_extract(m.data, '$.role') = 'assistant'
    AND json_extract(m.data, '$.modelID') IS NOT NULL
`;

const SQLITE_USAGE_RECENT_QUERY = `${SQLITE_USAGE_QUERY_PREFIX}
  FROM session s
  CROSS JOIN message m
  LEFT JOIN session_owner owner ON owner.id = s.id
  WHERE m.session_id = s.id
    AND json_extract(m.data, '$.role') = 'assistant'
    AND json_extract(m.data, '$.modelID') IS NOT NULL
    AND m.time_created >= ?
`;

const SQLITE_USAGE_WINDOW_QUERY = `${SQLITE_USAGE_RECENT_QUERY}
    AND m.time_created < ?
`;

interface SqliteUsageRow {
  id: string;
  time_created: number;
  model_id: string;
  provider_id: string | null;
  cost: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  reasoning_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  session_id: string;
  session_title: string;
  session_slug: string | null;
  session_directory: string;
}

function toFiniteNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export function emptyBreakdown(): TokenBreakdown {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    reasoning: 0,
  };
}

export function normalizeTokenBreakdown(tokens: {
  input?: number;
  output?: number;
  reasoning?: number | null;
  cache?: { read?: number; write?: number };
}): TokenBreakdown {
  return {
    input: Math.max(0, Math.trunc(tokens.input ?? 0)),
    output: Math.max(0, Math.trunc(tokens.output ?? 0)),
    cacheRead: Math.max(0, Math.trunc(tokens.cache?.read ?? 0)),
    cacheWrite: Math.max(0, Math.trunc(tokens.cache?.write ?? 0)),
    reasoning: Math.max(0, Math.trunc(tokens.reasoning ?? 0)),
  };
}

export function totalTokens(tokens: TokenBreakdown) {
  return tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite + tokens.reasoning;
}

export function parseAssistantMessage(
  input: unknown,
  fallbackId: string,
  session: { id: string; title: string; slug: string; directory: string },
): RawMessage | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const message = input as {
    id?: string;
    role?: string;
    modelID?: string;
    providerID?: string;
    cost?: number;
    tokens?: {
      input?: number;
      output?: number;
      reasoning?: number | null;
      cache?: { read?: number; write?: number };
    };
    time?: { created?: number };
  };

  if (
    message.role !== "assistant" ||
    !message.tokens ||
    !message.modelID ||
    !message.time?.created
  ) {
    return null;
  }

  const tokens = normalizeTokenBreakdown(message.tokens);
  const timestampMs = Math.trunc(message.time.created);

  return {
    id: message.id ?? fallbackId,
    sessionId: session.id,
    runtime: "opencode",
    sessionTitle: session.title,
    sessionSlug: session.slug,
    sessionDirectory: session.directory,
    date: formatDateInTimeZone(timestampMs, DEFAULT_TIME_ZONE),
    timestampMs,
    modelId: message.modelID,
    providerId: message.providerID ?? "unknown",
    cost: roundCost(Math.max(0, Number(message.cost ?? 0))),
    estimatedCost: 0,
    pricedTokens: 0,
    tokens,
  };
}

function parseUsageRows(rows: SqliteUsageRow[]) {
  return rows
    .map((row): RawMessage | null => {
      const timestampMs = Math.trunc(toFiniteNumber(row.time_created));
      if (!timestampMs || !row.model_id) {
        return null;
      }

      return {
        id: row.id,
        sessionId: row.session_id,
        runtime: "opencode",
        sessionTitle: row.session_title,
        sessionSlug: row.session_slug ?? "",
        sessionDirectory: row.session_directory,
        date: formatDateInTimeZone(timestampMs, DEFAULT_TIME_ZONE),
        timestampMs,
        modelId: row.model_id,
        providerId: row.provider_id ?? "unknown",
        cost: roundCost(Math.max(0, toFiniteNumber(row.cost))),
        estimatedCost: 0,
        pricedTokens: 0,
        tokens: normalizeTokenBreakdown({
          input: toFiniteNumber(row.input_tokens),
          output: toFiniteNumber(row.output_tokens),
          reasoning: toFiniteNumber(row.reasoning_tokens),
          cache: {
            read: toFiniteNumber(row.cache_read_tokens),
            write: toFiniteNumber(row.cache_write_tokens),
          },
        }),
      } satisfies RawMessage;
    })
    .filter((item): item is RawMessage => item !== null);
}

export async function readSqliteMessages(dbPath: string, options?: { fromTimestampMs?: number }) {
  if (!fs.existsSync(dbPath)) {
    return [] as RawMessage[];
  }

  try {
    const query = options?.fromTimestampMs ? SQLITE_USAGE_RECENT_QUERY : SQLITE_USAGE_QUERY;
    const rows = await querySqliteRows<SqliteUsageRow>(
      dbPath,
      query,
      options?.fromTimestampMs ? [options.fromTimestampMs] : [],
      "Failed to read sqlite usage messages",
    );
    return parseUsageRows(rows);
  } catch (err) {
    logger.error({ err, dbPath }, "Failed to read sqlite usage messages");
    return [] as RawMessage[];
  }
}

export async function readSqliteMessagesInWindow(dbPath: string, startMs: number, endMs: number) {
  if (!fs.existsSync(dbPath)) {
    return [] as RawMessage[];
  }

  try {
    const rows = await querySqliteRows<SqliteUsageRow>(
      dbPath,
      SQLITE_USAGE_WINDOW_QUERY,
      [startMs, endMs],
      "Failed to read sqlite usage messages in window",
    );
    return parseUsageRows(rows);
  } catch (err) {
    logger.error({ err, dbPath, startMs, endMs }, "Failed to read sqlite usage messages in window");
    return [] as RawMessage[];
  }
}
