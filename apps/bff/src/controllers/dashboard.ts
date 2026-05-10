import { Hono } from "hono";
import type {
  CostSeriesPayload,
  DashboardPayload,
  ProviderInsightsPayload,
  TimeRange,
} from "@opencode-dashboard/shared";
import { getRemoteUsageForRange } from "../services/sync/remote";
import { readData } from "./shared";

const dashboard = new Hono();
const DASHBOARD_SERIES_LIMIT = 10;

function hasSeriesValue(option: { totalCost: number; totalTokens: number; totalMessages: number }) {
  return option.totalCost > 0 || option.totalTokens > 0 || option.totalMessages > 0;
}

function getDashboardSeries(data: Awaited<ReturnType<typeof readData>>) {
  const options = data.seriesOptions.filter(hasSeriesValue).slice(0, DASHBOARD_SERIES_LIMIT);
  const keys = new Set(options.map((option) => option.key));
  return {
    options,
    lines: data.seriesLines.filter((line) => keys.has(line.key)),
  };
}

dashboard.get("/api/summary", async (c) => c.json((await readData(c)).summary));
dashboard.get("/api/heatmap", async (c) => c.json((await readData(c)).heatmap));
dashboard.get("/api/trend", async (c) => c.json((await readData(c)).trend));

dashboard.get("/api/series", async (c) => {
  const data = await readData(c);
  const requested = c.req.queries("series") ?? [];
  const lines =
    requested.length > 0
      ? data.seriesLines.filter((line) => requested.includes(line.key))
      : data.seriesLines;

  return c.json<CostSeriesPayload>({
    options: data.seriesOptions,
    lines,
  });
});

dashboard.get("/api/providers", async (c) => {
  const data = await readData(c);
  return c.json<ProviderInsightsPayload>({ summary: data.summary, providers: data.providers });
});

function getRemoteUsageQuery(c: { req: { query: (name: string) => string | undefined } }) {
  return {
    range: c.req.query("range") as TimeRange | undefined,
    start: c.req.query("start"),
    end: c.req.query("end"),
    timeZone: c.req.query("timeZone"),
  };
}

dashboard.get("/api/dashboard", async (c) => {
  const data = await readData(c);
  const series = getDashboardSeries(data);
  return c.json<DashboardPayload>({
    summary: data.summary,
    heatmap: data.heatmap,
    trend: data.trend,
    series,
    providers: data.providers,
    selectedDay: null,
    remoteSync: undefined,
  });
});

dashboard.get("/api/sync/remote", async (c) =>
  c.json(await getRemoteUsageForRange(getRemoteUsageQuery(c))),
);

export { dashboard };
