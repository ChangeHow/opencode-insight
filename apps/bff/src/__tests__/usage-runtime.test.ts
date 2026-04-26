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

import { loadUsageSnapshot, refreshRecentUsageSnapshot } from "../services/usage/index";

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

  test("refreshes recent usage without rebuilding older history first", async () => {
    const dbPath = path.join(tempRoot, "opencode.db");
    const db = await createTestDatabase(dbPath);
    const today = new Date(Date.UTC(2026, 3, 26, 12, 0, 0));
    const olderDay = Date.UTC(2026, 3, 24, 12, 0, 0);
    const todayFirst = today.getTime();
    const todaySecond = todayFirst + 60_000;

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

    db.prepare(`
      INSERT INTO session (id, title, slug, directory)
      VALUES (?, ?, ?, ?)
    `).run("ses_runtime", "Runtime session", "runtime-session", tempRoot);

    db.prepare(`
      INSERT INTO message (id, session_id, time_created, data)
      VALUES (?, ?, ?, ?)
    `).run(
      "msg_older",
      "ses_runtime",
      olderDay,
      JSON.stringify({
        id: "msg_older",
        role: "assistant",
        modelID: "gpt-4o",
        providerID: "openai",
        cost: 0.05,
        time: { created: olderDay },
        tokens: {
          input: 100,
          output: 50,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
      }),
    );

    db.prepare(`
      INSERT INTO message (id, session_id, time_created, data)
      VALUES (?, ?, ?, ?)
    `).run(
      "msg_today_first",
      "ses_runtime",
      todayFirst,
      JSON.stringify({
        id: "msg_today_first",
        role: "assistant",
        modelID: "gpt-4o",
        providerID: "openai",
        cost: 0.05,
        time: { created: todayFirst },
        tokens: {
          input: 120,
          output: 30,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
      }),
    );

    const initialSnapshot = await loadUsageSnapshot({ forceRefresh: true });

    db.prepare(`
      INSERT INTO message (id, session_id, time_created, data)
      VALUES (?, ?, ?, ?)
    `).run(
      "msg_today_second",
      "ses_runtime",
      todaySecond,
      JSON.stringify({
        id: "msg_today_second",
        role: "assistant",
        modelID: "gpt-4o",
        providerID: "openai",
        cost: 0.05,
        time: { created: todaySecond },
        tokens: {
          input: 80,
          output: 20,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
      }),
    );

    db.close();

    const refreshedSnapshot = await refreshRecentUsageSnapshot(initialSnapshot, { now: today });

    expect(refreshedSnapshot.messages).toHaveLength(3);
    expect(refreshedSnapshot.summary.totalMessages).toBe(3);
    expect(refreshedSnapshot.summary.totalTokens).toBe(400);
    expect(refreshedSnapshot.breakdownByDate.get("2026-04-24")?.tokens).toBe(150);
    expect(refreshedSnapshot.breakdownByDate.get("2026-04-26")?.tokens).toBe(250);
  });
});
