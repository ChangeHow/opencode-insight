import fs from "node:fs";
import path from "node:path";
import {
  dateKeyToUtcNoon,
  DEFAULT_TIME_ZONE,
  formatDateInTimeZone,
  shiftDateKey,
} from "@opencode-dashboard/shared";
import { logger } from "../../logger";
import { estimateUsageCostFromDataset, getPricingDataset } from "../pricing";
import { getCodexPaths, readCodexMessages } from "./codex-reader";
import { readLegacyMessages } from "./legacy-reader";
import {
  flushSnapshotCacheWrites,
  readSnapshotCache,
  scheduleSnapshotCacheWrite,
  withDataFingerprint,
} from "./snapshot-cache";
import { buildIncrementalSnapshot, buildSnapshot } from "./snapshot-builder";
import { totalTokens, readSqliteMessages } from "./sqlite-reader";
import type { RawMessage, SourceKind, UsageSnapshot } from "./types";

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
      if (cached.fresh) {
        logger.info(
          {
            source: cached.snapshot.summary.source,
            dayCount: cached.snapshot.breakdownByDate.size,
            fromCache: true,
          },
          "Loaded usage snapshot from cache",
        );
        return cached.snapshot;
      }
      logger.info("Usage snapshot cache is stale; rebuilding from source");
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
  const snapshot = withDataFingerprint(
    buildSnapshot(messages, sourceKind, paths),
    dbPath,
    legacyDir,
    codex.sessionDirs,
  );

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

  scheduleSnapshotCacheWrite(snapshot);
  return snapshot;
}

export async function refreshRecentUsageSnapshot(
  baseSnapshot?: UsageSnapshot,
  options?: { now?: Date | number },
) {
  const { dbPath, legacyDir } = getOpenCodePaths();
  const codex = getCodexPaths();
  const cached = baseSnapshot ? null : readSnapshotCache(dbPath, legacyDir, codex.sessionDirs);
  const snapshot =
    baseSnapshot ??
    (cached?.fresh ? cached.snapshot : undefined) ??
    (await loadUsageSnapshot({ forceRefresh: true }));
  const refreshStartDateKey = getFastRefreshStartDateKey(options?.now);
  const refreshStartTimestampMs = dateKeyToUtcStartTimestampMs(refreshStartDateKey);
  const snapshotLastDateKey = snapshot.messages.at(-1)?.date;
  const snapshotLastDateStartTimestampMs = snapshotLastDateKey
    ? dateKeyToUtcStartTimestampMs(snapshotLastDateKey)
    : undefined;
  const effectiveRefreshStartTimestampMs =
    snapshotLastDateStartTimestampMs !== undefined
      ? Math.min(refreshStartTimestampMs, snapshotLastDateStartTimestampMs)
      : refreshStartTimestampMs;
  const {
    sqliteMessages,
    legacyMessages,
    codexMessages,
    messages: recentMessages,
  } = await readUsageMessages(dbPath, legacyDir, codex.sessionDirs, {
    fromTimestampMs: effectiveRefreshStartTimestampMs,
  });

  const refreshedSnapshot = withDataFingerprint(
    buildIncrementalSnapshot(
      snapshot,
      recentMessages,
      effectiveRefreshStartTimestampMs,
      resolveRefreshedSourceKind(
        snapshot.summary.source.kind,
        sqliteMessages.length,
        legacyMessages.length + codexMessages.length,
      ),
      getSnapshotPaths(dbPath, legacyDir, codex.sessionDirs),
    ),
    dbPath,
    legacyDir,
    codex.sessionDirs,
  );

  scheduleSnapshotCacheWrite(refreshedSnapshot);
  return refreshedSnapshot;
}

export { flushSnapshotCacheWrites };
