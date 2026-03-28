import { useCallback, useEffect, useRef } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import {
  bumpDashboardRefreshAtom,
  customDateRangeAtom,
  dashboardStateAtom,
  errorAtom,
  loadingAtom,
  providerInsightsAtom,
  rangeAtom,
  summaryAtom,
} from "@/lib/atoms";
import { getCurrentTimeZone } from "@opencode-dashboard/shared";
import { fetchProviders, fetchSummary, refreshSnapshot } from "@/lib/api";

const AUTO_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

export function useProviderInsightsData() {
  const range = useAtomValue(rangeAtom);
  const customDateRange = useAtomValue(customDateRangeAtom);
  const dashboardState = useAtomValue(dashboardStateAtom);
  const refreshTick = dashboardState.refreshTick;
  const setSummary = useSetAtom(summaryAtom);
  const setProviderInsights = useSetAtom(providerInsightsAtom);
  const setDashboardState = useSetAtom(dashboardStateAtom);
  const setLoading = useSetAtom(loadingAtom);
  const setError = useSetAtom(errorAtom);
  const bumpRefresh = useSetAtom(bumpDashboardRefreshAtom);
  const requestKey = `providers:${getCurrentTimeZone()}:${range}:${customDateRange.start}:${customDateRange.end}`;
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
        const [summary, providers] = await Promise.all([
          fetchSummary(range, customDateRange),
          fetchProviders(range, customDateRange),
        ]);

        if (canceled) {
          return;
        }

        setSummary(summary);
        setProviderInsights(providers.providers);
        setDashboardState((prev) => ({
          ...prev,
          key: requestKey,
          lastRefreshAt: new Date(),
        }));
      } catch (error) {
        if (!canceled) {
          setError(error instanceof Error ? error.message : "Failed to load provider insights.");
          setSummary(null);
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
    setLoading,
    setProviderInsights,
    setSummary,
  ]);
}
