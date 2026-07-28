import fs from "node:fs";
import path from "node:path";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { logger } from "../../logger";
import { listCodexSessionFiles } from "./codex-reader";
import type { SerializedUsageSnapshot, UsageSnapshot } from "./types";

const CACHE_DIR = path.join(process.cwd(), ".cache", "opencode-telescope");
const SNAPSHOT_CACHE_FILE = path.join(CACHE_DIR, "usage-snapshot.json");
const SNAPSHOT_SCHEMA_VERSION = 5;

let cacheWriteGeneration = 0;
let pendingCacheWrite: { snapshot: UsageSnapshot; generation: number } | null = null;
let cacheWritePromise: Promise<void> | null = null;

export function computeDataFingerprint(
  dbPath: string,
  legacyDir: string,
  codexSessionDirs: string[] = [],
) {
  const parts: string[] = [];
  if (fs.existsSync(dbPath)) {
    const stat = fs.statSync(dbPath);
    parts.push(`db:${stat.ino}:${stat.size}`);
  }
  if (fs.existsSync(legacyDir)) {
    const stat = fs.statSync(legacyDir);
    parts.push(`legacy:${stat.ino}:${Math.trunc(stat.mtimeMs)}`);
  }
  for (const filePath of listCodexSessionFiles(codexSessionDirs)) {
    try {
      const stat = fs.statSync(filePath);
      parts.push(`codex:${filePath}:${stat.size}:${Math.trunc(stat.mtimeMs)}`);
    } catch {
      // The next refresh will pick up files that changed while scanning.
    }
  }
  const sessionIndexPath = codexSessionDirs[0]
    ? path.join(path.dirname(codexSessionDirs[0]), "session_index.jsonl")
    : "";
  if (sessionIndexPath && fs.existsSync(sessionIndexPath)) {
    const stat = fs.statSync(sessionIndexPath);
    parts.push(`codex-index:${stat.size}:${Math.trunc(stat.mtimeMs)}`);
  }
  return parts.length > 0 ? parts.join("|") : "empty";
}

export function withDataFingerprint(
  snapshot: UsageSnapshot,
  dbPath: string,
  legacyDir: string,
  codexSessionDirs: string[],
): UsageSnapshot {
  return {
    ...snapshot,
    dataFingerprint: computeDataFingerprint(dbPath, legacyDir, codexSessionDirs),
  };
}

export function readSnapshotCache(dbPath: string, legacyDir: string, codexSessionDirs: string[]) {
  if (!fs.existsSync(SNAPSHOT_CACHE_FILE)) {
    return null;
  }

  try {
    const cached = JSON.parse(
      fs.readFileSync(SNAPSHOT_CACHE_FILE, "utf8"),
    ) as SerializedUsageSnapshot;
    if (
      cached.schemaVersion !== SNAPSHOT_SCHEMA_VERSION ||
      cached.breakdownByDate.some((day) => !("sessions" in day))
    ) {
      return null;
    }

    const snapshot = deserializeSnapshot(cached);
    const currentFingerprint = computeDataFingerprint(dbPath, legacyDir, codexSessionDirs);
    return {
      snapshot,
      fresh: cached.dataFingerprint === currentFingerprint,
    };
  } catch {
    return null;
  }
}

export function scheduleSnapshotCacheWrite(snapshot: UsageSnapshot) {
  const generation = ++cacheWriteGeneration;
  pendingCacheWrite = { snapshot, generation };
  startCacheWriter();
}

export async function flushSnapshotCacheWrites() {
  while (true) {
    startCacheWriter();
    const writer = cacheWritePromise;
    if (!writer) {
      return;
    }
    await writer;
  }
}

function startCacheWriter() {
  if (cacheWritePromise || !pendingCacheWrite) {
    return;
  }

  const writer = drainCacheWrites()
    .catch((error) => {
      logger.warn({ err: error }, "Failed to persist usage snapshot cache");
    })
    .finally(() => {
      if (cacheWritePromise === writer) {
        cacheWritePromise = null;
      }
      if (pendingCacheWrite) {
        startCacheWriter();
      }
    });
  cacheWritePromise = writer;
}

async function drainCacheWrites() {
  await waitForNextTurn();
  while (pendingCacheWrite) {
    const pending = pendingCacheWrite;
    pendingCacheWrite = null;
    await writeSnapshotCache(pending.snapshot, pending.generation);
  }
}

function serializeSnapshot(snapshot: UsageSnapshot): SerializedUsageSnapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    summary: snapshot.summary,
    messages: snapshot.messages,
    heatmap: snapshot.heatmap,
    trendByRange: snapshot.trendByRange,
    breakdownByDate: [...snapshot.breakdownByDate.values()].toSorted((left, right) =>
      left.date.localeCompare(right.date),
    ),
    dataFingerprint: snapshot.dataFingerprint,
  };
}

function deserializeSnapshot(snapshot: SerializedUsageSnapshot): UsageSnapshot {
  return {
    summary: snapshot.summary,
    dataFingerprint: snapshot.dataFingerprint ?? "",
    messages: snapshot.messages,
    heatmap: snapshot.heatmap,
    trendByRange: snapshot.trendByRange,
    breakdownByDate: new Map(
      snapshot.breakdownByDate.map((day) => [day.date, { ...day, sessions: day.sessions ?? [] }]),
    ),
  };
}

async function writeSnapshotCache(snapshot: UsageSnapshot, generation: number) {
  await mkdir(CACHE_DIR, { recursive: true });
  const tempFile = `${SNAPSHOT_CACHE_FILE}.${process.pid}.${generation}.tmp`;
  try {
    await writeFile(tempFile, JSON.stringify(serializeSnapshot(snapshot)), "utf8");
    if (generation === cacheWriteGeneration) {
      await rename(tempFile, SNAPSHOT_CACHE_FILE);
    }
  } finally {
    await unlink(tempFile).catch(() => undefined);
  }
}

function waitForNextTurn() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}
