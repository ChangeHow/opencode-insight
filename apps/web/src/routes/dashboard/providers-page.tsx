import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  bumpDashboardRefreshAtom,
  customDateRangeAtom,
  errorAtom,
  loadingAtom,
  providerInsightsAtom,
  rangeAtom,
  summaryAtom,
} from "@/lib/atoms";
import { refreshSnapshot } from "@/lib/api";
import { getPresetDateRange, isTodayInputDate } from "@/lib/date-range";
import { useDashboardData } from "@/lib/use-dashboard-data";
import { ControlBar, formatDateSpan, MemoProviderInsightsPanel } from "./shared";
import { DashboardPageLayout, StickyHeaderShell } from "./layout";

export function ProvidersPage() {
  useDashboardData();

  const [range, setRange] = useAtom(rangeAtom);
  const [customDateRange, setCustomDateRange] = useAtom(customDateRangeAtom);
  const providers = useAtomValue(providerInsightsAtom);
  const summary = useAtomValue(summaryAtom);
  const loading = useAtomValue(loadingAtom);
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
            currentView="providers"
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
          <div className="rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-6 text-sm text-red-700">{error}</div>
        </div>
      ) : null}

      <div className="px-6 sm:px-8 lg:px-10">
      <MemoProviderInsightsPanel
        providers={providers}
        loading={loading}
        rangeLabel={formatDateSpan(customDateRange.start, customDateRange.end)}
        emptyActionLabel="Reset to 7d"
        onEmptyAction={() => {
          setRange("7d");
          setCustomDateRange(getPresetDateRange("7d"));
        }}
      />
      </div>
    </DashboardPageLayout>
  );
}
