import { vi, describe, it, expect, beforeEach } from "vitest";
import type { TimeRange } from "@opencode-dashboard/shared";
import { makeUsageSnapshot, makeRangeData, makeDayBreakdown } from "./factories.js";

vi.mock("../usage.js", () => ({
  loadUsageSnapshot: vi.fn(),
  getRangeData: vi.fn(),
  getDateFilteredData: vi.fn(),
}));

vi.mock("../pricing.js", () => ({
  invalidatePricingCache: vi.fn(),
}));

import app from "../app.js";
import { loadUsageSnapshot, getRangeData, getDateFilteredData } from "../usage.js";
import { invalidatePricingCache } from "../pricing.js";

const mockLoadUsageSnapshot = vi.mocked(loadUsageSnapshot);
const mockGetRangeData = vi.mocked(getRangeData);
const mockGetDateFilteredData = vi.mocked(getDateFilteredData);
const mockInvalidatePricingCache = vi.mocked(invalidatePricingCache);

describe("BFF API Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const snapshot = makeUsageSnapshot();
    mockLoadUsageSnapshot.mockResolvedValue(snapshot);
    mockGetRangeData.mockReturnValue(makeRangeData());
    mockGetDateFilteredData.mockReturnValue(makeRangeData());
  });

  describe("GET /api/summary", () => {
    it("should return summary JSON when requested", async () => {
      const rangeData = makeRangeData();
      mockGetRangeData.mockReturnValue(rangeData);

      const res = await app.request("/api/summary?range=month");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual(rangeData.summary);
    });

    it("should use range parameter to filter data", async () => {
      const rangeData = makeRangeData();
      mockGetRangeData.mockReturnValue(rangeData);

      await app.request("/api/summary?range=3mo");

      // Verify the function was called with the correct range parameter (second argument)
      expect(mockGetRangeData).toHaveBeenCalled();
      const callArgs = mockGetRangeData.mock.calls[0];
      expect(callArgs[1]).toBe("3mo");
    });

    it("should use custom date range when start and end are provided", async () => {
      const rangeData = makeRangeData();
      mockGetDateFilteredData.mockReturnValue(rangeData);

      await app.request("/api/summary?start=2025-01-01&end=2025-01-31");

      // Verify getDateFilteredData was called with start and end
      expect(mockGetDateFilteredData).toHaveBeenCalled();
      const callArgs = mockGetDateFilteredData.mock.calls[0];
      expect(callArgs[1]).toBe("2025-01-01");
      expect(callArgs[2]).toBe("2025-01-31");
      expect(mockGetRangeData).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/heatmap", () => {
    it("should return heatmap array", async () => {
      const rangeData = makeRangeData();
      mockGetRangeData.mockReturnValue(rangeData);

      const res = await app.request("/api/heatmap?range=month");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual(rangeData.heatmap);
    });
  });

  describe("GET /api/trend", () => {
    it("should return trend array", async () => {
      const rangeData = makeRangeData();
      mockGetRangeData.mockReturnValue(rangeData);

      const res = await app.request("/api/trend?range=month");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual(rangeData.trend);
    });
  });

  describe("GET /api/series", () => {
    it("should return all series by default", async () => {
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

    it("should filter series when series params are provided", async () => {
      const rangeData = makeRangeData({
        seriesLines: [
          { key: "anthropic/claude-3-5-sonnet", label: "Claude", providerId: "anthropic", modelId: "claude-3-5-sonnet", points: [] },
          { key: "openai/gpt-4o", label: "GPT-4o", providerId: "openai", modelId: "gpt-4o", points: [] },
        ],
      });
      mockGetRangeData.mockReturnValue(rangeData);

      const res = await app.request("/api/series?range=month&series=anthropic/claude-3-5-sonnet");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.lines).toHaveLength(1);
      expect(json.lines[0].key).toBe("anthropic/claude-3-5-sonnet");
    });
  });

  describe("GET /api/providers", () => {
    it("should return providers payload", async () => {
      const rangeData = makeRangeData();
      mockGetRangeData.mockReturnValue(rangeData);

      const res = await app.request("/api/providers?range=month");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({
        providers: rangeData.providers,
      });
    });
  });

  describe("GET /api/day/:date", () => {
    it("should return day breakdown when date exists", async () => {
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

    it("should return 404 when date is not found", async () => {
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
  });

  describe("POST /api/refresh", () => {
    it("should invalidate cache and return new scannedAt", async () => {
      const newSnapshot = makeUsageSnapshot({
        summary: { scannedAt: "2025-01-20T12:00:00.000Z" },
      });
      mockLoadUsageSnapshot.mockResolvedValue(newSnapshot);

      const res = await app.request("/api/refresh", { method: "POST" });

      expect(res.status).toBe(200);
      expect(mockInvalidatePricingCache).toHaveBeenCalled();
      expect(mockLoadUsageSnapshot).toHaveBeenCalledWith({ forceRefresh: true });
      
      const json = await res.json();
      expect(json).toEqual({
        ok: true,
        scannedAt: "2025-01-20T12:00:00.000Z",
      });
    });
  });
});
