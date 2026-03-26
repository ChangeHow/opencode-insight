import { getCurrentTimeZone } from "@opencode-dashboard/shared";
import type { CostSeriesPayload, DashboardPayload, DashboardSummary, DayBreakdown, HeatmapDay, MessageAnalyticsPayload, MessageDistributionPayload, MessageListPayload, MessageOverviewPayload, ProviderInsightsPayload, SessionBreakdown, TimeRange, TrendPoint } from "@opencode-dashboard/shared";

async function getJson<T>(url: string) {
  const cached = inflightJsonRequests.get(url) as Promise<T> | undefined;
  if (cached) {
    return cached;
  }

  const request = (async () => {
    const response = await fetch(url);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? "Request failed.");
    }
    return (await response.json()) as T;
  })();

  inflightJsonRequests.set(url, request);

  try {
    return await request;
  } finally {
    inflightJsonRequests.delete(url);
  }
}

const inflightJsonRequests = new Map<string, Promise<unknown>>();

function buildQuery(
  range: TimeRange,
  customRange?: { start: string; end: string },
  extra?: Record<string, string[]>,
) {
  const params = new URLSearchParams();
  params.set("timeZone", getCurrentTimeZone());

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

export function fetchSession(range: TimeRange, date: string, sessionId: string, customRange?: { start: string; end: string }) {
  return getJson<SessionBreakdown>(`/api/day/${date}/session/${sessionId}${buildQuery(range, customRange)}`);
}

export function fetchSeries(range: TimeRange, series: string[], customRange?: { start: string; end: string }) {
  return getJson<CostSeriesPayload>(`/api/series${buildQuery(range, customRange, { series })}`);
}

export function fetchProviders(range: TimeRange, customRange?: { start: string; end: string }) {
  return getJson<ProviderInsightsPayload>(`/api/providers${buildQuery(range, customRange)}`);
}

export function fetchDashboard(range: TimeRange, customRange?: { start: string; end: string }) {
  return getJson<DashboardPayload>(`/api/dashboard${buildQuery(range, customRange)}`);
}

export async function refreshSnapshot() {
  const response = await fetch("/api/refresh", { method: "POST" });
  if (!response.ok) {
    throw new Error("Failed to refresh snapshot.");
  }
}

export function fetchMessageOverview(date: string, sessionId: string) {
  return getJson<MessageOverviewPayload>(`/api/day/${date}/session/${sessionId}/message/overview`);
}

export function fetchMessageDistribution(date: string, sessionId: string) {
  return getJson<MessageDistributionPayload>(`/api/day/${date}/session/${sessionId}/message/distribution`);
}

export function fetchMessageAnalytics(date: string, sessionId: string) {
  return getJson<MessageAnalyticsPayload>(`/api/day/${date}/session/${sessionId}/message/analytics`);
}

export function fetchMessages(date: string, sessionId: string, page = 0, pageSize = 50) {
  return getJson<MessageListPayload>(
    `/api/day/${date}/session/${sessionId}/message?page=${page}&pageSize=${pageSize}`,
  );
}
