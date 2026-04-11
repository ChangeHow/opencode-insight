import fs from "node:fs";
import type { TokenBreakdown } from "@opencode-dashboard/shared";
import { formatDateInTimeZone, DEFAULT_TIME_ZONE } from "@opencode-dashboard/shared";
import { logger } from "../../logger";
import { roundCost } from "../cost";
import { querySqliteRows } from "../sqlite";
import type { RawMessage } from "./types";

const SQLITE_USAGE_QUERY = `
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
    s.id AS session_id,
    s.title AS session_title,
    s.slug AS session_slug,
    s.directory AS session_directory
  FROM message m
  JOIN session s ON s.id = m.session_id
  WHERE json_extract(m.data, '$.role') = 'assistant'
    AND json_extract(m.data, '$.modelID') IS NOT NULL
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
    .map((row) => {
      const timestampMs = Math.trunc(toFiniteNumber(row.time_created));
      if (!timestampMs || !row.model_id) {
        return null;
      }

      return {
        id: row.id,
        sessionId: row.session_id,
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

export async function readSqliteMessages(dbPath: string) {
  if (!fs.existsSync(dbPath)) {
    return [] as RawMessage[];
  }

  try {
    const rows = await querySqliteRows<SqliteUsageRow>(
      dbPath,
      SQLITE_USAGE_QUERY,
      [],
      "Failed to read sqlite usage messages",
    );
    return parseUsageRows(rows);
  } catch (err) {
    logger.error({ err, dbPath }, "Failed to read sqlite usage messages");
    return [] as RawMessage[];
  }
}
