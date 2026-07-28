import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { querySqliteRows } from "../services/sqlite";
import { readSqliteMessages } from "../services/usage/sqlite-reader";

vi.mock("../services/sqlite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/sqlite")>();
  return {
    ...actual,
    querySqliteRows: vi.fn(actual.querySqliteRows),
  };
});

const mockQuerySqliteRows = vi.mocked(querySqliteRows);

interface TestDatabase {
  exec: (sql: string) => void;
  prepare: (sql: string) => {
    run: (...params: unknown[]) => unknown;
    all: (...params: unknown[]) => unknown[];
  };
  close: () => void;
}

async function createTestDatabase(dbPath: string): Promise<TestDatabase> {
  const { DatabaseSync } = (await import("node:sqlite")) as {
    DatabaseSync: new (path: string) => TestDatabase;
  };

  return new DatabaseSync(dbPath);
}

function insertAssistantMessage(
  db: TestDatabase,
  id: string,
  sessionId: string,
  timeCreated: number,
) {
  db.prepare(`
    INSERT INTO message (id, session_id, time_created, data)
    VALUES (?, ?, ?, ?)
  `).run(
    id,
    sessionId,
    timeCreated,
    JSON.stringify({
      id,
      role: "assistant",
      modelID: "gpt-4o",
      providerID: "openai",
      tokens: { input: 100, output: 50 },
    }),
  );
}

describe("SQLite usage reader", () => {
  let tempRoot = "";

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test("reads only recent messages while preserving root session metadata", async () => {
    mockQuerySqliteRows.mockClear();
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-bff-"));
    const dbPath = path.join(tempRoot, "opencode.db");
    const db = await createTestDatabase(dbPath);
    const fromTimestampMs = Date.UTC(2026, 3, 26, 0, 0, 0);

    db.exec(`
      CREATE TABLE session (
        id TEXT PRIMARY KEY,
        parent_id TEXT,
        title TEXT NOT NULL,
        slug TEXT,
        directory TEXT NOT NULL
      );
      CREATE TABLE message (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        time_created INTEGER NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX idx_message_session_time_id ON message (session_id, time_created, id);
    `);
    db.prepare(`
      INSERT INTO session (id, parent_id, title, slug, directory)
      VALUES (?, ?, ?, ?, ?)
    `).run("root", null, "Root session", "root-session", "/workspace/root");
    db.prepare(`
      INSERT INTO session (id, parent_id, title, slug, directory)
      VALUES (?, ?, ?, ?, ?)
    `).run("child", "root", "Child session", "child-session", "/workspace/child");

    insertAssistantMessage(db, "older", "child", fromTimestampMs - 1);
    insertAssistantMessage(db, "recent", "child", fromTimestampMs);

    const messages = await readSqliteMessages(dbPath, { fromTimestampMs });
    const recentQuery = mockQuerySqliteRows.mock.calls.at(-1)?.[1];
    expect(recentQuery).toEqual(expect.any(String));
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${recentQuery}`).all(fromTimestampMs) as Array<{
      detail: string;
    }>;
    db.close();

    expect(messages).toEqual([
      expect.objectContaining({
        id: "recent",
        sessionId: "root",
        sessionTitle: "Root session",
        sessionSlug: "root-session",
        sessionDirectory: "/workspace/root",
      }),
    ]);
    expect(plan.map((step) => step.detail).join("\n")).toContain(
      "SEARCH m USING INDEX idx_message_session_time_id (session_id=? AND time_created>?)",
    );
  });
});
