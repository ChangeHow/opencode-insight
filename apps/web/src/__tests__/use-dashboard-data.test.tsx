import { vi, describe, it, expect, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import {
  rangeAtom,
  loadingAtom,
  errorAtom,
  summaryAtom,
  heatmapAtom,
  trendAtom,
  seriesOptionsAtom,
  seriesLinesAtom,
  providerInsightsAtom,
  selectedSeriesKeysAtom,
} from "../lib/atoms.js";
import {
  makeDashboardSummary,
  makeHeatmapDay,
  makeTrendPoint,
  makeCostSeriesPayload,
  makeProviderInsightsPayload,
  makeCostSeriesOption,
} from "./factories.js";

// vi.mock is hoisted by vitest, so the mocked modules below are already mocked at import time
vi.mock("../lib/api.js", () => ({
  fetchSummary: vi.fn(),
  fetchHeatmap: vi.fn(),
  fetchTrend: vi.fn(),
  fetchSeries: vi.fn(),
  fetchProviders: vi.fn(),
  fetchDay: vi.fn(),
  refreshSnapshot: vi.fn(),
}));

import { useDashboardData } from "../lib/use-dashboard-data.js";
import { fetchSummary, fetchHeatmap, fetchTrend, fetchSeries, fetchProviders } from "../lib/api.js";

const mockFetchSummary = vi.mocked(fetchSummary);
const mockFetchHeatmap = vi.mocked(fetchHeatmap);
const mockFetchTrend = vi.mocked(fetchTrend);
const mockFetchSeries = vi.mocked(fetchSeries);
const mockFetchProviders = vi.mocked(fetchProviders);

describe("useDashboardData Hook", () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createStore();
    
    mockFetchSummary.mockResolvedValue(makeDashboardSummary());
    mockFetchHeatmap.mockResolvedValue([makeHeatmapDay()]);
    mockFetchTrend.mockResolvedValue([makeTrendPoint()]);
    mockFetchSeries.mockResolvedValue(makeCostSeriesPayload());
    mockFetchProviders.mockResolvedValue(makeProviderInsightsPayload());
  });

  function wrapper({ children }: { children: ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  }

  describe("When hook mounts", () => {
    it("should set loading=true initially", () => {
      renderHook(() => useDashboardData(), { wrapper });

      expect(store.get(loadingAtom)).toBe(true);
    });
  });

  describe("When data loads successfully", () => {
    it("should set loading=false and populate all atoms", async () => {
      const summary = makeDashboardSummary();
      const heatmap = [makeHeatmapDay()];
      const trend = [makeTrendPoint()];
      const series = makeCostSeriesPayload();
      const providers = makeProviderInsightsPayload();

      mockFetchSummary.mockResolvedValue(summary);
      mockFetchHeatmap.mockResolvedValue(heatmap);
      mockFetchTrend.mockResolvedValue(trend);
      mockFetchSeries.mockResolvedValue(series);
      mockFetchProviders.mockResolvedValue(providers);

      renderHook(() => useDashboardData(), { wrapper });

      await waitFor(() => {
        expect(store.get(loadingAtom)).toBe(false);
      });

      expect(store.get(summaryAtom)).toEqual(summary);
      expect(store.get(heatmapAtom)).toEqual(heatmap);
      expect(store.get(trendAtom)).toEqual(trend);
      expect(store.get(seriesOptionsAtom)).toEqual(series.options);
      expect(store.get(seriesLinesAtom)).toEqual(series.lines);
      expect(store.get(providerInsightsAtom)).toEqual(providers.providers);
    });
  });

  describe("When data loads successfully with no prior selection", () => {
    it("should auto-select top 3 series from options", async () => {
      const series = makeCostSeriesPayload({
        options: [
          makeCostSeriesOption({ key: "option1", totalCost: 1.0 }),
          makeCostSeriesOption({ key: "option2", totalCost: 0.8 }),
          makeCostSeriesOption({ key: "option3", totalCost: 0.6 }),
          makeCostSeriesOption({ key: "option4", totalCost: 0.4 }),
        ],
      });

      mockFetchSeries.mockResolvedValue(series);

      renderHook(() => useDashboardData(), { wrapper });

      await waitFor(() => {
        expect(store.get(loadingAtom)).toBe(false);
      });

      const selectedKeys = store.get(selectedSeriesKeysAtom);
      expect(selectedKeys).toHaveLength(3);
      expect(selectedKeys).toContain("option1");
      expect(selectedKeys).toContain("option2");
      expect(selectedKeys).toContain("option3");
    });
  });

  describe("When the range atom changes", () => {
    it("should re-fetch data", async () => {
      const { rerender } = renderHook(() => useDashboardData(), { wrapper });

      await waitFor(() => {
        expect(store.get(loadingAtom)).toBe(false);
      });

      expect(mockFetchSummary).toHaveBeenCalledTimes(1);

      // Change range
      act(() => {
        store.set(rangeAtom, "3mo");
      });
      rerender();

      await waitFor(() => {
        expect(mockFetchSummary).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("When API returns an error", () => {
    it("should set error atom and clear data atoms", async () => {
      mockFetchSummary.mockRejectedValue(new Error("API error"));

      renderHook(() => useDashboardData(), { wrapper });

      await waitFor(() => {
        expect(store.get(loadingAtom)).toBe(false);
      });

      expect(store.get(errorAtom)).toBe("API error");
      expect(store.get(summaryAtom)).toBeNull();
      expect(store.get(heatmapAtom)).toEqual([]);
      expect(store.get(trendAtom)).toEqual([]);
      expect(store.get(seriesOptionsAtom)).toEqual([]);
      expect(store.get(seriesLinesAtom)).toEqual([]);
      expect(store.get(providerInsightsAtom)).toEqual([]);
    });
  });
});
