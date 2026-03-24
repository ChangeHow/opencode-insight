import { useEffect } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import {
  customDateRangeAtom,
  errorAtom,
  heatmapAtom,
  loadingAtom,
  providerInsightsAtom,
  rangeAtom,
  refreshTickAtom,
  selectedSeriesKeysAtom,
  seriesLinesAtom,
  seriesOptionsAtom,
  summaryAtom,
  trendAtom,
} from "@/lib/atoms";
import { fetchHeatmap, fetchProviders, fetchSeries, fetchSummary, fetchTrend } from "@/lib/api";

function hasSeriesValue(option: { totalCost: number; totalTokens: number; totalMessages: number }) {
  return option.totalCost > 0 || option.totalTokens > 0 || option.totalMessages > 0;
}

export function useDashboardData() {
  const range = useAtomValue(rangeAtom);
  const customDateRange = useAtomValue(customDateRangeAtom);
  const refreshTick = useAtomValue(refreshTickAtom);
  const setSummary = useSetAtom(summaryAtom);
  const setHeatmap = useSetAtom(heatmapAtom);
  const setTrend = useSetAtom(trendAtom);
  const setSeriesOptions = useSetAtom(seriesOptionsAtom);
  const setSeriesLines = useSetAtom(seriesLinesAtom);
  const setProviderInsights = useSetAtom(providerInsightsAtom);
  const setSelectedSeriesKeys = useSetAtom(selectedSeriesKeysAtom);
  const setLoading = useSetAtom(loadingAtom);
  const setError = useSetAtom(errorAtom);

  useEffect(() => {
    let canceled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [summary, heatmap, trend, series, providers] = await Promise.all([
          fetchSummary(range, customDateRange),
          fetchHeatmap(range, customDateRange),
          fetchTrend(range, customDateRange),
          fetchSeries(range, [], customDateRange),
          fetchProviders(range, customDateRange),
        ]);

        if (canceled) {
          return;
        }

        setSummary(summary);
        setHeatmap(heatmap);
        setTrend(trend);
        setSeriesOptions(series.options);
        setSeriesLines(series.lines);
        setProviderInsights(providers.providers);
        setSelectedSeriesKeys((current) => {
          const visibleOptions = series.options.filter(hasSeriesValue).slice(0, 10);
          const valid = current.filter((key) => visibleOptions.some((option) => option.key === key));
          return valid.length > 0 ? valid : visibleOptions.slice(0, 3).map((option) => option.key);
        });
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
    range,
    refreshTick,
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
