import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionInsightPayload } from "@opencode-dashboard/shared";
import { fetchSessionInsight } from "./api";

interface InsightState {
  sessionId: string;
  data?: SessionInsightPayload;
  loading: boolean;
  error?: string;
}

export function useSessionInsight(sessionId: string) {
  const [state, setState] = useState<InsightState>({ sessionId, loading: true });
  const [retryTick, setRetryTick] = useState(0);
  const cache = useRef<{ sessionId: string; data: SessionInsightPayload } | undefined>(undefined);
  const retry = useCallback(() => setRetryTick((tick) => tick + 1), []);

  useEffect(() => {
    let disposed = false;
    let busy = false;
    let data = cache.current?.sessionId === sessionId ? cache.current.data : undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setState({ sessionId, data, loading: !data });
    const visible = () => !disposed && !document.hidden;
    async function refresh() {
      clearTimeout(timer);
      if (busy || !visible()) return;
      busy = true;
      try {
        const next = await fetchSessionInsight(sessionId, data?.series.revision);
        if (!visible()) return;
        if (next.session.sessionID !== sessionId)
          throw new Error("Insight returned a different session.");
        data = {
          session: next.session,
          series: next.series.unchanged && data ? data.series : next.series,
        };
        cache.current = { sessionId, data };
        setState({ sessionId, data, loading: false });
      } catch (error) {
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
