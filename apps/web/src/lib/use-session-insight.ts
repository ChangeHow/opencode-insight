import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionInsightQueryPayload } from "@opencode-dashboard/shared";
import { fetchSessionInsightOverview, fetchSessionInsightSeriesWindow } from "./api";

interface InsightState {
  sessionId: string;
  data?: SessionInsightQueryPayload;
  loading: boolean;
  error?: string;
}

export function useSessionInsight(sessionId: string) {
  const [state, setState] = useState<InsightState>({ sessionId, loading: true });
  const [retryTick, setRetryTick] = useState(0);
  const cache = useRef<{ sessionId: string; data: SessionInsightQueryPayload } | undefined>(
    undefined,
  );
  const retry = useCallback(() => setRetryTick((tick) => tick + 1), []);

  useEffect(() => {
    let disposed = false;
    let busy = false;
    let data = cache.current?.sessionId === sessionId ? cache.current.data : undefined;
    let seriesFailed = false;
    let hadError = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    cache.current = data ? { sessionId, data } : undefined;
    setState({ sessionId, data, loading: !data });
    const visible = () => !disposed && !document.hidden;
    async function refresh() {
      clearTimeout(timer);
      if (busy || !visible()) return;
      busy = true;
      try {
        const next = await fetchSessionInsightOverview(sessionId, data?.overview.revision);
        if (!visible()) return;
        if (next.sessionID !== sessionId) throw new Error("Insight returned a different session.");
        const overviewData = next.data ?? data?.overview.data;
        if (!overviewData) throw new Error("Insight overview unavailable.");
        let series = data?.series;
        if (
          !series ||
          next.revision !== series.revision ||
          overviewData.running ||
          series.running ||
          seriesFailed
        ) {
          seriesFailed = true;
          series = await fetchSessionInsightSeriesWindow(sessionId);
          if (!visible()) return;
          if (series.sessionID !== sessionId)
            throw new Error("Insight returned a different session.");
          seriesFailed = false;
        }
        const overview =
          next.data === undefined && data && next.revision === data.overview.revision
            ? data.overview
            : { ...next, data: overviewData };
        const changed = !data || overview !== data.overview || series !== data.series;
        if (changed) {
          data = { overview, series };
          cache.current = { sessionId, data };
        }
        if (changed || hadError) setState({ sessionId, data, loading: false });
        hadError = false;
      } catch (error) {
        hadError = true;
        if (visible())
          setState({
            sessionId,
            data,
            loading: false,
            error: error instanceof Error ? error.message : "Session insight unavailable.",
          });
      } finally {
        busy = false;
        if (visible()) timer = setTimeout(() => void refresh(), 1000);
      }
    }
    const onVisibility = () => {
      clearTimeout(timer);
      if (visible()) void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    void refresh();
    return () => {
      disposed = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [sessionId, retryTick]);

  return {
    ...(state.sessionId === sessionId ? state : { sessionId, loading: true }),
    retry,
  };
}
