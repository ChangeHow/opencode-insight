import fs from "node:fs";
import { logger } from "../logger";

interface QueryableSqliteDatabase {
  query: (sql: string) => { all: (...params: unknown[]) => unknown[] };
  close: () => void;
}

interface PreparedSqliteDatabase {
  prepare: (sql: string) => {
    all: (...params: unknown[]) => unknown[];
  };
  close: () => void;
}

function isBunRuntime() {
  return "Bun" in globalThis;
}

async function openBunDatabase(dbPath: string): Promise<QueryableSqliteDatabase> {
  const { Database } = (await new Function("return import('bun:sqlite')")()) as {
    Database: new (path: string, options?: { readonly?: boolean }) => QueryableSqliteDatabase;
  };

  return new Database(dbPath, { readonly: true });
}

async function openNodeDatabase(dbPath: string): Promise<PreparedSqliteDatabase> {
  const { DatabaseSync } = (await import("node:sqlite")) as {
    DatabaseSync: new (
      path: string,
      options?: { open?: boolean; readOnly?: boolean },
    ) => PreparedSqliteDatabase;
  };

  return new DatabaseSync(dbPath, { open: true, readOnly: true });
}

export async function querySqliteRows<Row extends object>(
  dbPath: string,
  sql: string,
  params: unknown[] = [],
  errorMessage = "Failed to query sqlite rows",
): Promise<Row[]> {
  if (!fs.existsSync(dbPath)) {
    return [];
  }

  let db: QueryableSqliteDatabase | PreparedSqliteDatabase | null = null;

  try {
    if (isBunRuntime()) {
      db = await openBunDatabase(dbPath);
      return db.query(sql).all(...params) as Row[];
    }

    db = await openNodeDatabase(dbPath);
    return db.prepare(sql).all(...params) as Row[];
  } catch (err) {
    logger.error({ err, dbPath, params }, errorMessage);
    return [];
  } finally {
    db?.close();
  }
}
