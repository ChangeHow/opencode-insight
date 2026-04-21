import { useCallback, useEffect, useRef } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import {
  bumpDashboardRefreshAtom,
  customDateRangeAtom,
  dashboardStateAtom,
  errorAtom,
  loadingAtom,
  rangeAtom,
} from "@/lib/atoms";
import { getCurrentTimeZone } from "@opencode-dashboard/shared";
import { refreshSnapshot } from "@/lib/api";

export const AUTO_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export function useDataFetcher<T>({
  prefix,
  fetchFn,
  onSuccess,
  onError,
}: {
  prefix?: string;
  fetchFn: () => Promise<T>;
  onSuccess: (data: T) => void;
  onError: () => void;
}) {
  const range = useAtomValue(rangeAtom);
  const customDateRange = useAtomValue(customDateRangeAtom);
  const dashboardState = useAtomValue(dashboardStateAtom);
  const refreshTick = dashboardState.refreshTick;
  const setDashboardState = useSetAtom(dashboardStateAtom);
  const setLoading = useSetAtom(loadingAtom);
  const setError = useSetAtom(errorAtom);
  const bumpRefresh = useSetAtom(bumpDashboardRefreshAtom);
  const requestKey = `${prefix ? `${prefix}:` : ""}${getCurrentTimeZone()}:${range}:${customDateRange.start}:${customDateRange.end}`;
  const lastProcessedTick = useRef(refreshTick);

  const doRefresh = useCallback(async () => {
    await refreshSnapshot();
    bumpRefresh();
  }, [bumpRefresh]);

  useEffect(() => {
    void doRefresh();

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
        const data = await fetchFn();

        if (canceled) {
          return;
        }

        onSuccess(data);
        setDashboardState((prev) => ({
          ...prev,
          key: requestKey,
          lastRefreshAt: new Date(),
        }));
      } catch (error) {
        if (!canceled) {
          setError(error instanceof Error ? error.message : "Failed to load data.");
          onError();
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
    dashboardState.key,
    fetchFn,
    onError,
    onSuccess,
    range,
    customDateRange.start,
    customDateRange.end,
    refreshTick,
    requestKey,
    setDashboardState,
    setError,
    setLoading,
  ]);
}
