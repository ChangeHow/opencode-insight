import { getCurrentTimeZone } from "@opencode-dashboard/shared";
import type {
  CostSeriesPayload,
  DashboardPayload,
  DashboardSummary,
  DayBreakdown,
  HeatmapDay,
  MessageAnalyticsPayload,
  MessageDistributionPayload,
  MessageListPayload,
  MessageOverviewPayload,
  ProviderDashboardPayload,
  ProviderInsightsPayload,
  RemoteSyncActionPayload,
  RemoteUsagePayload,
  SessionDetailBreakdown,
  TimeRange,
  TrendPoint,
} from "@opencode-dashboard/shared";

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

export function fetchDay(
  range: TimeRange,
  date: string,
  customRange?: { start: string; end: string },
) {
  return getJson<DayBreakdown>(`/api/day/${date}${buildQuery(range, customRange)}`);
}

export function fetchSession(sessionId: string) {
  const params = new URLSearchParams({ timeZone: getCurrentTimeZone(), range: "all" });
  return getJson<SessionDetailBreakdown>(`/api/session/${sessionId}?${params.toString()}`);
}

export function fetchSeries(
  range: TimeRange,
  series: string[],
  customRange?: { start: string; end: string },
) {
  return getJson<CostSeriesPayload>(`/api/series${buildQuery(range, customRange, { series })}`);
}

export function fetchProviders(range: TimeRange, customRange?: { start: string; end: string }) {
  return getJson<ProviderInsightsPayload>(`/api/providers${buildQuery(range, customRange)}`);
}

export function fetchProviderDashboard(
  providerId: string,
  range: TimeRange,
  customRange?: { start: string; end: string },
) {
  return getJson<ProviderDashboardPayload>(
    `/api/provider/${encodeURIComponent(providerId)}${buildQuery(range, customRange)}`,
  );
}

export function fetchDashboard(range: TimeRange, customRange?: { start: string; end: string }) {
  return getJson<DashboardPayload>(`/api/dashboard${buildQuery(range, customRange)}`);
}

export function fetchRemoteUsage(range: TimeRange, customRange?: { start: string; end: string }) {
  return getJson<RemoteUsagePayload>(`/api/sync/remote${buildQuery(range, customRange)}`);
}

export async function refreshSnapshot() {
  const params = new URLSearchParams({ timeZone: getCurrentTimeZone() });
  const response = await fetch(`/api/refresh?${params.toString()}`, { method: "POST" });
  if (!response.ok) {
    throw new Error("Failed to refresh snapshot.");
  }
}

export async function forceRemoteSync(
  range: TimeRange,
  customRange?: { start: string; end: string },
) {
  const response = await fetch(`/api/sync/force${buildQuery(range, customRange)}`, {
    method: "POST",
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to force remote sync.");
  }
  return (await response.json()) as RemoteSyncActionPayload;
}

export function fetchMessageOverview(sessionId: string) {
  return getJson<MessageOverviewPayload>(`/api/session/${sessionId}/message/overview`);
}

export function fetchMessageDistribution(sessionId: string) {
  return getJson<MessageDistributionPayload>(`/api/session/${sessionId}/message/distribution`);
}

export function fetchMessageAnalytics(sessionId: string) {
  return getJson<MessageAnalyticsPayload>(`/api/session/${sessionId}/message/analytics`);
}

export function fetchMessages(sessionId: string, page = 0, pageSize = 50) {
  return getJson<MessageListPayload>(
    `/api/session/${sessionId}/message?page=${page}&pageSize=${pageSize}`,
  );
}
