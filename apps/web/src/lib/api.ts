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
  SessionInsightPayload,
  OverviewResponse,
  SeriesWindow,
  SourcePage,
  ToolPage,
  TimeRange,
  TrendPoint,
} from "@opencode-dashboard/shared";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function getJson<T>(url: string) {
  const cached = inflightJsonRequests.get(url) as Promise<T> | undefined;
  if (cached) {
    return cached;
  }

  const request = (async () => {
    const response = await fetch(url);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new ApiError(payload?.error ?? "Request failed.", response.status);
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

export function fetchSessionInsight(sessionId: string, after?: number) {
  const query = after === undefined ? "" : `?${new URLSearchParams({ after: String(after) })}`;
  return getJson<SessionInsightPayload>(
    `/api/session/${encodeURIComponent(sessionId)}/insight${query}`,
  );
}

export function fetchSessionInsightOverview(sessionId: string, after?: number) {
  const query = after === undefined ? "" : `?${new URLSearchParams({ after: String(after) })}`;
  return getJson<OverviewResponse>(
    `/api/session/${encodeURIComponent(sessionId)}/insight/overview${query}`,
  );
}

export function fetchSessionInsightSeriesWindow(sessionId: string) {
  return getJson<SeriesWindow>(
    `/api/session/${encodeURIComponent(sessionId)}/insight/series-window`,
  );
}

export function fetchSessionInsightSources(
  sessionId: string,
  scope: "current" | "cumulative",
  options: { kind?: string; cursor?: string } = {},
) {
  const params = new URLSearchParams({ scope, limit: "50" });
  if (options.kind !== undefined) params.set("kind", options.kind);
  if (options.cursor !== undefined) params.set("cursor", options.cursor);
  return getJson<SourcePage>(
    `/api/session/${encodeURIComponent(sessionId)}/insight/sources?${params}`,
  );
}

export function fetchSessionInsightTools(
  sessionId: string,
  options: { group?: string; toolID?: string; cursor?: string } = {},
) {
  const params = new URLSearchParams({ limit: "20" });
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) params.set(key, value);
  }
  return getJson<ToolPage>(`/api/session/${encodeURIComponent(sessionId)}/insight/tools?${params}`);
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
