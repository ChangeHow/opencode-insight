import { Hono } from "hono";
import { getMemoryLogs, getMemoryLogsStats } from "../logger";
import { invalidateMessagePayloadCache } from "../services/messages";
import { refreshSnapshot } from "./shared";

const system = new Hono();

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

export { system };
