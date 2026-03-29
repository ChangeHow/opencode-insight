import { Hono } from "hono";
import type { ApiErrorPayload, ProviderDashboardPayload } from "@opencode-dashboard/shared";
import { readData } from "./shared";

const providers = new Hono();

providers.get("/api/provider/:providerId", async (c) => {
  const data = await readData(c, c.req.param("providerId"));
  const provider = data.providers[0] ?? null;

  if (!provider) {
    return c.json<ApiErrorPayload>({ error: "No usage found for that provider." }, 404);
  }

  return c.json<ProviderDashboardPayload>({
    provider,
    summary: data.summary,
    heatmap: data.heatmap,
    trend: data.trend,
    series: { options: data.seriesOptions, lines: data.seriesLines },
    providers: data.providers,
    selectedDay: null,
  });
});

export { providers };
