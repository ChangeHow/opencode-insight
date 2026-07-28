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

import { flushSnapshotCacheWrites } from "../services/usage/snapshot";
import { scheduleSnapshotCacheWrite } from "../services/usage/snapshot-cache";
import { loadUsageSnapshot, refreshRecentUsageSnapshot } from "../services/usage/index";
import { makeUsageSnapshot } from "./factories";

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
  id = "ses_runtime",
  parentId: string | null = null,
) {
  db.prepare(`
    INSERT INTO session (id, parent_id, title, slug, directory)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, parentId, `${id} title`, `${id}-slug`, root);
}

function insertAssistantMessage(
  db: { prepare: (sql: string) => { run: (...params: unknown[]) => unknown } },
  id: string,
  createdAt: number,
  sessionId = "ses_runtime",
) {
  db.prepare(`
    INSERT INTO message (id, session_id, time_created, data)
    VALUES (?, ?, ?, ?)
  `).run(
    id,
    sessionId,
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
const SNAPSHOT_CACHE_FILE = path.join(SNAPSHOT_CACHE_DIR, "usage-snapshot.json");
const originalOpencodeDataDir = process.env.OPENCODE_DATA_DIR;
const originalCodexHome = process.env.CODEX_HOME;

describe("Usage runtime integration", () => {
  let tempRoot = "";

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-bff-"));
    process.env.OPENCODE_DATA_DIR = tempRoot;
    process.env.CODEX_HOME = path.join(tempRoot, "codex");
    fs.rmSync(SNAPSHOT_CACHE_DIR, { recursive: true, force: true });
  });

  afterEach(async () => {
    await flushSnapshotCacheWrites();
    if (originalOpencodeDataDir === undefined) {
      delete process.env.OPENCODE_DATA_DIR;
    } else {
      process.env.OPENCODE_DATA_DIR = originalOpencodeDataDir;
    }
    if (originalCodexHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = originalCodexHome;
    }

    fs.rmSync(SNAPSHOT_CACHE_DIR, { recursive: true, force: true });
    fs.rmSync(tempRoot, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  test("persists only the latest queued snapshot", async () => {
    const first = makeUsageSnapshot({
      summary: { scannedAt: "2026-04-26T10:00:00.000Z" },
    });
    const latest = makeUsageSnapshot({
      summary: { scannedAt: "2026-04-26T10:01:00.000Z" },
    });

    scheduleSnapshotCacheWrite(first);
    scheduleSnapshotCacheWrite(latest);
    await flushSnapshotCacheWrites();

    const cached = JSON.parse(fs.readFileSync(SNAPSHOT_CACHE_FILE, "utf8")) as {
      summary: { scannedAt: string };
    };
    expect(cached.summary.scannedAt).toBe("2026-04-26T10:01:00.000Z");
  });

  test("loads assistant usage from sqlite through runtime-native bindings", async () => {
    const dbPath = path.join(tempRoot, "opencode.db");
    const db = await createTestDatabase(dbPath);
    const createdAt = Date.UTC(2026, 2, 27, 12, 0, 0);

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
      sessionTitle: "ses_runtime title",
      sessionSlug: "ses_runtime-slug",
      modelId: "gpt-4o",
      providerId: "openai",
      pricedTokens: 1500,
    });
  });

  test("attributes descendant session usage to the primary session once", async () => {
    const dbPath = path.join(tempRoot, "opencode.db");
    const db = await createTestDatabase(dbPath);
    const createdAt = Date.UTC(2026, 2, 27, 12, 0, 0);

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
    `);
    insertSession(db, tempRoot, "primary");
    insertSession(db, tempRoot, "child", "primary");
    insertSession(db, tempRoot, "grandchild", "child");
    insertAssistantMessage(db, "primary-message", createdAt, "primary");
    insertAssistantMessage(db, "child-message", createdAt + 1_000, "child");
    insertAssistantMessage(db, "grandchild-message", createdAt + 2_000, "grandchild");
    db.close();

    const snapshot = await loadUsageSnapshot({ forceRefresh: true });
    const day = snapshot.breakdownByDate.get("2026-03-27");

    expect(snapshot.messages).toHaveLength(3);
    expect(snapshot.messages.every((message) => message.sessionId === "primary")).toBe(true);
    expect(snapshot.summary.totalTokens).toBe(4_500);
    expect(day?.sessions).toHaveLength(1);
    expect(day?.sessions[0]).toMatchObject({
      sessionId: "primary",
      messages: 3,
      tokens: 4_500,
    });
  });

  test("refreshes the entire last activity date after a long idle period", async () => {
    const dbPath = path.join(tempRoot, "opencode.db");
    const db = await createTestDatabase(dbPath);
    const morning = Date.UTC(2026, 3, 24, 9, 0, 0);
    const afternoon = Date.UTC(2026, 3, 24, 15, 0, 0);

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
      CREATE INDEX message_session_time_created_id_idx
        ON message (session_id, time_created, id);
    `);
    insertSession(db, tempRoot);
    insertAssistantMessage(db, "morning", morning);
    insertAssistantMessage(db, "afternoon", afternoon);

    const initialSnapshot = await loadUsageSnapshot({ forceRefresh: true });
    const refreshedSnapshot = await refreshRecentUsageSnapshot(initialSnapshot, {
      now: Date.UTC(2026, 4, 10, 12, 0, 0),
    });
    db.close();

    expect(refreshedSnapshot.messages.map((message) => message.id)).toEqual([
      "morning",
      "afternoon",
    ]);
    expect(refreshedSnapshot.summary.totalTokens).toBe(3_000);
    expect(refreshedSnapshot.breakdownByDate.get("2026-04-24")?.messages).toBe(2);
  });

  test("loads Codex CLI usage and invalidates the snapshot cache when JSONL grows", async () => {
    const sessionDir = path.join(process.env.CODEX_HOME!, "sessions", "2026", "07", "14");
    const sessionPath = path.join(sessionDir, "session-codex.jsonl");
    fs.mkdirSync(sessionDir, { recursive: true });
    const entries = [
      {
        timestamp: "2026-07-14T10:00:00.000Z",
        type: "session_meta",
        payload: {
          id: "meta-codex",
          model_provider: "openai",
          cwd: "/Users/alice/project",
        },
      },
      {
        timestamp: "2026-07-14T10:00:01.000Z",
        type: "turn_context",
        payload: { model: "gpt-4o" },
      },
      {
        timestamp: "2026-07-14T10:00:04.000Z",
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: { input_tokens: 100, output_tokens: 50 },
            last_token_usage: { input_tokens: 100, output_tokens: 50 },
          },
        },
      },
    ];
    fs.writeFileSync(sessionPath, entries.map((entry) => JSON.stringify(entry)).join("\n"), "utf8");

    const initialSnapshot = await loadUsageSnapshot({ forceRefresh: true });
    await flushSnapshotCacheWrites();

    expect(initialSnapshot.dataFingerprint).not.toBe("");
    expect(fs.existsSync(SNAPSHOT_CACHE_FILE)).toBe(true);
    expect(initialSnapshot.summary.source.kind).toBe("json");
    expect(initialSnapshot.summary.totalTokens).toBe(150);
    expect(initialSnapshot.breakdownByDate.get("2026-07-14")?.sessions[0]).toMatchObject({
      sessionId: "codex:session-codex",
      runtime: "codex",
    });

    const nextEntry = {
      timestamp: "2026-07-14T10:00:08.000Z",
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          total_token_usage: { input_tokens: 180, output_tokens: 70 },
          last_token_usage: { input_tokens: 80, output_tokens: 20 },
        },
      },
    };
    fs.appendFileSync(sessionPath, `\n${JSON.stringify(nextEntry)}`, "utf8");

    const refreshedSnapshot = await loadUsageSnapshot();

    expect(refreshedSnapshot.messages).toHaveLength(2);
    expect(refreshedSnapshot.summary.totalTokens).toBe(250);
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
    `);

    db.prepare(`
      INSERT INTO session (id, parent_id, title, slug, directory)
      VALUES (?, ?, ?, ?, ?)
    `).run("ses_runtime", null, "Runtime session", "runtime-session", tempRoot);

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

    const refreshedSnapshot = await refreshRecentUsageSnapshot(initialSnapshot, { now: today });

    expect(refreshedSnapshot.messages).toHaveLength(3);
    expect(refreshedSnapshot.summary.totalMessages).toBe(3);
    expect(refreshedSnapshot.summary.totalTokens).toBe(400);
    expect(refreshedSnapshot.breakdownByDate.get("2026-04-24")?.tokens).toBe(150);
    expect(refreshedSnapshot.breakdownByDate.get("2026-04-26")?.tokens).toBe(250);

    db.prepare("DELETE FROM message WHERE time_created >= ?").run(todayFirst);
    db.close();

    const afterDeletion = await refreshRecentUsageSnapshot(refreshedSnapshot, { now: today });

    expect(afterDeletion.messages.map((message) => message.id)).toEqual(["msg_older"]);
    expect(afterDeletion.summary.totalMessages).toBe(1);
    expect(afterDeletion.summary.totalTokens).toBe(150);
    expect(afterDeletion.breakdownByDate.has("2026-04-26")).toBe(false);
  });
});
