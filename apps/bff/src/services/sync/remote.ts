import fs from "node:fs";
import type {
  RemoteUsagePayload,
  RemoteUsageRow,
  TimeRange,
  UsageSyncPushPayload,
} from "@opencode-dashboard/shared";
import { DEFAULT_TIME_ZONE, getPresetDateRange } from "@opencode-dashboard/shared";
import { logger } from "../../logger";
import type { SyncPushState, UsageSnapshot } from "../usage/types";
import { getSyncConfig } from "./config";
import { buildLocalSyncData, selectDaysToPush } from "./local";
import { PUSH_STATE_FILE, REMOTE_CACHE_FILE, SYNC_CACHE_DIR } from "./paths";

const REMOTE_CACHE_STALE_MS = 30 * 60 * 1000;

export interface RemoteUsageResponse {
  machines: { id: string; label: string }[];
  rows: RemoteUsageRow[];
}

export type UsageSyncPushResult =
  | { pushed: false; reason: "disabled" | "unchanged" }
  | { pushed: true; days: number };

function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJsonFile(filePath: string, value: unknown) {
  fs.mkdirSync(SYNC_CACHE_DIR, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value), "utf8");
}

function buildDisabledPayload(): RemoteUsagePayload {
  return {
    enabled: false,
    status: "disabled",
    machines: [],
    rows: [],
    totals: { machines: 0, tokens: 0, pricedTokens: 0, cost: 0, messages: 0 },
  };
}

function summarizeRows(rows: RemoteUsageRow[]) {
  const machineIds = new Set(rows.map((row) => row.machineId));
  return {
    machines: machineIds.size,
    tokens: rows.reduce((sum, row) => sum + row.tokens, 0),
    pricedTokens: rows.reduce((sum, row) => sum + row.pricedTokens, 0),
    cost: Number(rows.reduce((sum, row) => sum + row.cost, 0).toFixed(4)),
    messages: rows.reduce((sum, row) => sum + row.messages, 0),
  };
}

function buildRemotePayload(
  response: RemoteUsageResponse,
  localMachineId: string,
  fetchedAt: string,
  error?: string,
): RemoteUsagePayload {
  const rows = response.rows.filter((row) => row.machineId !== localMachineId);
  const machines = response.machines.filter((machine) =>
    rows.some((row) => row.machineId === machine.id),
  );
  return {
    enabled: true,
    status: error ? "stale" : "fresh",
    machines,
    rows,
    totals: summarizeRows(rows),
    lastFetchedAt: fetchedAt,
    error,
  };
}

async function requestJson<T>(url: string, token: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Sync request failed with HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function pushUsageSnapshot(
  snapshot: UsageSnapshot,
  options?: { force?: boolean },
): Promise<UsageSyncPushResult> {
  const config = getSyncConfig();
  if (!config.enabled || !config.endpoint || !config.token) {
    return { pushed: false, reason: "disabled" };
  }

  const state = readJsonFile<SyncPushState>(PUSH_STATE_FILE) ?? { dayHashes: {} };
  const localData = buildLocalSyncData(snapshot, {
    mode: options?.force || !state.lastPushedAt ? "history" : "window",
  });
  const days = options?.force ? localData.days : selectDaysToPush(localData.days, state.dayHashes);

  if (days.length === 0) {
    return { pushed: false, reason: "unchanged" };
  }

  const payload: UsageSyncPushPayload = {
    schemaVersion: 1,
    machine: config.machine,
    mode: "replace-days",
    generatedAt: localData.generatedAt,
    days,
  };

  await requestJson<{ ok: true }>(`${config.endpoint}/api/sync/push`, config.token, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  writeJsonFile(PUSH_STATE_FILE, {
    dayHashes: Object.fromEntries(localData.days.map((day) => [day.date, day.hash])),
    lastPushedAt: new Date().toISOString(),
  } satisfies SyncPushState);

  return { pushed: true, days: days.length };
}

export async function fetchRemoteUsage(options?: { force?: boolean }) {
  const config = getSyncConfig();
  if (!config.enabled || !config.endpoint || !config.token) {
    return buildDisabledPayload();
  }

  const cached = readJsonFile<RemoteUsagePayload>(REMOTE_CACHE_FILE);
  const now = new Date();
  if (!options?.force && cached?.lastFetchedAt) {
    const age = now.getTime() - new Date(cached.lastFetchedAt).getTime();
    if (age >= 0 && age < REMOTE_CACHE_STALE_MS) {
      return cached;
    }
  }

  try {
    const response = await requestJson<RemoteUsageResponse>(
      `${config.endpoint}/api/sync/usage`,
      config.token,
    );
    const payload = buildRemotePayload(response, config.machine.id, now.toISOString());
    writeJsonFile(REMOTE_CACHE_FILE, payload);
    return payload;
  } catch (error) {
    logger.warn({ err: error }, "Failed to fetch remote usage sync data");
    if (cached) {
      return {
        ...cached,
        status: "stale",
        error: "Remote sync data is stale.",
      } satisfies RemoteUsagePayload;
    }
    const payload: RemoteUsagePayload = {
      ...buildRemotePayload({ machines: [], rows: [] }, config.machine.id, now.toISOString()),
      status: "stale",
      error: "Remote sync data is unavailable.",
    };
    return payload;
  }
}

export function mergeRemoteUsageForDisplay(input: {
  localMachineId: string;
  remote: RemoteUsageResponse;
  fetchedAt: string;
  error?: string;
}) {
  return buildRemotePayload(input.remote, input.localMachineId, input.fetchedAt, input.error);
}

export async function getRemoteUsageForRange(options: {
  range?: TimeRange;
  start?: string;
  end?: string;
  timeZone?: string;
  force?: boolean;
}) {
  const remote = await fetchRemoteUsage({ force: options.force });
  if (!remote.enabled) {
    return remote;
  }

  const bounds =
    options.start || options.end
      ? { start: options.start, end: options.end }
      : getPresetDateRange(options.range ?? "7d", {
          timeZone: options.timeZone ?? DEFAULT_TIME_ZONE,
        });
  const rows = remote.rows.filter(
    (row) => (!bounds.start || row.date >= bounds.start) && (!bounds.end || row.date <= bounds.end),
  );
  const machines = remote.machines.filter((machine) =>
    rows.some((row) => row.machineId === machine.id),
  );
  return {
    ...remote,
    machines,
    rows,
    totals: summarizeRows(rows),
  } satisfies RemoteUsagePayload;
}

export async function syncUsageSnapshot(snapshot: UsageSnapshot) {
  try {
    const result = await pushUsageSnapshot(snapshot);
    if (result.pushed) {
      logger.info({ days: result.days }, "Pushed usage sync snapshot");
    }
  } catch (error) {
    logger.warn({ err: error }, "Failed to push usage sync snapshot");
  }
}
