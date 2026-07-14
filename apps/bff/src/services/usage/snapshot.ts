import fs from "node:fs";
import path from "node:path";
import type { DayBreakdown } from "@opencode-dashboard/shared";
import {
  dateKeyToUtcNoon,
  DEFAULT_TIME_ZONE,
  formatDateInTimeZone,
  shiftDateKey,
} from "@opencode-dashboard/shared";
import { logger } from "../../logger";
import { estimateUsageCostFromDataset, getPricingDataset } from "../pricing";
import { getCodexPaths, listCodexSessionFiles, readCodexMessages } from "./codex-reader";
import { readLegacyMessages } from "./legacy-reader";
import { buildSnapshot } from "./day-map";
import { emptyBreakdown, totalTokens, readSqliteMessages } from "./sqlite-reader";
import type { RawMessage, SerializedUsageSnapshot, SourceKind, UsageSnapshot } from "./types";

const CACHE_DIR = path.join(process.cwd(), ".cache", "opencode-telescope");
const SNAPSHOT_CACHE_FILE = path.join(CACHE_DIR, "usage-snapshot.json");
const SNAPSHOT_SCHEMA_VERSION = 5;
const FAST_REFRESH_WINDOW_DAYS = 2;
const PROVIDER_ALIASES: Record<string, string> = {
  zhipu: "zai-coding-plan",
  glm: "zai-coding-plan",
  zai: "zai-coding-plan",
  "z.ai": "zai-coding-plan",
  bigmodel: "zai-coding-plan",
};

export function normalizeProviderId(providerId: string) {
  const normalized = providerId.trim().toLowerCase();
  return PROVIDER_ALIASES[normalized] ?? normalized;
}

export function computeDataFingerprint(
  dbPath: string,
  legacyDir: string,
  codexSessionDirs: string[] = [],
): string {
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

export function emptyDayBreakdown(date: string): DayBreakdown {
  return {
    date,
    tokens: 0,
    pricedTokens: 0,
    cost: 0,
    messages: 0,
    breakdown: emptyBreakdown(),
    models: [],
    sessions: [],
  };
}

export function normalizeDayBreakdown(day: DayBreakdown): DayBreakdown {
  return {
    ...day,
    sessions: day.sessions ?? [],
  };
}

function getOpenCodePaths() {
  const configuredRoot = process.env.OPENCODE_DATA_DIR;
  const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? "";
  const defaultRoot = path.join(homeDir, ".local", "share", "opencode");
  const root = configuredRoot && configuredRoot.trim().length > 0 ? configuredRoot : defaultRoot;
  const isDefault = !configuredRoot || configuredRoot.trim().length === 0;
  return {
    dbPath: path.join(root, "opencode.db"),
    legacyDir: path.join(root, "storage", "message"),
    root,
    isDefault,
  };
}

function dedupeMessages(messages: RawMessage[]) {
  const map = new Map<string, RawMessage>();
  for (const message of messages) {
    if (!map.has(message.id)) {
      map.set(message.id, message);
    }
  }
  return [...map.values()].toSorted((a, b) => a.timestampMs - b.timestampMs);
}

function dateKeyToUtcStartTimestampMs(value: string) {
  const date = dateKeyToUtcNoon(value);
  if (!date) {
    return 0;
  }

  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function getFastRefreshStartDateKey(now: Date | number = new Date()) {
  return shiftDateKey(
    formatDateInTimeZone(now, DEFAULT_TIME_ZONE),
    -(FAST_REFRESH_WINDOW_DAYS - 1),
  );
}

export function filterMessagesByProvider(messages: RawMessage[], providerId?: string) {
  if (!providerId) {
    return messages;
  }

  const normalized = normalizeProviderId(providerId);
  return messages.filter((message) => normalizeProviderId(message.providerId) === normalized);
}

async function enrichMessages(messages: RawMessage[]) {
  const pricingDataset = await getPricingDataset();
  return messages.map((message) => {
    const pricing = estimateUsageCostFromDataset(
      pricingDataset,
      message.modelId,
      message.providerId,
      message.tokens,
    );
    return {
      ...message,
      estimatedCost: pricing.estimatedCost,
      pricedTokens: pricing.priced ? totalTokens(message.tokens) : 0,
    };
  });
}

async function readUsageMessages(
  dbPath: string,
  legacyDir: string,
  codexSessionDirs: string[],
  options?: { fromTimestampMs?: number },
) {
  const sqliteMessages = await readSqliteMessages(dbPath, options);
  const legacyMessages = readLegacyMessages(legacyDir, options);
  const codexMessages = readCodexMessages(codexSessionDirs, options);
  return {
    sqliteMessages,
    legacyMessages,
    codexMessages,
    messages: await enrichMessages(
      dedupeMessages([...sqliteMessages, ...legacyMessages, ...codexMessages]),
    ),
  };
}

function getSnapshotPaths(dbPath: string, legacyDir: string, codexSessionDirs: string[]) {
  return [dbPath, legacyDir, ...codexSessionDirs].filter((currentPath) =>
    fs.existsSync(currentPath),
  );
}

function resolveSourceKind(sqliteCount: number, jsonCount: number): SourceKind {
  if (sqliteCount > 0 && jsonCount > 0) return "mixed";
  if (sqliteCount > 0) return "sqlite";
  if (jsonCount > 0) return "json";
  return "none";
}

function resolveRefreshedSourceKind(
  currentKind: SourceKind,
  recentSqliteCount: number,
  recentJsonCount: number,
): SourceKind {
  const hasSqlite = currentKind === "sqlite" || currentKind === "mixed" || recentSqliteCount > 0;
  const hasJson = currentKind === "json" || currentKind === "mixed" || recentJsonCount > 0;
  return resolveSourceKind(Number(hasSqlite), Number(hasJson));
}

function serializeSnapshot(snapshot: UsageSnapshot): SerializedUsageSnapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    summary: snapshot.summary,
    messages: snapshot.messages,
    heatmap: snapshot.heatmap,
    trendByRange: snapshot.trendByRange,
    breakdownByDate: [...snapshot.breakdownByDate.values()].toSorted((a, b) =>
      a.date.localeCompare(b.date),
    ),
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
      snapshot.breakdownByDate.map((day) => [day.date, normalizeDayBreakdown(day)]),
    ),
  };
}

function readSnapshotCache(dbPath: string, legacyDir: string, codexSessionDirs: string[]) {
  if (!fs.existsSync(SNAPSHOT_CACHE_FILE)) {
    return null;
  }

  try {
    const cached = JSON.parse(
      fs.readFileSync(SNAPSHOT_CACHE_FILE, "utf8"),
    ) as SerializedUsageSnapshot;
    if (cached.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
      return null;
    }
    const missingSessionShape = cached.breakdownByDate.some((day) => !("sessions" in day));
    if (missingSessionShape) {
      return null;
    }
    if (cached.dataFingerprint !== undefined) {
      const currentFingerprint = computeDataFingerprint(dbPath, legacyDir, codexSessionDirs);
      if (cached.dataFingerprint !== currentFingerprint) {
        return null;
      }
    }
    return deserializeSnapshot(cached);
  } catch {
    return null;
  }
}

function writeSnapshotCache(
  snapshot: UsageSnapshot,
  dbPath: string,
  legacyDir: string,
  codexSessionDirs: string[],
) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const serialized: SerializedUsageSnapshot = {
    ...serializeSnapshot(snapshot),
    dataFingerprint: computeDataFingerprint(dbPath, legacyDir, codexSessionDirs),
  };
  fs.writeFileSync(SNAPSHOT_CACHE_FILE, JSON.stringify(serialized), "utf8");
}

export async function loadUsageSnapshot(options?: { forceRefresh?: boolean }) {
  const { dbPath, legacyDir, root, isDefault } = getOpenCodePaths();
  const codex = getCodexPaths();

  logger.debug(
    {
      dbPath,
      legacyDir,
      dbExists: fs.existsSync(dbPath),
      legacyExists: fs.existsSync(legacyDir),
      codexRoot: codex.root,
      codexExists: codex.sessionDirs.some((sessionDir) => fs.existsSync(sessionDir)),
      isDefault,
    },
    "Checking data sources",
  );

  if (!options?.forceRefresh) {
    const cached = readSnapshotCache(dbPath, legacyDir, codex.sessionDirs);
    if (cached) {
      logger.info(
        { source: cached.summary.source, dayCount: cached.breakdownByDate.size, fromCache: true },
        "Loaded usage snapshot from cache",
      );
      return cached;
    }
  }

  const { sqliteMessages, legacyMessages, codexMessages, messages } = await readUsageMessages(
    dbPath,
    legacyDir,
    codex.sessionDirs,
  );

  const sourceKind = resolveSourceKind(
    sqliteMessages.length,
    legacyMessages.length + codexMessages.length,
  );

  const paths = getSnapshotPaths(dbPath, legacyDir, codex.sessionDirs);
  const snapshot = buildSnapshot(messages, sourceKind, paths);

  if (messages.length === 0) {
    logger.warn(
      {
        dataDir: root,
        isDefault,
        dbPath,
        legacyDir,
        dbExists: fs.existsSync(dbPath),
        legacyExists: fs.existsSync(legacyDir),
        codexRoot: codex.root,
        codexExists: codex.sessionDirs.some((sessionDir) => fs.existsSync(sessionDir)),
        hint: isDefault
          ? "Using default paths. Set OPENCODE_DATA_DIR or CODEX_HOME if your data is elsewhere."
          : "Check if OPENCODE_DATA_DIR and CODEX_HOME point to valid data directories",
      },
      "No usage messages found",
    );
  } else {
    logger.info(
      {
        source: sourceKind,
        dataDir: root,
        isDefault,
        messageCount: messages.length,
        sqliteCount: sqliteMessages.length,
        legacyCount: legacyMessages.length,
        codexCount: codexMessages.length,
        dateRange:
          messages.length > 0
            ? `${messages[0].date} ~ ${messages[messages.length - 1].date}`
            : null,
      },
      "Loaded usage messages",
    );
  }

  writeSnapshotCache(snapshot, dbPath, legacyDir, codex.sessionDirs);
  return snapshot;
}

export async function refreshRecentUsageSnapshot(
  baseSnapshot?: UsageSnapshot,
  options?: { now?: Date | number },
) {
  const { dbPath, legacyDir } = getOpenCodePaths();
  const codex = getCodexPaths();
  const snapshot =
    baseSnapshot ??
    readSnapshotCache(dbPath, legacyDir, codex.sessionDirs) ??
    (await loadUsageSnapshot({ forceRefresh: true }));
  const refreshStartDateKey = getFastRefreshStartDateKey(options?.now);
  const refreshStartTimestampMs = dateKeyToUtcStartTimestampMs(refreshStartDateKey);
  const snapshotLastTimestampMs = snapshot.messages.at(-1)?.timestampMs;
  const effectiveRefreshStartTimestampMs =
    snapshotLastTimestampMs !== undefined
      ? Math.min(refreshStartTimestampMs, snapshotLastTimestampMs)
      : refreshStartTimestampMs;
  const {
    sqliteMessages,
    legacyMessages,
    codexMessages,
    messages: recentMessages,
  } = await readUsageMessages(dbPath, legacyDir, codex.sessionDirs, {
    fromTimestampMs: effectiveRefreshStartTimestampMs,
  });

  if (recentMessages.length === 0) {
    return snapshot;
  }

  const historicalMessages = snapshot.messages.filter(
    (message) => message.timestampMs < effectiveRefreshStartTimestampMs,
  );
  const mergedMessages = dedupeMessages([...historicalMessages, ...recentMessages]);
  const refreshedSnapshot = buildSnapshot(
    mergedMessages,
    resolveRefreshedSourceKind(
      snapshot.summary.source.kind,
      sqliteMessages.length,
      legacyMessages.length + codexMessages.length,
    ),
    getSnapshotPaths(dbPath, legacyDir, codex.sessionDirs),
  );

  writeSnapshotCache(refreshedSnapshot, dbPath, legacyDir, codex.sessionDirs);
  return refreshedSnapshot;
}
