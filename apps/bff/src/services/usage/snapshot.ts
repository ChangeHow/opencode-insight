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
import { readLegacyMessages } from "./legacy-reader";
import { buildSnapshot } from "./day-map";
import { emptyBreakdown, totalTokens, readSqliteMessages } from "./sqlite-reader";
import type { RawMessage, SerializedUsageSnapshot, SourceKind, UsageSnapshot } from "./types";

const CACHE_DIR = path.join(process.cwd(), ".cache", "opencode-telescope");
const SNAPSHOT_CACHE_FILE = path.join(CACHE_DIR, "usage-snapshot.json");
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

export function computeDataFingerprint(dbPath: string, legacyDir: string): string {
  const parts: string[] = [];
  if (fs.existsSync(dbPath)) {
    const stat = fs.statSync(dbPath);
    parts.push(`db:${stat.ino}:${stat.size}`);
  }
  if (fs.existsSync(legacyDir)) {
    const stat = fs.statSync(legacyDir);
    parts.push(`legacy:${stat.ino}:${Math.trunc(stat.mtimeMs)}`);
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
  options?: { fromTimestampMs?: number },
) {
  const sqliteMessages = await readSqliteMessages(dbPath, options);
  const legacyMessages = readLegacyMessages(legacyDir, options);
  return {
    sqliteMessages,
    legacyMessages,
    messages: await enrichMessages(dedupeMessages([...sqliteMessages, ...legacyMessages])),
  };
}

function getSnapshotPaths(dbPath: string, legacyDir: string) {
  return [dbPath, legacyDir].filter((currentPath) => fs.existsSync(currentPath));
}

function resolveRefreshedSourceKind(
  currentKind: SourceKind,
  recentSqliteCount: number,
  recentLegacyCount: number,
): SourceKind {
  if (currentKind !== "none") {
    return currentKind;
  }

  if (recentSqliteCount > 0 && recentLegacyCount > 0) {
    return "mixed";
  }

  if (recentSqliteCount > 0) {
    return "sqlite";
  }

  if (recentLegacyCount > 0) {
    return "json";
  }

  return "none";
}

function serializeSnapshot(snapshot: UsageSnapshot): SerializedUsageSnapshot {
  return {
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

function readSnapshotCache(dbPath: string, legacyDir: string) {
  if (!fs.existsSync(SNAPSHOT_CACHE_FILE)) {
    return null;
  }

  try {
    const cached = JSON.parse(
      fs.readFileSync(SNAPSHOT_CACHE_FILE, "utf8"),
    ) as SerializedUsageSnapshot;
    const missingSessionShape = cached.breakdownByDate.some((day) => !("sessions" in day));
    if (missingSessionShape) {
      return null;
    }
    if (cached.dataFingerprint !== undefined) {
      const currentFingerprint = computeDataFingerprint(dbPath, legacyDir);
      if (cached.dataFingerprint !== currentFingerprint) {
        return null;
      }
    }
    return deserializeSnapshot(cached);
  } catch {
    return null;
  }
}

function writeSnapshotCache(snapshot: UsageSnapshot, dbPath: string, legacyDir: string) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const serialized: SerializedUsageSnapshot = {
    ...serializeSnapshot(snapshot),
    dataFingerprint: computeDataFingerprint(dbPath, legacyDir),
  };
  fs.writeFileSync(SNAPSHOT_CACHE_FILE, JSON.stringify(serialized), "utf8");
}

export async function loadUsageSnapshot(options?: { forceRefresh?: boolean }) {
  const { dbPath, legacyDir, root, isDefault } = getOpenCodePaths();

  logger.debug(
    {
      dbPath,
      legacyDir,
      dbExists: fs.existsSync(dbPath),
      legacyExists: fs.existsSync(legacyDir),
      isDefault,
    },
    "Checking data sources",
  );

  if (!options?.forceRefresh) {
    const cached = readSnapshotCache(dbPath, legacyDir);
    if (cached) {
      logger.info(
        { source: cached.summary.source, dayCount: cached.breakdownByDate.size, fromCache: true },
        "Loaded usage snapshot from cache",
      );
      return cached;
    }
  }

  const { sqliteMessages, legacyMessages, messages } = await readUsageMessages(dbPath, legacyDir);

  const sourceKind: SourceKind =
    sqliteMessages.length > 0 && legacyMessages.length > 0
      ? "mixed"
      : sqliteMessages.length > 0
        ? "sqlite"
        : legacyMessages.length > 0
          ? "json"
          : "none";

  const paths = getSnapshotPaths(dbPath, legacyDir);
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
        hint: isDefault
          ? "Using default path. Set OPENCODE_DATA_DIR if your data is elsewhere."
          : "Check if OPENCODE_DATA_DIR points to a valid opencode data directory",
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
        dateRange:
          messages.length > 0
            ? `${messages[0].date} ~ ${messages[messages.length - 1].date}`
            : null,
      },
      "Loaded usage messages",
    );
  }

  writeSnapshotCache(snapshot, dbPath, legacyDir);
  return snapshot;
}

export async function refreshRecentUsageSnapshot(
  baseSnapshot?: UsageSnapshot,
  options?: { now?: Date | number },
) {
  const { dbPath, legacyDir } = getOpenCodePaths();
  const snapshot =
    baseSnapshot ??
    readSnapshotCache(dbPath, legacyDir) ??
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
    messages: recentMessages,
  } = await readUsageMessages(dbPath, legacyDir, {
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
      legacyMessages.length,
    ),
    getSnapshotPaths(dbPath, legacyDir),
  );

  writeSnapshotCache(refreshedSnapshot, dbPath, legacyDir);
  return refreshedSnapshot;
}
