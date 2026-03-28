import type { ReactNode } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  bumpDashboardRefreshAtom,
  customDateRangeAtom,
  errorAtom,
  rangeAtom,
  summaryAtom,
} from "@/lib/atoms";
import { refreshSnapshot } from "@/lib/api";
import { isTodayInputDate } from "@/lib/date-range";
import { DashboardPageLayout, StickyHeaderShell } from "@/routes/dashboard/layout";
import { ControlBar } from "@/routes/dashboard/shared";

export function ListLayoutShell({
  currentView,
  children,
}: {
  currentView: "overview" | "providers";
  children: ReactNode;
}) {
  const [range, setRange] = useAtom(rangeAtom);
  const [customDateRange, setCustomDateRange] = useAtom(customDateRangeAtom);
  const summary = useAtomValue(summaryAtom);
  const error = useAtomValue(errorAtom);
  const bumpRefresh = useSetAtom(bumpDashboardRefreshAtom);
  const canRefresh = isTodayInputDate(customDateRange.end);

  async function handleRefresh() {
    await refreshSnapshot();
    bumpRefresh();
  }

  return (
    <DashboardPageLayout
      header={
        <StickyHeaderShell>
          <ControlBar
            currentView={currentView}
            range={range}
            setRange={setRange}
            customDateRange={customDateRange}
            setCustomDateRange={setCustomDateRange}
            scannedAt={summary?.scannedAt}
            onRefresh={handleRefresh}
            canRefresh={canRefresh}
          />
        </StickyHeaderShell>
      }
    >
      {error ? (
        <div className="px-6 sm:px-8 lg:px-10">
          <div className="rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-6 text-sm text-red-700">
            {error}
          </div>
        </div>
      ) : null}
      {children}
    </DashboardPageLayout>
  );
}
