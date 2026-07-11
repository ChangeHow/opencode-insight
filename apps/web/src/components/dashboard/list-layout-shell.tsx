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
import { ControlBar } from "@/components/dashboard/dashboard-toolbar";
import { DashboardPageLayout, StickyHeaderShell } from "@/routes/layout";

export function ListLayoutShell({
  currentView,
  children,
}: {
  currentView: "overview" | "providers";
  children: ReactNode;
}) {
  const [range, setRange] = useAtom(rangeAtom);
  const customDateRange = useAtomValue(customDateRangeAtom);
  const summary = useAtomValue(summaryAtom);
  const [remoteUsage, setRemoteUsage] = useAtom(remoteUsageAtom);
  const error = useAtomValue(errorAtom);
  const bumpRefresh = useSetAtom(bumpDashboardRefreshAtom);
  const [remoteSyncing, setRemoteSyncing] = useState(false);
  const [remoteSyncStatus, setRemoteSyncStatus] = useState<string | null>(null);

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
            scannedAt={summary?.scannedAt}
            onRefresh={handleRefresh}
            onForceRemoteSync={handleForceRemoteSync}
            canRefresh
            remoteUsage={remoteUsage}
            remoteSyncing={remoteSyncing}
            remoteSyncStatus={remoteSyncStatus}
          />
        </StickyHeaderShell>
      }
    >
      {error ? (
        <div className="px-4 sm:px-8 lg:px-10">
          <div
            role="alert"
            className="border border-[var(--danger)] bg-[var(--danger-soft)] p-5 text-sm text-[var(--danger)]"
          >
            {error}
          </div>
        </div>
      ) : null}
      {children}
    </DashboardPageLayout>
  );
}
