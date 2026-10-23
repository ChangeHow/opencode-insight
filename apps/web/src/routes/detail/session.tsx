import { useEffect } from "react";
import { useAtom } from "jotai";
import { useParams, useSearch } from "@tanstack/react-router";
import { MessageAnalyticsPanel } from "@/components/dashboard/message-analytics-panel";
import { SessionBreakdownPanel } from "@/components/dashboard/session-breakdown";
import { DetailLayoutShell } from "@/components/dashboard/detail-layout-shell";
import { LiveSessionInsight } from "@/components/dashboard/live-session-insight";
import { detailLoadingAtom, errorAtom, sessionAtom } from "@/lib/atoms";
import { ApiError, fetchSession } from "@/lib/api";

export function SessionDetailPage() {
  const { session: sessionId } = useParams({ from: "/dashboard/sessions/$session" });
  const { from } = useSearch({ from: "/dashboard/sessions/$session" });
  const [session, setSession] = useAtom(sessionAtom);
  const [loading, setLoading] = useAtom(detailLoadingAtom);
  const [, setError] = useAtom(errorAtom);
  const supportsInsight = /^ses_[A-Za-z0-9]+$/.test(sessionId);

  useEffect(() => {
    let canceled = false;
    setLoading(true);
    setSession(null);

    async function loadSession() {
      try {
        const data = await fetchSession(sessionId);
        if (!canceled) {
          setSession(data);
          setError(null);
        }
      } catch (loadError) {
        if (!canceled) {
          setSession(null);
          setError(
            loadError instanceof ApiError && loadError.status === 404 && supportsInsight
              ? null
              : loadError instanceof Error
                ? loadError.message
                : "Failed to load session detail.",
          );
        }
      } finally {
        if (!canceled) {
          setLoading(false);
        }
      }
    }

    void loadSession();

    return () => {
      canceled = true;
    };
  }, [sessionId, supportsInsight, setError, setLoading, setSession]);

  return (
    <DetailLayoutShell
      backTo={from ? "/detail/$date" : "/overview"}
      backParams={from ? { date: from } : undefined}
      backLabel={from ? "Back to day" : "Back to overview"}
    >
      {loading ? (
        <div className="mx-auto max-w-7xl px-4 sm:px-8 lg:px-10">
          <div className="rounded-[12px] border border-[var(--border)] bg-[var(--panel)] p-6 text-sm text-[var(--muted-foreground)]">
            Loading session detail...
          </div>
        </div>
      ) : session ? (
        <SessionBreakdownPanel session={session} />
      ) : null}
      {supportsInsight ? (
        <div className="px-4 sm:px-8 lg:px-10">
          <LiveSessionInsight key={sessionId} sessionId={sessionId} />
        </div>
      ) : null}
      {!loading && session ? (
        <div className="px-4 sm:px-8 lg:px-10">
          <MessageAnalyticsPanel sessionId={sessionId} />
        </div>
      ) : null}
    </DetailLayoutShell>
  );
}
