import { useEffect } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  dayAtom,
  detailLoadingAtom,
  errorAtom,
  heatmapAtom,
  loadingAtom,
  rangeAtom,
  refreshTickAtom,
  selectedDateAtom,
  summaryAtom,
  trendAtom,
} from "@/lib/atoms";
import { fetchDay, fetchHeatmap, fetchSummary, fetchTrend } from "@/lib/api";

export function useDashboardData() {
  const range = useAtomValue(rangeAtom);
  const refreshTick = useAtomValue(refreshTickAtom);
  const [selectedDate, setSelectedDate] = useAtom(selectedDateAtom);
  const setSummary = useSetAtom(summaryAtom);
  const setHeatmap = useSetAtom(heatmapAtom);
  const setTrend = useSetAtom(trendAtom);
  const setLoading = useSetAtom(loadingAtom);
  const setError = useSetAtom(errorAtom);
  const setDay = useSetAtom(dayAtom);
  const setDetailLoading = useSetAtom(detailLoadingAtom);

  useEffect(() => {
    let canceled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [summary, heatmap, trend] = await Promise.all([
          fetchSummary(range),
          fetchHeatmap(range),
          fetchTrend(range),
        ]);

        if (canceled) {
          return;
        }

        setSummary(summary);
        setHeatmap(heatmap);
        setTrend(trend);

        const fallbackDate = selectedDate && heatmap.some((item) => item.date === selectedDate)
          ? selectedDate
          : heatmap.at(-1)?.date ?? null;

        setSelectedDate(fallbackDate);
      } catch (error) {
        if (!canceled) {
          setError(error instanceof Error ? error.message : "Failed to load dashboard.");
          setSummary(null);
          setHeatmap([]);
          setTrend([]);
          setDay(null);
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
  }, [range, refreshTick, selectedDate, setDay, setError, setHeatmap, setLoading, setSelectedDate, setSummary, setTrend]);

  useEffect(() => {
    if (!selectedDate) {
      setDay(null);
      return;
    }

    let canceled = false;
    const date = selectedDate;

    async function loadDetail() {
      setDetailLoading(true);

      try {
        const detail = await fetchDay(range, date);
        if (!canceled) {
          setDay(detail);
        }
      } catch {
        if (!canceled) {
          setDay(null);
        }
      } finally {
        if (!canceled) {
          setDetailLoading(false);
        }
      }
    }

    void loadDetail();

    return () => {
      canceled = true;
    };
  }, [range, selectedDate, setDay, setDetailLoading]);
}
