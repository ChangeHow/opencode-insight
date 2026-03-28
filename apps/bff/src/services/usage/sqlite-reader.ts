import fs from "node:fs";
import type { TokenBreakdown } from "@opencode-dashboard/shared";
import { formatDateInTimeZone, DEFAULT_TIME_ZONE } from "@opencode-dashboard/shared";
import { logger } from "../../logger";
import type { RawMessage } from "./types";

const SQLITE_USAGE_QUERY = `
  SELECT
    m.id,
    m.data,
    s.id AS session_id,
    s.title AS session_title,
    s.slug AS session_slug,
    s.directory AS session_directory
  FROM message m
  JOIN session s ON s.id = m.session_id
`;

interface SqliteUsageRow {
  id: string;
  data: string;
  session_id: string;
  session_title: string;
  session_slug: string | null;
  session_directory: string;
}

interface NodeSqliteDatabase {
  prepare: <BindParameters extends unknown[], Result>(
    sql: string,
  ) => {
    all: (...params: BindParameters) => Result[];
  };
  close: () => void;
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
    cost: Math.max(0, Number(message.cost ?? 0)),
    estimatedCost: 0,
    pricedTokens: 0,
    tokens,
  };
}

function parseUsageRows(rows: SqliteUsageRow[]) {
  return rows
    .map((row) => {
      try {
        return parseAssistantMessage(JSON.parse(row.data), row.id, {
          id: row.session_id,
          title: row.session_title,
          slug: row.session_slug ?? "",
          directory: row.session_directory,
        });
      } catch {
        return null;
      }
    })
    .filter((item): item is RawMessage => item !== null);
}

function isBunRuntime() {
  return "Bun" in globalThis;
}

async function readSqliteMessagesWithBun(dbPath: string) {
  let db: {
    query: (sql: string) => { all: () => SqliteUsageRow[] };
    close: () => void;
  } | null = null;

  try {
    const { Database: BunDatabase } = (await new Function("return import('bun:sqlite')")()) as {
      Database: new (path: string) => {
        query: (sql: string) => { all: () => SqliteUsageRow[] };
        close: () => void;
      };
    };

    db = new BunDatabase(dbPath);
    return parseUsageRows(db.query(SQLITE_USAGE_QUERY).all());
  } catch (err) {
    logger.error({ err, dbPath }, "Failed to read sqlite usage messages");
    return [] as RawMessage[];
  } finally {
    db?.close();
  }
}

async function readSqliteMessagesWithNode(dbPath: string) {
  let db: NodeSqliteDatabase | null = null;
  try {
    const { default: BetterSqlite3 } = (await import("better-sqlite3")) as {
      default: new (
        path: string,
        options: { readonly: boolean; fileMustExist: boolean },
      ) => NodeSqliteDatabase;
    };

    db = new BetterSqlite3(dbPath, { readonly: true, fileMustExist: true });
    const rows = db.prepare<[], SqliteUsageRow>(SQLITE_USAGE_QUERY).all();
    return parseUsageRows(rows);
  } catch (err) {
    logger.error({ err, dbPath }, "Failed to read sqlite usage messages");
    return [] as RawMessage[];
  } finally {
    db?.close();
  }
}

export async function readSqliteMessages(dbPath: string) {
  if (!fs.existsSync(dbPath)) {
    return [] as RawMessage[];
  }

  if (isBunRuntime()) {
    return readSqliteMessagesWithBun(dbPath);
  }

  return readSqliteMessagesWithNode(dbPath);
}
