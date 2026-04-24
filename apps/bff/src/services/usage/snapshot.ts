import fs from "node:fs";
import path from "node:path";
import type { DayBreakdown } from "@opencode-dashboard/shared";
import { formatDateInTimeZone, resolveTimeZone, shiftDateKey } from "@opencode-dashboard/shared";
import { logger } from "../../logger";
import { estimateUsageCostFromDataset, getPricingDataset } from "../pricing";
import { readLegacyMessages } from "./legacy-reader";
import { buildSnapshot } from "./day-map";
import {
  emptyBreakdown,
  readSqliteMessages,
  readSqliteMessagesInWindow,
  totalTokens,
} from "./sqlite-reader";
import type { RawMessage, SerializedUsageSnapshot, SourceKind, UsageSnapshot } from "./types";

const CACHE_DIR = path.join(process.cwd(), ".cache", "opencode-telescope");
const SNAPSHOT_CACHE_FILE = path.join(CACHE_DIR, "usage-snapshot.json");
const PROVIDER_ALIASES: Record<string, string> = {
  zhipu: "zai-coding-plan",
  glm: "zai-coding-plan",
  zai: "zai-coding-plan",
  "z.ai": "zai-coding-plan",
  bigmodel: "zai-coding-plan",
};

interface RefreshWindow {
  date: string;
  timeZone: string;
  startMs: number;
  endMs: number;
}

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

function parseDateKeyParts(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function getTimeZoneParts(value: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function zonedDateTimeToUtcMs(
  target: {
    year: number;
    month: number;
    day: number;
    hour?: number;
    minute?: number;
    second?: number;
  },
  timeZone: string,
) {
  const targetUtc = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour ?? 0,
    target.minute ?? 0,
    target.second ?? 0,
  );
  let utc = targetUtc;
  for (let index = 0; index < 3; index++) {
    const parts = getTimeZoneParts(utc, timeZone);
    const localAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const delta = targetUtc - localAsUtc;
    if (delta === 0) {
      break;
    }
    utc += delta;
  }
  return utc;
}

function getTodayRefreshWindow(timeZone?: string): RefreshWindow {
  const resolvedTimeZone = resolveTimeZone(timeZone);
  const date = formatDateInTimeZone(Date.now(), resolvedTimeZone);
  const startParts = parseDateKeyParts(date);
  const endParts = parseDateKeyParts(shiftDateKey(date, 1));
  return {
    date,
    timeZone: resolvedTimeZone,
    startMs: zonedDateTimeToUtcMs(startParts, resolvedTimeZone),
    endMs: zonedDateTimeToUtcMs(endParts, resolvedTimeZone),
  };
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

function readSnapshotCache(dbPath: string, legacyDir: string, currentFingerprint: string) {
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
    if (cached.dataFingerprint !== currentFingerprint) {
      return null;
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
  const dataFingerprint = computeDataFingerprint(dbPath, legacyDir);

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
    const cached = readSnapshotCache(dbPath, legacyDir, dataFingerprint);
    if (cached) {
      logger.info(
        { source: cached.summary.source, dayCount: cached.breakdownByDate.size, fromCache: true },
        "Loaded usage snapshot from cache",
      );
      return cached;
    }
  }

  const sqliteMessages = await readSqliteMessages(dbPath);
  const legacyMessages = readLegacyMessages(legacyDir);
  const messages = await enrichMessages(dedupeMessages([...sqliteMessages, ...legacyMessages]));

  const sourceKind: SourceKind =
    sqliteMessages.length > 0 && legacyMessages.length > 0
      ? "mixed"
      : sqliteMessages.length > 0
        ? "sqlite"
        : legacyMessages.length > 0
          ? "json"
          : "none";

  const paths = [dbPath, legacyDir].filter((currentPath) => fs.existsSync(currentPath));
  const snapshot = {
    ...buildSnapshot(messages, sourceKind, paths),
    dataFingerprint,
  };

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

export async function refreshUsageSnapshotToday(
  current: UsageSnapshot,
  options?: { timeZone?: string },
) {
  const { dbPath, legacyDir } = getOpenCodePaths();
  const dataFingerprint = computeDataFingerprint(dbPath, legacyDir);
  const window = getTodayRefreshWindow(options?.timeZone);
  const sqliteMessages = await readSqliteMessagesInWindow(dbPath, window.startMs, window.endMs);
  const legacyMessages = readLegacyMessages(legacyDir, window);
  const refreshedMessages = await enrichMessages(
    dedupeMessages([...sqliteMessages, ...legacyMessages]),
  );
  const retainedMessages = current.messages.filter(
    (message) => message.timestampMs < window.startMs || message.timestampMs >= window.endMs,
  );
  const messages = dedupeMessages([...retainedMessages, ...refreshedMessages]);
  const paths = [dbPath, legacyDir].filter((currentPath) => fs.existsSync(currentPath));
  const sourceKind: SourceKind =
    current.summary.source.kind !== "none"
      ? current.summary.source.kind
      : sqliteMessages.length > 0
        ? "sqlite"
        : legacyMessages.length > 0
          ? "json"
          : "none";
  const snapshot = {
    ...buildSnapshot(messages, sourceKind, paths),
    dataFingerprint,
  };

  logger.info(
    {
      date: window.date,
      timeZone: window.timeZone,
      refreshedMessages: refreshedMessages.length,
      retainedMessages: retainedMessages.length,
    },
    "Refreshed today's usage messages",
  );

  writeSnapshotCache(snapshot, dbPath, legacyDir);
  return snapshot;
}

export function getUsageDataFingerprint() {
  const { dbPath, legacyDir } = getOpenCodePaths();
  return computeDataFingerprint(dbPath, legacyDir);
}
