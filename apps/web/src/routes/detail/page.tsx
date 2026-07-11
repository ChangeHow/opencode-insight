import { useEffect } from "react";
import type { SessionBreakdown } from "@opencode-dashboard/shared";
import { useAtom, useAtomValue } from "jotai";
import { useParams } from "@tanstack/react-router";
import { DayBreakdownPanel } from "@/components/dashboard/day-breakdown";
import { DetailLayoutShell } from "@/components/dashboard/detail-layout-shell";
import { SessionListPanel } from "@/components/dashboard/session-list";
import { customDateRangeAtom, dayAtom, detailLoadingAtom, errorAtom, rangeAtom } from "@/lib/atoms";
import { fetchDay } from "@/lib/api";

const TOKEN_THRESHOLD = 1_000_000;

function splitSessionsByTokenThreshold(sessions: SessionBreakdown[]) {
  const highTokenSessions: SessionBreakdown[] = [];
  const lowTokenSessions: SessionBreakdown[] = [];

  for (const session of sessions) {
    if (session.tokens >= TOKEN_THRESHOLD) {
      highTokenSessions.push(session);
    } else {
      lowTokenSessions.push(session);
    }
  }

  return { highTokenSessions, lowTokenSessions };
}

export function DetailPage() {
  const { date } = useParams({ from: "/dashboard/detail/$date" });
  const range = useAtomValue(rangeAtom);
  const customDateRange = useAtomValue(customDateRangeAtom);
  const [day, setDay] = useAtom(dayAtom);
  const [detailLoading, setDetailLoading] = useAtom(detailLoadingAtom);
  const [, setError] = useAtom(errorAtom);

  useEffect(() => {
    let canceled = false;
    setDetailLoading(true);

    async function loadDetail() {
      try {
        const detail = await fetchDay(range, date, customDateRange);
        if (!canceled) {
          setDay(detail);
          setError(null);
        }
      } catch (loadError) {
        if (!canceled) {
          setDay(null);
          setError(loadError instanceof Error ? loadError.message : "Failed to load day detail.");
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
  }, [customDateRange, date, range, setDay, setDetailLoading, setError]);

  const sessions = day?.sessions ?? [];
  const { highTokenSessions, lowTokenSessions } = splitSessionsByTokenThreshold(sessions);
  const totalSessions = sessions.length;
  const filteredCount = totalSessions - highTokenSessions.length;

  return (
    <DetailLayoutShell backTo="/overview" backLabel="Back to overview">
      <DayBreakdownPanel day={day} loading={detailLoading} />

      <div className="px-4 sm:px-8 lg:px-10">
        {!detailLoading && (
          <SessionListPanel
            date={date}
            sessions={highTokenSessions}
            hiddenSessions={lowTokenSessions}
            totalSessions={totalSessions}
            filteredCount={filteredCount}
          />
        )}
      </div>
    </DetailLayoutShell>
  );
}
