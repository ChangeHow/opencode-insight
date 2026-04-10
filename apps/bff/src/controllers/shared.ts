import type { Context } from "hono";
import type { TimeRange } from "@opencode-dashboard/shared";
import { resolveTimeZone } from "@opencode-dashboard/shared";
import { getDateFilteredData, getRangeData, loadUsageSnapshot } from "../services/usage/index";

export let snapshotPromise = loadUsageSnapshot();
let refreshPromise: Promise<Awaited<typeof snapshotPromise>> | null = null;

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

export function refreshSnapshot() {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = loadUsageSnapshot({ forceRefresh: true })
    .then((snapshot) => {
      snapshotPromise = Promise.resolve(snapshot);
      return snapshot;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}
