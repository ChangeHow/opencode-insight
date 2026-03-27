import { useCallback, useEffect, useRef } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import {
  bumpDashboardRefreshAtom,
  customDateRangeAtom,
  dashboardStateAtom,
  errorAtom,
  heatmapAtom,
  loadingAtom,
  providerInsightsAtom,
  rangeAtom,
  selectedSeriesKeysAtom,
  seriesLinesAtom,
  seriesOptionsAtom,
  summaryAtom,
  trendAtom,
} from "@/lib/atoms";
import { getCurrentTimeZone } from "@opencode-dashboard/shared";
import { fetchDashboard, refreshSnapshot } from "@/lib/api";

function hasSeriesValue(option: { totalCost: number; totalTokens: number; totalMessages: number }) {
  return option.totalCost > 0 || option.totalTokens > 0 || option.totalMessages > 0;
}

const AUTO_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

export function useDashboardData() {
  const range = useAtomValue(rangeAtom);
  const customDateRange = useAtomValue(customDateRangeAtom);
  const dashboardState = useAtomValue(dashboardStateAtom);
  const refreshTick = dashboardState.refreshTick;
  const setSummary = useSetAtom(summaryAtom);
  const setHeatmap = useSetAtom(heatmapAtom);
  const setTrend = useSetAtom(trendAtom);
  const setSeriesOptions = useSetAtom(seriesOptionsAtom);
  const setSeriesLines = useSetAtom(seriesLinesAtom);
  const setProviderInsights = useSetAtom(providerInsightsAtom);
  const setSelectedSeriesKeys = useSetAtom(selectedSeriesKeysAtom);
  const setDashboardState = useSetAtom(dashboardStateAtom);
  const setLoading = useSetAtom(loadingAtom);
  const setError = useSetAtom(errorAtom);
  const bumpRefresh = useSetAtom(bumpDashboardRefreshAtom);
  const requestKey = `${getCurrentTimeZone()}:${range}:${customDateRange.start}:${customDateRange.end}`;
  const lastProcessedTick = useRef(refreshTick);

  const doRefresh = useCallback(async () => {
    await refreshSnapshot();
    bumpRefresh();
  }, [bumpRefresh]);

  useEffect(() => {
    const timer = setInterval(() => {
      void doRefresh();
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(timer);
    };
  }, [doRefresh]);

  useEffect(() => {
    if (refreshTick === lastProcessedTick.current && dashboardState.key === requestKey) {
      setLoading(false);
      return;
    }

    lastProcessedTick.current = refreshTick;
    setLoading(true);
    setError(null);

    let canceled = false;

    async function load() {
      try {
        const dashboard = await fetchDashboard(range, customDateRange);

        if (canceled) {
          return;
        }

        setSummary(dashboard.summary);
        setHeatmap(dashboard.heatmap);
        setTrend(dashboard.trend);
        setSeriesOptions(dashboard.series.options);
        setSeriesLines(dashboard.series.lines);
        setProviderInsights(dashboard.providers);
        setSelectedSeriesKeys((current) => {
          const visibleOptions = dashboard.series.options.filter(hasSeriesValue).slice(0, 10);
          const valid = current.filter((key) => visibleOptions.some((option) => option.key === key));
          return valid.length > 0 ? valid : visibleOptions.slice(0, 3).map((option) => option.key);
        });
        setDashboardState((prev) => ({
          ...prev,
          key: requestKey,
          lastRefreshAt: new Date(),
        }));
      } catch (error) {
        if (!canceled) {
          setError(error instanceof Error ? error.message : "Failed to load dashboard.");
          setSummary(null);
          setHeatmap([]);
          setTrend([]);
          setSeriesOptions([]);
          setSeriesLines([]);
          setProviderInsights([]);
        }
      } finally {
        if (!canceled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      canceled = true;
    };
  }, [
    customDateRange,
    dashboardState.key,
    range,
    refreshTick,
    requestKey,
    setDashboardState,
    setError,
    setHeatmap,
    setLoading,
    setProviderInsights,
    setSeriesLines,
    setSeriesOptions,
    setSelectedSeriesKeys,
    setSummary,
    setTrend,
  ]);
}
