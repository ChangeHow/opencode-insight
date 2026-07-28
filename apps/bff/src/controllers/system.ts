import { Hono } from "hono";
import type { RemoteSyncActionPayload, TimeRange } from "@opencode-dashboard/shared";
import { getMemoryLogs, getMemoryLogsStats, logger } from "../logger";
import { invalidateMessagePayloadCache } from "../services/messages";
import { getRemoteUsageForRange, pushUsageSnapshot } from "../services/sync/remote";
import { forceRefreshSnapshot, refreshSnapshot, snapshotPromise } from "./shared";

function createSystem(getSnapshotPromise = () => snapshotPromise) {
  const system = new Hono();

  system.get("/api/ready", async (c) => {
    const ready = await Promise.race([
      getSnapshotPromise().then(
        () => true,
        () => false,
      ),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 0)),
    ]);
    return c.json({ ready }, ready ? 200 : 503);
  });

  system.get("/api/logs", (c) => {
    const level = c.req.query("level");
    const limit = c.req.query("limit") ? Number(c.req.query("limit")) : 100;
    const search = c.req.query("search");
    const logs = getMemoryLogs({ level, limit, search });
    return c.json({ logs, stats: getMemoryLogsStats() });
  });

  system.post("/api/refresh", async (c) => {
    invalidateMessagePayloadCache();
    const snapshot = await refreshSnapshot();
    return c.json({ ok: true, scannedAt: snapshot.summary.scannedAt });
  });

  system.post("/api/sync/force", async (c) => {
    invalidateMessagePayloadCache();
    const snapshot = await forceRefreshSnapshot();
    const push = await pushUsageSnapshot(snapshot, { force: true }).catch((error) => {
      logger.warn({ err: error }, "Failed to force push usage sync snapshot");
      return {
        pushed: false,
        error: error instanceof Error ? error.message : "Failed to push remote sync data.",
      };
    });
    const remote = await getRemoteUsageForRange({
      range: c.req.query("range") as TimeRange | undefined,
      start: c.req.query("start"),
      end: c.req.query("end"),
      timeZone: c.req.query("timeZone"),
      force: true,
    });

    return c.json<RemoteSyncActionPayload>({
      ok: true,
      scannedAt: snapshot.summary.scannedAt,
      push,
      remote,
    });
  });

  return system;
}

const system = createSystem();

export { createSystem };
export { system };
