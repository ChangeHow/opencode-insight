import { useCallback, useMemo, useRef } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import {
  customDateRangeAtom,
  heatmapAtom,
  providerInsightsAtom,
  rangeAtom,
  remoteUsageAtom,
  selectedSeriesKeysAtom,
  seriesLinesAtom,
  seriesOptionsAtom,
  summaryAtom,
  trendAtom,
} from "@/lib/atoms";
import { fetchDashboard } from "@/lib/api";
import { useDataFetcher } from "@/lib/use-data-fetcher";

function hasSeriesValue(option: { totalCost: number; totalTokens: number; totalMessages: number }) {
  return option.totalCost > 0 || option.totalTokens > 0 || option.totalMessages > 0;
}

export function useDashboardData() {
  const range = useAtomValue(rangeAtom);
  const customDateRange = useAtomValue(customDateRangeAtom);
  const setSummary = useSetAtom(summaryAtom);
  const setHeatmap = useSetAtom(heatmapAtom);
  const setTrend = useSetAtom(trendAtom);
  const setSeriesOptions = useSetAtom(seriesOptionsAtom);
  const setSeriesLines = useSetAtom(seriesLinesAtom);
  const setProviderInsights = useSetAtom(providerInsightsAtom);
  const setRemoteUsage = useSetAtom(remoteUsageAtom);
  const setSelectedSeriesKeys = useSetAtom(selectedSeriesKeysAtom);
  const requestKey = useMemo(
    () => `${range}:${customDateRange.start}:${customDateRange.end}`,
    [customDateRange.end, customDateRange.start, range],
  );
  const lastSeriesSelectionKey = useRef<string | null>(null);

  useDataFetcher({
    fetchFn: useCallback(() => fetchDashboard(range, customDateRange), [range, customDateRange]),
    onSuccess: useCallback(
      (dashboard: Awaited<ReturnType<typeof fetchDashboard>>) => {
        setSummary(dashboard.summary);
        setHeatmap(dashboard.heatmap);
        setTrend(dashboard.trend);
        setSeriesOptions(dashboard.series.options);
        setSeriesLines(dashboard.series.lines);
        setProviderInsights(dashboard.providers);
        setRemoteUsage(dashboard.remoteSync ?? null);
        setSelectedSeriesKeys((current) => {
          const visibleOptions = dashboard.series.options.filter(hasSeriesValue).slice(0, 10);
          if (lastSeriesSelectionKey.current !== requestKey) {
            lastSeriesSelectionKey.current = requestKey;
            return visibleOptions.slice(0, 3).map((option) => option.key);
          }

          const valid = current.filter((key) =>
            visibleOptions.some((option) => option.key === key),
          );
          return valid.length > 0 ? valid : visibleOptions.slice(0, 3).map((option) => option.key);
        });
      },
      [
        setHeatmap,
        setProviderInsights,
        setRemoteUsage,
        setSelectedSeriesKeys,
        setSeriesLines,
        setSeriesOptions,
        setSummary,
        setTrend,
        requestKey,
      ],
    ),
    onError: useCallback(() => {
      setSummary(null);
      setHeatmap([]);
      setTrend([]);
      setSeriesOptions([]);
      setSeriesLines([]);
      setProviderInsights([]);
      setRemoteUsage(null);
    }, [
      setHeatmap,
      setProviderInsights,
      setRemoteUsage,
      setSeriesLines,
      setSeriesOptions,
      setSummary,
      setTrend,
    ]),
  });
}
