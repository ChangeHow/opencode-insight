import { useEffect } from "react";
import { useAtom } from "jotai";
import { useParams } from "@tanstack/react-router";
import { MessageAnalyticsPanel } from "@/components/dashboard/message-analytics-panel";
import { SessionBreakdownPanel } from "@/components/dashboard/session-breakdown";
import { DetailLayoutShell } from "@/components/dashboard/detail-layout-shell";
import { detailLoadingAtom, errorAtom, sessionAtom } from "@/lib/atoms";
import { fetchSession } from "@/lib/api";

export function SessionDetailPage() {
  const { session: sessionId } = useParams({ from: "/dashboard/sessions/$session" });
  const [session, setSession] = useAtom(sessionAtom);
  const [loading, setLoading] = useAtom(detailLoadingAtom);
  const [, setError] = useAtom(errorAtom);

  useEffect(() => {
    let canceled = false;
    setLoading(true);

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
            loadError instanceof Error ? loadError.message : "Failed to load session detail.",
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
  }, [sessionId, setError, setLoading, setSession]);

  return (
    <DetailLayoutShell backTo="/overview" backLabel="Back to overview">
      {loading ? (
        <div className="mx-auto max-w-7xl px-4 sm:px-8 lg:px-10">
          <div className="rounded-[12px] border border-[var(--border)] bg-[var(--panel)] p-6 text-sm text-[var(--muted-foreground)]">
            Loading session detail...
          </div>
        </div>
      ) : session ? (
        <>
          <SessionBreakdownPanel session={session} />
          <div className="px-4 sm:px-8 lg:px-10">
            <MessageAnalyticsPanel sessionId={sessionId} />
          </div>
        </>
      ) : null}
    </DetailLayoutShell>
  );
}
