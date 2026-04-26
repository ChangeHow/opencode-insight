import { useCallback, useEffect, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import type { ProviderDashboardPayload } from "@opencode-dashboard/shared";
import { ListLayoutShell } from "@/components/dashboard/list-layout-shell";
import { ProviderDetailSheet } from "@/components/dashboard/provider-detail-sheet";
import {
  providerInsightsAtom,
  rangeAtom,
  summaryAtom,
  customDateRangeAtom,
  loadingAtom,
} from "@/lib/atoms";
import { fetchProviderDashboard } from "@/lib/api";
import { getPresetDateRange } from "@/lib/date-range";
import { useProviderInsightsData } from "@/lib/use-provider-insights-data";
import { formatDateSpan, MemoProviderInsightsPanel } from "./shared";

export function ProvidersPage() {
  useProviderInsightsData();

  const [range, setRange] = useAtom(rangeAtom);
  const [customDateRange, setCustomDateRange] = useAtom(customDateRangeAtom);
  const providers = useAtomValue(providerInsightsAtom);
  const summary = useAtomValue(summaryAtom);
  const loading = useAtomValue(loadingAtom);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [providerDetail, setProviderDetail] = useState<ProviderDashboardPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const loadProviderDetail = useCallback(
    async (providerId: string) => {
      setDetailLoading(true);
      setDetailError(null);

      try {
        const detail = await fetchProviderDashboard(providerId, range, customDateRange);
        setProviderDetail(detail);
      } catch (detailError) {
        setProviderDetail(null);
        setDetailError(
          detailError instanceof Error ? detailError.message : "Failed to load provider detail.",
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [customDateRange, range],
  );

  useEffect(() => {
    if (!activeProviderId) {
      return;
    }

    void loadProviderDetail(activeProviderId);
  }, [activeProviderId, loadProviderDetail, summary?.scannedAt]);

  function handleProviderSelect(providerId: string) {
    setProviderDetail(null);
    setDetailError(null);
    setActiveProviderId(providerId);
  }

  return (
    <ListLayoutShell currentView="providers">
      <div className="px-4 sm:px-8 lg:px-10">
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
    </ListLayoutShell>
  );
}
