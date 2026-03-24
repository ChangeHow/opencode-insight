import type { CostSeriesPayload, DashboardSummary, DayBreakdown, HeatmapDay, ProviderInsightsPayload, TimeRange, TrendPoint } from "@opencode-dashboard/shared";

async function getJson<T>(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Request failed.");
  }
  return (await response.json()) as T;
}

function buildQuery(
  range: TimeRange,
  customRange?: { start: string; end: string },
  extra?: Record<string, string[]>,
) {
  const params = new URLSearchParams();

  if (customRange?.start || customRange?.end) {
    if (customRange.start) params.set("start", customRange.start);
    if (customRange.end) params.set("end", customRange.end);
  } else {
    params.set("range", range);
  }

  if (extra) {
    for (const [key, values] of Object.entries(extra)) {
      for (const value of values) {
        params.append(key, value);
      }
    }
  }

  return `?${params.toString()}`;
}

export function fetchSummary(range: TimeRange, customRange?: { start: string; end: string }) {
  return getJson<DashboardSummary>(`/api/summary${buildQuery(range, customRange)}`);
}

export function fetchHeatmap(range: TimeRange, customRange?: { start: string; end: string }) {
  return getJson<HeatmapDay[]>(`/api/heatmap${buildQuery(range, customRange)}`);
}

export function fetchTrend(range: TimeRange, customRange?: { start: string; end: string }) {
  return getJson<TrendPoint[]>(`/api/trend${buildQuery(range, customRange)}`);
}

export function fetchDay(range: TimeRange, date: string, customRange?: { start: string; end: string }) {
  return getJson<DayBreakdown>(`/api/day/${date}${buildQuery(range, customRange)}`);
}

export function fetchSeries(range: TimeRange, series: string[], customRange?: { start: string; end: string }) {
  return getJson<CostSeriesPayload>(`/api/series${buildQuery(range, customRange, { series })}`);
}

export function fetchProviders(range: TimeRange, customRange?: { start: string; end: string }) {
  return getJson<ProviderInsightsPayload>(`/api/providers${buildQuery(range, customRange)}`);
}

export async function refreshSnapshot() {
  const response = await fetch("/api/refresh", { method: "POST" });
  if (!response.ok) {
    throw new Error("Failed to refresh snapshot.");
  }
}
