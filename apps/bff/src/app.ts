import "./env.js";
import { Hono } from "hono";
import type { Context } from "hono";
import { cors } from "hono/cors";
import { resolveTimeZone } from "@opencode-dashboard/shared";
import type { ApiErrorPayload, CostSeriesPayload, DashboardPayload, MessageAnalyticsPayload, ProviderInsightsPayload, TimeRange } from "@opencode-dashboard/shared";
import { logger, requestLogger } from "./middleware/logger.js";
import { getMemoryLogs, getMemoryLogsStats } from "./logger.js";
import { invalidatePricingCache } from "./pricing.js";
import { getDateFilteredData, getRangeData, loadUsageSnapshot } from "./usage.js";
import { buildMessagePayloads, getDbPath, invalidateMessagePayloadCache } from "./messages.js";

const app = new Hono();

let snapshotPromise = loadUsageSnapshot();

function parseRange(value: string | undefined): TimeRange {
  if (value === "7d" || value === "month" || value === "3mo" || value === "year") {
    return value;
  }
  return "7d";
}

async function readData(c: Context) {
  const snapshot = await snapshotPromise;
  const start = c.req.query("start");
  const end = c.req.query("end");
  const timeZone = resolveTimeZone(c.req.query("timeZone"));
  if (start || end) {
    return getDateFilteredData(snapshot, start, end, [], timeZone);
  }
  return getRangeData(snapshot, parseRange(c.req.query("range")), [], timeZone);
}

app.use("/api/*", cors());
app.use("*", requestLogger());

app.get("/api/logs", (c) => {
  const level = c.req.query("level");
  const limit = c.req.query("limit") ? Number(c.req.query("limit")) : 100;
  const search = c.req.query("search");
  const logs = getMemoryLogs({ level, limit, search });
  return c.json({ logs, stats: getMemoryLogsStats() });
});

app.get("/api/summary", async (c) => {
  return c.json((await readData(c)).summary);
});

app.get("/api/heatmap", async (c) => {
  return c.json((await readData(c)).heatmap);
});

app.get("/api/trend", async (c) => {
  return c.json((await readData(c)).trend);
});

app.get("/api/series", async (c) => {
  const data = await readData(c);
  const requested = c.req.queries("series") ?? [];
  const lines = requested.length > 0
    ? data.seriesLines.filter((line) => requested.includes(line.key))
    : data.seriesLines;

  return c.json<CostSeriesPayload>({
    options: data.seriesOptions,
    lines,
  });
});

app.get("/api/providers", async (c) => {
  const data = await readData(c);
  return c.json<ProviderInsightsPayload>({
    providers: data.providers,
  });
});

app.get("/api/dashboard", async (c) => {
  const data = await readData(c);
  return c.json<DashboardPayload>({
    summary: data.summary,
    heatmap: data.heatmap,
    trend: data.trend,
    series: {
      options: data.seriesOptions,
      lines: data.seriesLines,
    },
    providers: data.providers,
    selectedDay: null,
  });
});

app.get("/api/day/:date", async (c) => {
  const item = (await readData(c)).byDate.get(c.req.param("date"));
  if (!item) {
    return c.json<ApiErrorPayload>({ error: "No usage found for that date." }, 404);
  }
  return c.json(item);
});

app.get("/api/day/:date/session/:sessionId", async (c) => {
  const day = (await readData(c)).byDate.get(c.req.param("date"));
  if (!day) {
    return c.json<ApiErrorPayload>({ error: "No usage found for that date." }, 404);
  }

  const session = day.sessions.find((item) => item.sessionId === c.req.param("sessionId"));
  if (!session) {
    return c.json<ApiErrorPayload>({ error: "No session found for that date." }, 404);
  }

  return c.json(session);
});

app.post("/api/refresh", async (c) => {
  invalidatePricingCache();
  invalidateMessagePayloadCache();
  snapshotPromise = loadUsageSnapshot({ forceRefresh: true });
  const snapshot = await snapshotPromise;
  return c.json({ ok: true, scannedAt: snapshot.summary.scannedAt });
});

// --- Message-level analytics endpoints ---

app.get("/api/day/:date/session/:sessionId/message/analytics", (c) => {
  const { sessionId } = c.req.param();
  const dbPath = getDbPath();
  const { overview, distribution } = buildMessagePayloads(dbPath, sessionId);
  return c.json<MessageAnalyticsPayload>({ overview, distribution });
});

app.get("/api/day/:date/session/:sessionId/message/overview", (c) => {
  const { sessionId } = c.req.param();
  const dbPath = getDbPath();
  const { overview } = buildMessagePayloads(dbPath, sessionId);
  return c.json(overview);
});

app.get("/api/day/:date/session/:sessionId/message/distribution", (c) => {
  const { sessionId } = c.req.param();
  const dbPath = getDbPath();
  const { distribution } = buildMessagePayloads(dbPath, sessionId);
  return c.json(distribution);
});

app.get("/api/day/:date/session/:sessionId/message", (c) => {
  const { sessionId } = c.req.param();
  const page = Math.max(0, Number(c.req.query("page") ?? 0));
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query("pageSize") ?? 50)));
  const dbPath = getDbPath();
  const { listFn } = buildMessagePayloads(dbPath, sessionId);
  return c.json(listFn(page, pageSize));
});

export default app;
