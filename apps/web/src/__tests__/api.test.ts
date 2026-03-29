import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  fetchDashboard,
  fetchSummary,
  fetchHeatmap,
  fetchTrend,
  fetchDay,
  fetchSession,
  fetchSeries,
  fetchProviderDashboard,
  fetchProviders,
  refreshSnapshot,
} from "../lib/api";
import { makeDashboardSummary } from "./factories";

describe("API Client Functions", () => {
  const mockFetch = vi.fn();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  beforeEach(() => {
    globalThis.fetch = mockFetch;
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchSummary", () => {
    it("should call /api/summary?range=month when fetching with 'month' range", async () => {
      await fetchSummary("month");

      expect(mockFetch).toHaveBeenCalledWith(
        `/api/summary?timeZone=${encodeURIComponent(timeZone)}&range=month`,
      );
    });

    it("should call with start/end params instead of range when custom date range provided", async () => {
      await fetchSummary("month", { start: "2025-01-01", end: "2025-01-31" });

      expect(mockFetch).toHaveBeenCalledWith(
        `/api/summary?timeZone=${encodeURIComponent(timeZone)}&start=2025-01-01&end=2025-01-31`,
      );
    });
  });

  describe("fetchHeatmap", () => {
    it("should use correct endpoint for heatmap", async () => {
      await fetchHeatmap("month");

      expect(mockFetch).toHaveBeenCalledWith(
        `/api/heatmap?timeZone=${encodeURIComponent(timeZone)}&range=month`,
      );
    });
  });

  describe("fetchTrend", () => {
    it("should use correct endpoint for trend", async () => {
      await fetchTrend("month");

      expect(mockFetch).toHaveBeenCalledWith(
        `/api/trend?timeZone=${encodeURIComponent(timeZone)}&range=month`,
      );
    });
  });

  describe("fetchProviders", () => {
    it("should use correct endpoint for providers", async () => {
      await fetchProviders("month");

      expect(mockFetch).toHaveBeenCalledWith(
        `/api/providers?timeZone=${encodeURIComponent(timeZone)}&range=month`,
      );
    });
  });

  describe("fetchProviderDashboard", () => {
    it("should use correct endpoint for provider detail", async () => {
      await fetchProviderDashboard("zai-coding-plan", "month");

      expect(mockFetch).toHaveBeenCalledWith(
        `/api/provider/zai-coding-plan?timeZone=${encodeURIComponent(timeZone)}&range=month`,
      );
    });
  });

  describe("fetchDashboard", () => {
    it("should use correct endpoint for dashboard", async () => {
      await fetchDashboard("month");

      expect(mockFetch).toHaveBeenCalledWith(
        `/api/dashboard?timeZone=${encodeURIComponent(timeZone)}&range=month`,
      );
    });
  });

  describe("fetchDay", () => {
    it("should build /api/day/{date} URL correctly", async () => {
      await fetchDay("month", "2025-01-15");

      expect(mockFetch).toHaveBeenCalledWith(
        `/api/day/2025-01-15?timeZone=${encodeURIComponent(timeZone)}&range=month`,
      );
    });
  });

  describe("fetchSession", () => {
    it("should build /api/day/{date}/session/{sessionId} URL correctly", async () => {
      await fetchSession("month", "2025-01-15", "ses_abc");

      expect(mockFetch).toHaveBeenCalledWith(
        `/api/day/2025-01-15/session/ses_abc?timeZone=${encodeURIComponent(timeZone)}&range=month`,
      );
    });
  });

  describe("fetchSeries", () => {
    it("should send empty series list when no series params provided", async () => {
      await fetchSeries("month", []);

      expect(mockFetch).toHaveBeenCalledWith(
        `/api/series?timeZone=${encodeURIComponent(timeZone)}&range=month`,
      );
    });

    it("should append each series key as separate series= param", async () => {
      await fetchSeries("month", ["anthropic/claude-3-5-sonnet", "openai/gpt-4o"]);

      expect(mockFetch).toHaveBeenCalledWith(
        `/api/series?timeZone=${encodeURIComponent(timeZone)}&range=month&series=anthropic%2Fclaude-3-5-sonnet&series=openai%2Fgpt-4o`,
      );
    });
  });

  describe("Error handling", () => {
    it("should throw Error with payload error message when API returns non-ok response with error payload", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Custom error message" }),
      });

      await expect(fetchSummary("month")).rejects.toThrow("Custom error message");
    });

    it("should throw 'Request failed.' when API returns non-ok with no JSON", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: async () => {
          throw new Error("No JSON");
        },
      });

      await expect(fetchSummary("month")).rejects.toThrow("Request failed.");
    });

    it("should throw 'Request failed.' when API returns non-ok with JSON payload lacking error field", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: async () => ({ detail: "some detail" }),
      });

      await expect(fetchSummary("month")).rejects.toThrow("Request failed.");
    });
  });

  describe("refreshSnapshot", () => {
    it("should call POST /api/refresh", async () => {
      await refreshSnapshot();

      expect(mockFetch).toHaveBeenCalledWith("/api/refresh", { method: "POST" });
    });

    it("should throw when response is not ok", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
      });

      await expect(refreshSnapshot()).rejects.toThrow("Failed to refresh snapshot.");
    });
  });
});
