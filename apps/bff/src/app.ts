import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ApiErrorPayload, TimeRange } from "@opencode-dashboard/shared";
import { getRangeData, loadUsageSnapshot } from "./usage.js";

const app = new Hono();

let snapshot = loadUsageSnapshot();

function parseRange(value: string | undefined): TimeRange {
  if (value === "7d" || value === "30d" || value === "90d") {
    return value;
  }
  return "30d";
}

app.use("/api/*", cors());

app.get("/api/summary", (c) => {
  const range = parseRange(c.req.query("range"));
  return c.json(getRangeData(snapshot, range).summary);
});

app.get("/api/heatmap", (c) => {
  const range = parseRange(c.req.query("range"));
  return c.json(getRangeData(snapshot, range).heatmap);
});

app.get("/api/trend", (c) => {
  const range = parseRange(c.req.query("range"));
  return c.json(getRangeData(snapshot, range).trend);
});

app.get("/api/day/:date", (c) => {
  const range = parseRange(c.req.query("range"));
  const item = getRangeData(snapshot, range).byDate.get(c.req.param("date"));
  if (!item) {
    return c.json<ApiErrorPayload>({ error: "No usage found for that date." }, 404);
  }
  return c.json(item);
});

app.post("/api/refresh", (c) => {
  snapshot = loadUsageSnapshot();
  return c.json({ ok: true, scannedAt: snapshot.summary.scannedAt });
});

export default app;
