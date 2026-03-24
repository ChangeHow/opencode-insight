import type { DashboardSummary, DayBreakdown, HeatmapDay, TimeRange, TrendPoint } from "@opencode-dashboard/shared";

async function getJson<T>(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Request failed.");
  }
  return (await response.json()) as T;
}

export function fetchSummary(range: TimeRange) {
  return getJson<DashboardSummary>(`/api/summary?range=${range}`);
}

export function fetchHeatmap(range: TimeRange) {
  return getJson<HeatmapDay[]>(`/api/heatmap?range=${range}`);
}

export function fetchTrend(range: TimeRange) {
  return getJson<TrendPoint[]>(`/api/trend?range=${range}`);
}

export function fetchDay(range: TimeRange, date: string) {
  return getJson<DayBreakdown>(`/api/day/${date}?range=${range}`);
}

export async function refreshSnapshot() {
  const response = await fetch("/api/refresh", { method: "POST" });
  if (!response.ok) {
    throw new Error("Failed to refresh snapshot.");
  }
}
