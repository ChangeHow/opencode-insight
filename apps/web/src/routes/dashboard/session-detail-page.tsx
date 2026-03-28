import { useEffect } from "react";
import { useAtom, useAtomValue } from "jotai";
import { useParams } from "@tanstack/react-router";
import { MessageAnalyticsPanel } from "@/components/dashboard/message-analytics-panel";
import { SessionBreakdownPanel } from "@/components/dashboard/session-breakdown";
import { DetailLayoutShell } from "@/components/dashboard/detail-layout-shell";
import {
  customDateRangeAtom,
  detailLoadingAtom,
  errorAtom,
  rangeAtom,
  sessionAtom,
} from "@/lib/atoms";
import { fetchSession, refreshSnapshot } from "@/lib/api";

export function SessionDetailPage() {
  const { date, session: sessionId } = useParams({ from: "/detail/$date/$session" });
  const range = useAtomValue(rangeAtom);
  const customDateRange = useAtomValue(customDateRangeAtom);
  const [session, setSession] = useAtom(sessionAtom);
  const [loading, setLoading] = useAtom(detailLoadingAtom);
  const [, setError] = useAtom(errorAtom);

  async function handleRefresh() {
    await refreshSnapshot();
    const data = await fetchSession(range, date, sessionId, customDateRange);
    setSession(data);
    setError(null);
  }

  useEffect(() => {
    let canceled = false;
    setLoading(true);

    async function loadSession() {
      try {
        const data = await fetchSession(range, date, sessionId, customDateRange);
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
  }, [customDateRange, date, range, sessionId, setError, setLoading, setSession]);

  return (
    <DetailLayoutShell
      backTo="/detail/$date"
      backParams={{ date }}
      backLabel="Back to day"
      title={`Session: ${session?.title || sessionId}`}
      date={date}
      onRefresh={handleRefresh}
    >
      {loading ? (
        <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-10">
          <div className="rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-6 text-sm text-[var(--muted-foreground)]">
            Loading session detail...
          </div>
        </div>
      ) : session ? (
        <>
          <SessionBreakdownPanel date={date} session={session} />
          <div className="px-6 sm:px-8 lg:px-10">
            <MessageAnalyticsPanel date={date} sessionId={sessionId} />
          </div>
        </>
      ) : null}
    </DetailLayoutShell>
  );
}
