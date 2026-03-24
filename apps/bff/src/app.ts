import "./env.js";
import { Hono } from "hono";
import type { Context } from "hono";
import { cors } from "hono/cors";
import type { ApiErrorPayload, CostSeriesPayload, ProviderInsightsPayload, TimeRange } from "@opencode-dashboard/shared";
import { invalidatePricingCache } from "./pricing.js";
import { getDateFilteredData, getRangeData, loadUsageSnapshot } from "./usage.js";

const app = new Hono();

let snapshotPromise = loadUsageSnapshot();

function parseRange(value: string | undefined): TimeRange {
  if (value === "month" || value === "3mo" || value === "year") {
    return value;
  }
  return "month";
}

async function readData(c: Context) {
  const snapshot = await snapshotPromise;
  const start = c.req.query("start");
  const end = c.req.query("end");
  if (start || end) {
    return getDateFilteredData(snapshot, start, end);
  }
  return getRangeData(snapshot, parseRange(c.req.query("range")));
}

app.use("/api/*", cors());

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

app.get("/api/day/:date", async (c) => {
  const item = (await readData(c)).byDate.get(c.req.param("date"));
  if (!item) {
    return c.json<ApiErrorPayload>({ error: "No usage found for that date." }, 404);
  }
  return c.json(item);
});

app.post("/api/refresh", async (c) => {
  invalidatePricingCache();
  snapshotPromise = loadUsageSnapshot({ forceRefresh: true });
  const snapshot = await snapshotPromise;
  return c.json({ ok: true, scannedAt: snapshot.summary.scannedAt });
});

export default app;
