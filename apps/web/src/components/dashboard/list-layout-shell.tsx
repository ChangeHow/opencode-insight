import type { ReactNode } from "react";
import { useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  bumpDashboardRefreshAtom,
  customDateRangeAtom,
  errorAtom,
  rangeAtom,
  remoteUsageAtom,
  summaryAtom,
} from "@/lib/atoms";
import { forceRemoteSync, refreshSnapshot } from "@/lib/api";
import { isTodayInputDate } from "@/lib/date-range";
import { DashboardPageLayout, StickyHeaderShell } from "@/routes/layout";
import { ControlBar } from "@/routes/shared";

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
  const [remoteUsage, setRemoteUsage] = useAtom(remoteUsageAtom);
  const error = useAtomValue(errorAtom);
  const bumpRefresh = useSetAtom(bumpDashboardRefreshAtom);
  const [remoteSyncing, setRemoteSyncing] = useState(false);
  const [remoteSyncStatus, setRemoteSyncStatus] = useState<string | null>(null);
  const canRefresh = isTodayInputDate(customDateRange.end);

  async function handleRefresh() {
    await refreshSnapshot();
    bumpRefresh();
  }

  async function handleForceRemoteSync() {
    if (remoteSyncing) return;
    setRemoteSyncing(true);
    setRemoteSyncStatus("Refreshing local data...");
    try {
      const result = await forceRemoteSync(range, customDateRange);
      setRemoteUsage(result.remote);
      bumpRefresh();
      const pushLabel = result.push.error
        ? `Upload failed: ${result.push.error}`
        : result.push.pushed
          ? `Uploaded ${result.push.days ?? 0} days`
          : result.push.reason === "disabled"
            ? "Remote sync disabled"
            : "No upload changes";
      setRemoteSyncStatus(
        result.remote.status === "stale"
          ? `${pushLabel}; pull failed: ${result.remote.error ?? "remote unavailable"}`
          : `${pushLabel}; remote pulled`,
      );
    } catch (syncError) {
      setRemoteSyncStatus(syncError instanceof Error ? syncError.message : "Remote sync failed.");
    } finally {
      setRemoteSyncing(false);
    }
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
            onForceRemoteSync={handleForceRemoteSync}
            canRefresh={canRefresh}
            remoteUsage={remoteUsage}
            remoteSyncing={remoteSyncing}
            remoteSyncStatus={remoteSyncStatus}
          />
        </StickyHeaderShell>
      }
    >
      {error ? (
        <div className="px-4 sm:px-8 lg:px-10">
          <div className="rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-6 text-sm text-red-700">
            {error}
          </div>
        </div>
      ) : null}
      {remoteUsage?.enabled && remoteUsage.status === "stale" ? (
        <div className="px-4 sm:px-8 lg:px-10">
          <div className="rounded-[28px] border border-red-500/40 bg-red-500/10 p-5 text-sm font-medium text-red-700 dark:text-red-300">
            Cloudflare remote data is not reachable. Showing stale or empty remote data
            {remoteUsage.error ? `: ${remoteUsage.error}` : "."}
          </div>
        </div>
      ) : null}
      {children}
    </DashboardPageLayout>
  );
}
