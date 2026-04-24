import { vi, describe, test, expect, beforeEach } from "vitest";
import {
  makeUsageSnapshot,
  makeRangeData,
  makeDayBreakdown,
  makeSessionBreakdown,
  makeProviderInsight,
} from "./factories";

vi.mock("../services/usage/index.js", () => ({
  loadUsageSnapshot: vi.fn(),
  getUsageDataFingerprint: vi.fn(() => "test-fingerprint"),
  refreshUsageSnapshotToday: vi.fn(),
  getRangeData: vi.fn(),
  getDateFilteredData: vi.fn(),
}));

vi.mock("../services/messages.js", () => ({
  buildMessagePayloads: vi.fn(),
  getDbPath: vi.fn(() => "/tmp/opencode.db"),
  invalidateMessagePayloadCache: vi.fn(),
}));

import app from "../app";
import { clearMemoryLogs, getMemoryLogs } from "../logger";
import { loadUsageSnapshot, getRangeData, getDateFilteredData } from "../services/usage/index";
import { buildMessagePayloads, invalidateMessagePayloadCache } from "../services/messages";

const mockLoadUsageSnapshot = vi.mocked(loadUsageSnapshot);
const mockGetRangeData = vi.mocked(getRangeData);
const mockGetDateFilteredData = vi.mocked(getDateFilteredData);
const mockBuildMessagePayloads = vi.mocked(buildMessagePayloads);
const mockInvalidateMessagePayloadCache = vi.mocked(invalidateMessagePayloadCache);
const timeZone = "Asia/Shanghai";

describe("BFF API Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMemoryLogs();
    const snapshot = makeUsageSnapshot();
    mockLoadUsageSnapshot.mockResolvedValue(snapshot);
    mockGetRangeData.mockReturnValue(makeRangeData());
    mockGetDateFilteredData.mockReturnValue(makeRangeData());
    mockBuildMessagePayloads.mockResolvedValue({
      overview: { timeline: [], toolUsage: [], totalMessages: 0 },
      distribution: { points: [], totalMessages: 0 },
      listFn: (page, pageSize) => ({ messages: [], total: 0, page, pageSize }),
    });
  });

  test("GET /api/summary returns summary JSON when requested", async () => {
    const rangeData = makeRangeData();
    mockGetRangeData.mockReturnValue(rangeData);

    const res = await app.request(`/api/summary?range=month&timeZone=${timeZone}`);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(rangeData.summary);
  });

  test("request logs include rich request context", async () => {
    const res = await app.request(`/api/summary?range=month&timeZone=${timeZone}`, {
      headers: {
        "content-length": "128",
        referer: "http://localhost:3000/overview",
        "user-agent": "vitest-agent",
        "x-forwarded-for": "203.0.113.5, 10.0.0.1",
        "x-request-id": "req-123",
      },
    });

    expect(res.status).toBe(200);

    const logs = getMemoryLogs({ search: "req-123", limit: 10 });
    const requestLog = logs.find((log) => log.type === "request");
    const responseLog = logs.find((log) => log.type === "response");

    expect(requestLog).toMatchObject({
      method: "GET",
      path: "/api/summary",
      url: `/api/summary?range=month&timeZone=${timeZone}`,
      query: { range: "month", timeZone },
      requestId: "req-123",
      ip: "203.0.113.5",
      userAgent: "vitest-agent",
      referer: "http://localhost:3000/overview",
      requestContentLength: "128",
      type: "request",
    });
    expect(responseLog).toMatchObject({
      method: "GET",
      path: "/api/summary",
      status: 200,
      url: `/api/summary?range=month&timeZone=${timeZone}`,
      query: { range: "month", timeZone },
      requestId: "req-123",
      ip: "203.0.113.5",
      userAgent: "vitest-agent",
      referer: "http://localhost:3000/overview",
      requestContentLength: "128",
      type: "response",
    });
    expect(responseLog?.duration).toEqual(expect.any(Number));
  });

  test("GET /api/summary uses range parameter to filter data", async () => {
    const rangeData = makeRangeData();
    mockGetRangeData.mockReturnValue(rangeData);

    await app.request(`/api/summary?range=3mo&timeZone=${timeZone}`);

    // Verify the function was called with the correct range parameter (second argument)
    expect(mockGetRangeData).toHaveBeenCalled();
    const callArgs = mockGetRangeData.mock.calls[0];
    expect(callArgs[1]).toBe("3mo");
    expect(callArgs[3]).toBe(timeZone);
  });

  test("GET /api/summary uses custom date range when start and end are provided", async () => {
    const rangeData = makeRangeData();
    mockGetDateFilteredData.mockReturnValue(rangeData);

    await app.request(`/api/summary?start=2025-01-01&end=2025-01-31&timeZone=${timeZone}`);

    // Verify getDateFilteredData was called with start and end
    expect(mockGetDateFilteredData).toHaveBeenCalled();
    const callArgs = mockGetDateFilteredData.mock.calls[0];
    expect(callArgs[1]).toBe("2025-01-01");
    expect(callArgs[2]).toBe("2025-01-31");
    expect(callArgs[4]).toBe(timeZone);
    expect(mockGetRangeData).not.toHaveBeenCalled();
  });

  test("GET /api/heatmap returns heatmap array", async () => {
    const rangeData = makeRangeData();
    mockGetRangeData.mockReturnValue(rangeData);

    const res = await app.request("/api/heatmap?range=month");

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(rangeData.heatmap);
  });

  test("GET /api/trend returns trend array", async () => {
    const rangeData = makeRangeData();
    mockGetRangeData.mockReturnValue(rangeData);

    const res = await app.request("/api/trend?range=month");

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(rangeData.trend);
  });

  test("GET /api/series returns all series by default", async () => {
    const rangeData = makeRangeData();
    mockGetRangeData.mockReturnValue(rangeData);

    const res = await app.request("/api/series?range=month");

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      options: rangeData.seriesOptions,
      lines: rangeData.seriesLines,
    });
  });

  test("GET /api/series filters series when params are provided", async () => {
    const rangeData = makeRangeData({
      seriesLines: [
        {
          key: "anthropic/claude-3-5-sonnet",
          label: "Claude",
          providerId: "anthropic",
          modelId: "claude-3-5-sonnet",
          points: [],
        },
        {
          key: "openai/gpt-4o",
          label: "GPT-4o",
          providerId: "openai",
          modelId: "gpt-4o",
          points: [],
        },
      ],
    });
    mockGetRangeData.mockReturnValue(rangeData);

    const res = await app.request("/api/series?range=month&series=anthropic/claude-3-5-sonnet");

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.lines).toHaveLength(1);
    expect(json.lines[0].key).toBe("anthropic/claude-3-5-sonnet");
  });

  test("GET /api/providers returns providers payload", async () => {
    const rangeData = makeRangeData();
    mockGetRangeData.mockReturnValue(rangeData);

    const res = await app.request("/api/providers?range=month");

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      summary: rangeData.summary,
      providers: rangeData.providers,
    });
  });

  test("GET /api/provider/:providerId returns provider-filtered dashboard payload", async () => {
    const provider = makeProviderInsight({ providerId: "zhipu", totalCost: 12.34 });
    const rangeData = makeRangeData({
      providers: [provider],
    });
    mockGetRangeData.mockReturnValue(rangeData);

    const res = await app.request("/api/provider/zhipu?range=month");

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      provider,
      summary: rangeData.summary,
      heatmap: rangeData.heatmap,
      trend: rangeData.trend,
      series: {
        options: rangeData.seriesOptions,
        lines: rangeData.seriesLines,
      },
      providers: rangeData.providers,
      selectedDay: null,
    });
    expect(mockGetRangeData).toHaveBeenCalledWith(undefined, "month", [], "UTC", "zhipu");
  });

  test("GET /api/provider/:providerId returns 404 when provider is not found", async () => {
    const rangeData = makeRangeData({ providers: [] });
    mockGetRangeData.mockReturnValue(rangeData);

    const res = await app.request("/api/provider/missing?range=month");

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json).toEqual({
      error: "No usage found for that provider.",
    });
  });

  test("GET /api/dashboard returns consolidated dashboard payload", async () => {
    const rangeData = makeRangeData();
    mockGetRangeData.mockReturnValue(rangeData);

    const res = await app.request("/api/dashboard?range=month");

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      summary: rangeData.summary,
      heatmap: rangeData.heatmap,
      trend: rangeData.trend,
      series: {
        options: rangeData.seriesOptions,
        lines: rangeData.seriesLines,
      },
      providers: rangeData.providers,
      selectedDay: null,
    });
  });

  test("GET /api/day/:date returns day breakdown when date exists", async () => {
    const dayData = makeDayBreakdown("2025-01-15");
    const rangeData = makeRangeData({
      byDate: new Map([["2025-01-15", dayData]]),
    });
    mockGetRangeData.mockReturnValue(rangeData);

    const res = await app.request("/api/day/2025-01-15?range=month");

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(dayData);
  });

  test("GET /api/day/:date returns 404 when date is not found", async () => {
    const rangeData = makeRangeData({
      byDate: new Map(),
    });
    mockGetRangeData.mockReturnValue(rangeData);

    const res = await app.request("/api/day/2025-01-15?range=month");

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json).toEqual({
      error: "No usage found for that date.",
    });
  });

  test("GET /api/day/:date/session/:sessionId returns session breakdown when session exists", async () => {
    const session = makeSessionBreakdown("ses_abc");
    const dayData = makeDayBreakdown("2025-01-15", { sessions: [session] });
    const rangeData = makeRangeData({
      byDate: new Map([["2025-01-15", dayData]]),
    });
    mockGetRangeData.mockReturnValue(rangeData);

    const res = await app.request("/api/day/2025-01-15/session/ses_abc?range=month");

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(session);
  });

  test("GET /api/day/:date/session/:sessionId returns 404 when session is not found", async () => {
    const dayData = makeDayBreakdown("2025-01-15", { sessions: [] });
    const rangeData = makeRangeData({
      byDate: new Map([["2025-01-15", dayData]]),
    });
    mockGetRangeData.mockReturnValue(rangeData);

    const res = await app.request("/api/day/2025-01-15/session/ses_missing?range=month");

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json).toEqual({
      error: "No session found for that date.",
    });
  });

  test("POST /api/refresh invalidates cache and returns new scannedAt", async () => {
    const newSnapshot = makeUsageSnapshot({
      summary: { scannedAt: "2025-01-20T12:00:00.000Z" },
    });
    mockLoadUsageSnapshot.mockResolvedValue(newSnapshot);

    const res = await app.request("/api/refresh", { method: "POST" });

    expect(res.status).toBe(200);
    expect(mockInvalidateMessagePayloadCache).toHaveBeenCalled();
    expect(mockLoadUsageSnapshot).toHaveBeenCalledWith({ forceRefresh: true });

    const json = await res.json();
    expect(json).toEqual({
      ok: true,
      scannedAt: "2025-01-20T12:00:00.000Z",
    });
  });

  test("message analytics endpoints return payloads per request", async () => {
    mockBuildMessagePayloads.mockResolvedValue({
      overview: {
        timeline: [],
        toolUsage: [{ tool: "read", count: 2, totalTokens: 300 }],
        totalMessages: 3,
      },
      distribution: { points: [], totalMessages: 3 },
      listFn: (page, pageSize) => ({
        messages: [],
        total: 3,
        page,
        pageSize,
      }),
    });

    const analyticsRes = await app.request("/api/day/2025-01-15/session/ses_abc/message/analytics");
    const overviewRes = await app.request("/api/day/2025-01-15/session/ses_abc/message/overview");
    const distributionRes = await app.request(
      "/api/day/2025-01-15/session/ses_abc/message/distribution",
    );
    const listRes = await app.request(
      "/api/day/2025-01-15/session/ses_abc/message?page=1&pageSize=25",
    );

    expect(analyticsRes.status).toBe(200);
    expect(overviewRes.status).toBe(200);
    expect(distributionRes.status).toBe(200);
    expect(listRes.status).toBe(200);
    expect(mockBuildMessagePayloads).toHaveBeenCalledTimes(4);

    const analyticsJson = await analyticsRes.json();
    expect(analyticsJson).toEqual({
      overview: {
        timeline: [],
        toolUsage: [{ tool: "read", count: 2, totalTokens: 300 }],
        totalMessages: 3,
      },
      distribution: { points: [], totalMessages: 3 },
    });

    const listJson = await listRes.json();
    expect(listJson).toEqual({ messages: [], total: 3, page: 1, pageSize: 25 });
  });
});
