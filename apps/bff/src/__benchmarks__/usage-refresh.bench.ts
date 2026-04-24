import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, bench, describe, vi } from "vitest";

vi.mock("../services/pricing.js", async () => {
  const actual =
    await vi.importActual<typeof import("../services/pricing.js")>("../services/pricing.js");
  return {
    ...actual,
    getPricingDataset: vi.fn(async () => ({
      "gpt-4o": {
        input_cost_per_token: 0.0000025,
        output_cost_per_token: 0.00001,
        cache_read_input_token_cost: 0.0000005,
        cache_creation_input_token_cost: 0.00000125,
      },
    })),
  };
});

const MESSAGE_COUNT = Number(process.env.BENCH_MESSAGE_COUNT ?? 600);
const SNAPSHOT_CACHE_DIR = path.join(process.cwd(), ".cache", "opencode-telescope");
const originalOpenCodeDataDir = process.env.OPENCODE_DATA_DIR;
const originalLogLevel = process.env.LOG_LEVEL;

let tempRoot = "";
let dbPath = "";
let loadUsageSnapshot: typeof import("../services/usage/index").loadUsageSnapshot | undefined;
let refreshSnapshot: typeof import("../controllers/shared").refreshSnapshot | undefined;
let benchmarkReady: Promise<void> | null = null;
let nextMessageIndex = MESSAGE_COUNT;

async function createBenchmarkDatabase(databasePath: string) {
  const { DatabaseSync } = (await import("node:sqlite")) as {
    DatabaseSync: new (path: string) => {
      exec: (sql: string) => void;
      prepare: (sql: string) => { run: (...params: unknown[]) => unknown };
      close: () => void;
    };
  };

  const db = new DatabaseSync(databasePath);
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
    CREATE INDEX idx_message_session_time ON message (session_id, time_created);
  `);

  const insertSession = db.prepare(`
    INSERT INTO session (id, title, slug, directory)
    VALUES (?, ?, ?, ?)
  `);
  const insertMessage = db.prepare(`
    INSERT INTO message (id, session_id, time_created, data)
    VALUES (?, ?, ?, ?)
  `);

  db.exec("BEGIN");
  for (let sessionIndex = 0; sessionIndex < 12; sessionIndex++) {
    const sessionId = `ses_bench_${sessionIndex}`;
    insertSession.run(
      sessionId,
      `Benchmark session ${sessionIndex}`,
      `bench-${sessionIndex}`,
      tempRoot,
    );
  }

  const baseTime = Date.UTC(2026, 2, 1, 9, 0, 0);
  for (let index = 0; index < MESSAGE_COUNT; index++) {
    const sessionId = `ses_bench_${index % 12}`;
    const createdAt = baseTime + index * 60_000;
    insertMessage.run(
      `msg_bench_${index}`,
      sessionId,
      createdAt,
      JSON.stringify({
        id: `msg_bench_${index}`,
        role: "assistant",
        modelID: "gpt-4o",
        providerID: "openai",
        time: { created: createdAt },
        tokens: {
          input: 1200 + (index % 7) * 100,
          output: 250 + (index % 5) * 40,
          reasoning: 0,
          cache: { read: index % 3 === 0 ? 400 : 0, write: index % 11 === 0 ? 120 : 0 },
        },
      }),
    );
  }
  db.exec("COMMIT");
  db.close();
}

async function insertTodayMessage() {
  const { DatabaseSync } = (await import("node:sqlite")) as {
    DatabaseSync: new (path: string) => {
      prepare: (sql: string) => { run: (...params: unknown[]) => unknown };
      close: () => void;
    };
  };

  const index = nextMessageIndex++;
  const createdAt = Date.now();
  const db = new DatabaseSync(dbPath);
  db.prepare(`
    INSERT INTO message (id, session_id, time_created, data)
    VALUES (?, ?, ?, ?)
  `).run(
    `msg_bench_${index}`,
    `ses_bench_${index % 12}`,
    createdAt,
    JSON.stringify({
      id: `msg_bench_${index}`,
      role: "assistant",
      modelID: "gpt-4o",
      providerID: "openai",
      time: { created: createdAt },
      tokens: {
        input: 1400,
        output: 320,
        reasoning: 0,
        cache: { read: 200, write: 0 },
      },
    }),
  );
  db.close();
}

async function setupBenchmark() {
  if (loadUsageSnapshot) {
    return;
  }

  if (!tempRoot) {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-dashboard-bench-"));
    process.env.OPENCODE_DATA_DIR = tempRoot;
    process.env.LOG_LEVEL = "silent";
    fs.rmSync(SNAPSHOT_CACHE_DIR, { recursive: true, force: true });
    dbPath = path.join(tempRoot, "opencode.db");
    await createBenchmarkDatabase(dbPath);
  }

  ({ loadUsageSnapshot } = await import("../services/usage/index"));
  await loadUsageSnapshot({ forceRefresh: true });
  ({ refreshSnapshot } = await import("../controllers/shared"));
}

function ensureBenchmarkReady() {
  benchmarkReady ??= setupBenchmark();
  return benchmarkReady;
}

describe("usage refresh benchmark", () => {
  beforeAll(async () => {
    await ensureBenchmarkReady();
  });

  afterAll(() => {
    if (originalOpenCodeDataDir === undefined) {
      delete process.env.OPENCODE_DATA_DIR;
    } else {
      process.env.OPENCODE_DATA_DIR = originalOpenCodeDataDir;
    }
    if (originalLogLevel === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = originalLogLevel;
    }

    fs.rmSync(SNAPSHOT_CACHE_DIR, { recursive: true, force: true });
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  bench(
    "full sqlite snapshot rebuild",
    async () => {
      await ensureBenchmarkReady();
      await loadUsageSnapshot!({ forceRefresh: true });
    },
    { iterations: 10, warmupIterations: 2 },
  );

  bench(
    "unchanged refresh shortcut",
    async () => {
      await ensureBenchmarkReady();
      await refreshSnapshot!();
    },
    { iterations: 30, warmupIterations: 5 },
  );

  bench(
    "changed today refresh",
    async () => {
      await ensureBenchmarkReady();
      await insertTodayMessage();
      await refreshSnapshot!();
    },
    { iterations: 10, warmupIterations: 2 },
  );

  bench(
    "unchanged snapshot cache read",
    async () => {
      await ensureBenchmarkReady();
      await loadUsageSnapshot!();
    },
    { iterations: 30, warmupIterations: 5 },
  );
});
