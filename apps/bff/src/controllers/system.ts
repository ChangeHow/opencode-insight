import { Hono } from "hono";
import type { RemoteSyncActionPayload, TimeRange } from "@opencode-dashboard/shared";
import { getMemoryLogs, getMemoryLogsStats, logger } from "../logger";
import { invalidateMessagePayloadCache } from "../services/messages";
import { getRemoteUsageForRange, pushUsageSnapshot } from "../services/sync/remote";
import { forceRefreshSnapshot, refreshSnapshot, snapshotPromise } from "./shared";

const API_INDEX = {
  name: "opencode-telescope",
  version: 1,
  docs: "Every endpoint accepts `timeZone` (IANA name). Ranges: 7d | month | 3mo | year | all. Pass `start`/`end` (YYYY-MM-DD) instead of `range` for a custom window.",
  endpoints: [
    { method: "GET", path: "/api", description: "This API index." },
    {
      method: "GET",
      path: "/api/summary",
      description: "Totals, streaks, top model, best day for the range.",
    },
    {
      method: "GET",
      path: "/api/heatmap",
      description: "Per-day usage with token breakdown and intensity.",
    },
    {
      method: "GET",
      path: "/api/trend",
      description: "Per-day tokens/cost/messages trend points.",
    },
    {
      method: "GET",
      path: "/api/series",
      description:
        "Per-model series options and daily lines. Filter lines with repeated `?series=<key>`.",
    },
    {
      method: "GET",
      path: "/api/dashboard",
      description: "Consolidated dashboard payload (summary + heatmap + trend + series).",
    },
    { method: "GET", path: "/api/providers", description: "Per-provider insights with trend." },
    {
      method: "GET",
      path: "/api/provider/:providerId",
      description: "Dashboard payload scoped to one provider.",
    },
    {
      method: "GET",
      path: "/api/day/:date",
      description: "Breakdown of one day (models, sessions).",
    },
    { method: "GET", path: "/api/session/:sessionId", description: "Session summary." },
    {
      method: "GET",
      path: "/api/session/:sessionId/message",
      description: "Message list for a session.",
    },
    {
      method: "GET",
      path: "/api/session/:sessionId/message/overview",
      description: "Message overview metrics.",
    },
    {
      method: "GET",
      path: "/api/session/:sessionId/message/analytics",
      description: "Message analytics.",
    },
    {
      method: "GET",
      path: "/api/session/:sessionId/message/distribution",
      description: "Message token distribution.",
    },
    { method: "GET", path: "/api/sync/remote", description: "Remote machines usage rows." },
    { method: "POST", path: "/api/refresh", description: "Incremental snapshot refresh." },
    {
      method: "POST",
      path: "/api/sync/force",
      description: "Full rescan and forced remote sync push.",
    },
    {
      method: "GET",
      path: "/api/logs",
      description: "Recent in-memory logs. Filter with `level`, `limit`, `search`.",
    },
    {
      method: "GET",
      path: "/api/ready",
      description: "Readiness probe (503 until the first snapshot is loaded).",
    },
  ],
  cli: {
    name: "opendash",
    commands: ["opendash summary", "opendash models", "opendash daily", "opendash providers"],
    flags: "--range 7d|month|3mo|year|all | --start/--end YYYY-MM-DD | --json | --url <base>",
  },
} as const;

function createSystem(getSnapshotPromise = () => snapshotPromise) {
  const system = new Hono();

  system.get("/api", (c) => c.json(API_INDEX));

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
