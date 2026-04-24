import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../services/pricing.js", async () => {
  const actual =
    await vi.importActual<typeof import("../services/pricing.js")>("../services/pricing.js");
  return {
    ...actual,
    getPricingDataset: vi.fn(async () => ({
      "gpt-4o": {
        input_cost_per_token: 0.0000025,
        output_cost_per_token: 0.00001,
      },
    })),
  };
});

import { loadUsageSnapshot, refreshUsageSnapshotToday } from "../services/usage/index";

async function createTestDatabase(dbPath: string) {
  const { DatabaseSync } = (await import("node:sqlite")) as {
    DatabaseSync: new (path: string) => {
      exec: (sql: string) => void;
      prepare: (sql: string) => { run: (...params: unknown[]) => unknown };
      close: () => void;
    };
  };

  return new DatabaseSync(dbPath);
}

function insertSession(
  db: { prepare: (sql: string) => { run: (...params: unknown[]) => unknown } },
  root: string,
) {
  db.prepare(`
    INSERT INTO session (id, title, slug, directory)
    VALUES (?, ?, ?, ?)
  `).run("ses_runtime", "Runtime session", "runtime-session", root);
}

function insertAssistantMessage(
  db: { prepare: (sql: string) => { run: (...params: unknown[]) => unknown } },
  id: string,
  createdAt: number,
) {
  db.prepare(`
    INSERT INTO message (id, session_id, time_created, data)
    VALUES (?, ?, ?, ?)
  `).run(
    id,
    "ses_runtime",
    createdAt,
    JSON.stringify({
      id,
      role: "assistant",
      modelID: "gpt-4o",
      providerID: "openai",
      cost: 0.05,
      time: { created: createdAt },
      tokens: {
        input: 1200,
        output: 300,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    }),
  );
}

const SNAPSHOT_CACHE_DIR = path.join(process.cwd(), ".cache", "opencode-telescope");
const originalOpencodeDataDir = process.env.OPENCODE_DATA_DIR;

describe("Usage runtime integration", () => {
  let tempRoot = "";

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-bff-"));
    process.env.OPENCODE_DATA_DIR = tempRoot;
    fs.rmSync(SNAPSHOT_CACHE_DIR, { recursive: true, force: true });
  });

  afterEach(() => {
    if (originalOpencodeDataDir === undefined) {
      delete process.env.OPENCODE_DATA_DIR;
    } else {
      process.env.OPENCODE_DATA_DIR = originalOpencodeDataDir;
    }

    fs.rmSync(SNAPSHOT_CACHE_DIR, { recursive: true, force: true });
    fs.rmSync(tempRoot, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  test("loads assistant usage from sqlite through runtime-native bindings", async () => {
    const dbPath = path.join(tempRoot, "opencode.db");
    const db = await createTestDatabase(dbPath);
    const createdAt = Date.UTC(2026, 2, 27, 12, 0, 0);

    db.exec(`
      CREATE TABLE session (
        id TEXT PRIMARY KEY,
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
    `);

    insertSession(db, tempRoot);

    insertAssistantMessage(db, "msg_assistant", createdAt);

    db.prepare(`
      INSERT INTO message (id, session_id, time_created, data)
      VALUES (?, ?, ?, ?)
    `).run(
      "msg_user",
      "ses_runtime",
      createdAt - 1000,
      JSON.stringify({
        id: "msg_user",
        role: "user",
        time: { created: createdAt - 1000 },
      }),
    );

    db.close();

    const snapshot = await loadUsageSnapshot({ forceRefresh: true });

    expect(snapshot.summary.source.kind).toBe("sqlite");
    expect(snapshot.messages).toHaveLength(1);
    expect(snapshot.summary.totalMessages).toBe(1);
    expect(snapshot.summary.totalTokens).toBe(1500);
    expect(snapshot.summary.pricedTokens).toBe(1500);
    expect(snapshot.messages[0]).toMatchObject({
      id: "msg_assistant",
      sessionId: "ses_runtime",
      sessionTitle: "Runtime session",
      sessionSlug: "runtime-session",
      modelId: "gpt-4o",
      providerId: "openai",
      pricedTokens: 1500,
    });
  });

  test("refreshes only today's sqlite usage window when a snapshot already exists", async () => {
    const dbPath = path.join(tempRoot, "opencode.db");
    const db = await createTestDatabase(dbPath);
    const oldCreatedAt = Date.now() - 2 * 24 * 60 * 60 * 1000;
    const todayCreatedAt = Date.now();

    db.exec(`
      CREATE TABLE session (
        id TEXT PRIMARY KEY,
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
    `);

    insertSession(db, tempRoot);
    insertAssistantMessage(db, "msg_old", oldCreatedAt);
    insertAssistantMessage(db, "msg_today", todayCreatedAt);
    db.close();

    const snapshot = await loadUsageSnapshot({ forceRefresh: true });
    expect(snapshot.messages.map((message) => message.id).toSorted()).toEqual([
      "msg_old",
      "msg_today",
    ]);

    const writeDb = await createTestDatabase(dbPath);
    insertAssistantMessage(writeDb, "msg_today_new", Date.now());
    writeDb.close();

    const refreshed = await refreshUsageSnapshotToday(snapshot, { timeZone: "UTC" });

    expect(refreshed.messages.map((message) => message.id).toSorted()).toEqual([
      "msg_old",
      "msg_today",
      "msg_today_new",
    ]);
  });
});
