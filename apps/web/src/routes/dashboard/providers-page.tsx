import { useCallback, useEffect, useState } from "react";
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
import type { ProviderDashboardPayload } from "@opencode-dashboard/shared";
import { ProviderDetailSheet } from "@/components/dashboard/provider-detail-sheet";
import { fetchProviderDashboard, refreshSnapshot } from "@/lib/api";
import { getPresetDateRange, isTodayInputDate } from "@/lib/date-range";
import { useProviderInsightsData } from "@/lib/use-provider-insights-data";
import { ControlBar, formatDateSpan, MemoProviderInsightsPanel } from "./shared";
import { DashboardPageLayout, StickyHeaderShell } from "./layout";

export function ProvidersPage() {
  useProviderInsightsData();

  const [range, setRange] = useAtom(rangeAtom);
  const [customDateRange, setCustomDateRange] = useAtom(customDateRangeAtom);
  const providers = useAtomValue(providerInsightsAtom);
  const summary = useAtomValue(summaryAtom);
  const loading = useAtomValue(loadingAtom);
  const error = useAtomValue(errorAtom);
  const bumpRefresh = useSetAtom(bumpDashboardRefreshAtom);
  const canRefresh = isTodayInputDate(customDateRange.end);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [providerDetail, setProviderDetail] = useState<ProviderDashboardPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const loadProviderDetail = useCallback(async (providerId: string) => {
    setDetailLoading(true);
    setDetailError(null);

    try {
      const detail = await fetchProviderDashboard(providerId, range, customDateRange);
      setProviderDetail(detail);
    } catch (detailError) {
      setProviderDetail(null);
      setDetailError(detailError instanceof Error ? detailError.message : "Failed to load provider detail.");
    } finally {
      setDetailLoading(false);
    }
  }, [customDateRange, range]);

  useEffect(() => {
    if (!activeProviderId) {
      return;
    }

    void loadProviderDetail(activeProviderId);
  }, [activeProviderId, loadProviderDetail, summary?.scannedAt]);

  async function handleRefresh() {
    await refreshSnapshot();
    bumpRefresh();
  }

  function handleProviderSelect(providerId: string) {
    setProviderDetail(null);
    setDetailError(null);
    setActiveProviderId(providerId);
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
          selectedProviderId={providerDetail?.provider?.providerId ?? activeProviderId}
          onSelectProvider={handleProviderSelect}
        />
      </div>

      <ProviderDetailSheet
        open={activeProviderId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setActiveProviderId(null);
            setProviderDetail(null);
            setDetailError(null);
          }
        }}
        providerId={activeProviderId}
        detail={providerDetail}
        loading={detailLoading}
        error={detailError}
        customRange={customDateRange}
        onRetry={() => {
          if (activeProviderId) {
            void loadProviderDetail(activeProviderId);
          }
        }}
      />
    </DashboardPageLayout>
  );
}
