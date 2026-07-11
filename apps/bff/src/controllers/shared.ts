import type { Context } from "hono";
import type { TimeRange } from "@opencode-dashboard/shared";
import { resolveTimeZone } from "@opencode-dashboard/shared";
import { logger } from "../logger";
import { syncUsageSnapshot } from "../services/sync/remote";
import {
  getDateFilteredData,
  getRangeData,
  loadUsageSnapshot,
  refreshRecentUsageSnapshot,
} from "../services/usage/index";

export let snapshotPromise = Promise.resolve(loadUsageSnapshot()).then((snapshot) => {
  void syncUsageSnapshot(snapshot);
  return snapshot;
});
let refreshPromise: Promise<Awaited<typeof snapshotPromise>> | null = null;
let backgroundRefreshPromise: Promise<Awaited<typeof snapshotPromise>> | null = null;

export function parseRange(value: string | undefined): TimeRange {
  if (
    value === "7d" ||
    value === "month" ||
    value === "3mo" ||
    value === "year" ||
    value === "all"
  ) {
    return value;
  }
  return "7d";
}

export async function readData(c: Context, providerId?: string) {
  const snapshot = await snapshotPromise;
  const start = c.req.query("start");
  const end = c.req.query("end");
  const timeZone = resolveTimeZone(c.req.query("timeZone"));
  if (start || end) {
    return getDateFilteredData(snapshot, start, end, [], timeZone, providerId);
  }
  return getRangeData(snapshot, parseRange(c.req.query("range")), [], timeZone, providerId);
}

export function refreshSnapshot() {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = Promise.resolve(snapshotPromise)
    .catch(() => undefined)
    .then((snapshot) => refreshRecentUsageSnapshot(snapshot))
    .catch(async (error) => {
      logger.warn({ err: error }, "Fast refresh failed, falling back to full refresh");
      return loadUsageSnapshot({ forceRefresh: true });
    })
    .then((snapshot) => {
      snapshotPromise = Promise.resolve(snapshot);
      void syncUsageSnapshot(snapshot);
      void scheduleBackgroundRefresh();
      return snapshot;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

export async function forceRefreshSnapshot() {
  const snapshot = await loadUsageSnapshot({ forceRefresh: true });
  snapshotPromise = Promise.resolve(snapshot);
  return snapshot;
}

function scheduleBackgroundRefresh() {
  if (backgroundRefreshPromise) {
    return backgroundRefreshPromise;
  }

  backgroundRefreshPromise = loadUsageSnapshot({ forceRefresh: true })
    .then((snapshot) => {
      snapshotPromise = Promise.resolve(snapshot);
      void syncUsageSnapshot(snapshot);
      return snapshot;
    })
    .catch((error) => {
      logger.error({ err: error }, "Background refresh validation failed");
      return snapshotPromise;
    })
    .finally(() => {
      backgroundRefreshPromise = null;
    });

  return backgroundRefreshPromise;
}
