import type { Context } from "hono";
import type { TimeRange } from "@opencode-dashboard/shared";
import { resolveTimeZone } from "@opencode-dashboard/shared";
import {
  getDateFilteredData,
  getRangeData,
  getUsageDataFingerprint,
  loadUsageSnapshot,
  refreshUsageSnapshotToday,
} from "../services/usage/index";

export let snapshotPromise = loadUsageSnapshot();
let refreshPromise: Promise<Awaited<typeof snapshotPromise>> | null = null;
let isRebuilding = false;

export function resetSnapshotPromise(promise = loadUsageSnapshot()) {
  snapshotPromise = promise;
}

export function parseRange(value: string | undefined): TimeRange {
  if (value === "7d" || value === "month" || value === "3mo" || value === "year") {
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

export function refreshSnapshot(options?: { timeZone?: string }) {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const current = await Promise.resolve(snapshotPromise).catch(() => null);
    if (current?.dataFingerprint === getUsageDataFingerprint()) {
      return current;
    }

    const snapshot = current
      ? await refreshUsageSnapshotToday(current, options)
      : await loadUsageSnapshot({ forceRefresh: true });
    snapshotPromise = Promise.resolve(snapshot);

    if (current && !isRebuilding) {
      isRebuilding = true;
      loadUsageSnapshot({ forceRefresh: true })
        .then((rebuilt) => {
          snapshotPromise = Promise.resolve(rebuilt);
        })
        .catch(() => {
          /* silently fail, keep incremental snapshot */
        })
        .finally(() => {
          isRebuilding = false;
        });
    }

    return snapshot;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}
