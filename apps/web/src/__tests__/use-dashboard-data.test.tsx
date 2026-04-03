import { vi, describe, test, expect, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { getCurrentTimeZone } from "@opencode-dashboard/shared";
import {
  customDateRangeAtom,
  dashboardStateAtom,
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
} from "../lib/atoms/index";
import {
  makeDashboardSummary,
  makeCostSeriesLine,
  makeCostSeriesOption,
  makeHeatmapDay,
  makeTrendPoint,
  makeCostSeriesPayload,
  makeProviderInsightsPayload,
} from "./factories";

vi.mock("../lib/api.js", () => ({
  fetchDashboard: vi.fn(),
  refreshSnapshot: vi.fn().mockResolvedValue(undefined),
}));

import { useDashboardData } from "../lib/use-dashboard-data";
import { fetchDashboard, refreshSnapshot } from "../lib/api";
import { AUTO_REFRESH_INTERVAL_MS } from "../lib/use-data-fetcher";

const mockFetchDashboard = vi.mocked(fetchDashboard);
const mockRefreshSnapshot = vi.mocked(refreshSnapshot);

describe("useDashboardData Hook", () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    store = createStore();

    mockFetchDashboard.mockResolvedValue({
      summary: makeDashboardSummary(),
      heatmap: [makeHeatmapDay()],
      trend: [makeTrendPoint()],
      series: makeCostSeriesPayload(),
      providers: makeProviderInsightsPayload().providers,
      selectedDay: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function wrapper({ children }: { children: ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  }

  test("should set loading=true initially", () => {
    renderHook(() => useDashboardData(), { wrapper });

    expect(store.get(loadingAtom)).toBe(true);
  });

  test("should set loading=false and populate all atoms on success", async () => {
    const summary = makeDashboardSummary();
    const heatmap = [makeHeatmapDay()];
    const trend = [makeTrendPoint()];
    const series = makeCostSeriesPayload();
    const providers = makeProviderInsightsPayload();

    mockFetchDashboard.mockResolvedValue({
      summary,
      heatmap,
      trend,
      series,
      providers: providers.providers,
      selectedDay: null,
    });

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

  test("should auto-select top 3 series from options when no prior selection", async () => {
    const series = makeCostSeriesPayload({
      options: [
        makeCostSeriesOption({ key: "option1", totalCost: 1.0 }),
        makeCostSeriesOption({ key: "option2", totalCost: 0.8 }),
        makeCostSeriesOption({ key: "option3", totalCost: 0.6 }),
        makeCostSeriesOption({ key: "option4", totalCost: 0.4 }),
      ],
    });

    mockFetchDashboard.mockResolvedValue({
      summary: makeDashboardSummary(),
      heatmap: [makeHeatmapDay()],
      trend: [makeTrendPoint()],
      series,
      providers: makeProviderInsightsPayload().providers,
      selectedDay: null,
    });

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

  test("should re-fetch data when range atom changes", async () => {
    const { rerender } = renderHook(() => useDashboardData(), { wrapper });

    await waitFor(() => {
      expect(store.get(loadingAtom)).toBe(false);
    });

    const before = mockFetchDashboard.mock.calls.length;

    act(() => {
      store.set(rangeAtom, "3mo");
    });
    rerender();

    await waitFor(() => {
      expect(mockFetchDashboard.mock.calls.length).toBeGreaterThan(before);
    });
  });

  test("should reuse cached atoms without fetching when revisiting same state", async () => {
    store.set(summaryAtom, makeDashboardSummary({ totalTokens: 999 }));
    store.set(heatmapAtom, [makeHeatmapDay("2025-01-25")]);
    store.set(trendAtom, [makeTrendPoint("2025-01-25")]);
    store.set(seriesOptionsAtom, [makeCostSeriesOption({ key: "cached" })]);
    store.set(seriesLinesAtom, [makeCostSeriesLine({ key: "cached" })]);
    store.set(providerInsightsAtom, makeProviderInsightsPayload().providers);
    store.set(dashboardStateAtom, {
      key: `${getCurrentTimeZone()}:7d:2025-01-01:2025-01-07`,
      refreshTick: 0,
      lastRefreshAt: null,
    });
    store.set(rangeAtom, "7d");
    store.set(customDateRangeAtom, { start: "2025-01-01", end: "2025-01-07" } as {
      start: string;
      end: string;
    });

    renderHook(() => useDashboardData(), { wrapper });

    await waitFor(() => {
      expect(store.get(loadingAtom)).toBe(false);
    });

    expect(mockFetchDashboard).not.toHaveBeenCalled();
    expect(store.get(summaryAtom)?.totalTokens).toBe(999);
  });

  test("should set error atom and clear data atoms on API error", async () => {
    mockFetchDashboard.mockRejectedValue(new Error("API error"));

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

  test("should auto refresh every 10 minutes", async () => {
    vi.useFakeTimers();

    const { unmount } = renderHook(() => useDashboardData(), { wrapper });

    await waitFor(() => {
      expect(store.get(loadingAtom)).toBe(false);
    });

    const initialFetchCount = mockFetchDashboard.mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_REFRESH_INTERVAL_MS);
    });

    await waitFor(() => {
      expect(mockRefreshSnapshot).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(mockFetchDashboard.mock.calls.length).toBeGreaterThan(initialFetchCount);
    });

    unmount();
  });
});
