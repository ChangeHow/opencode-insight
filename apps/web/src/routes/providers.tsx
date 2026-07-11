import { useCallback, useEffect, useRef, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import type { ProviderDashboardPayload } from "@opencode-dashboard/shared";
import { ListLayoutShell } from "@/components/dashboard/list-layout-shell";
import { ProviderDetailSheet } from "@/components/dashboard/provider-detail-sheet";
import { ProviderInsightsPage } from "@/components/dashboard/provider-insights-page";
import {
  providerInsightsAtom,
  rangeAtom,
  summaryAtom,
  customDateRangeAtom,
  loadingAtom,
} from "@/lib/atoms";
import { fetchProviderDashboard } from "@/lib/api";
import { getPresetDateRange } from "@/lib/date-range";
import { formatDateSpan } from "@/lib/format";
import { useProviderInsightsData } from "@/lib/use-provider-insights-data";

export function ProvidersPage() {
  useProviderInsightsData();

  const [range, setRange] = useAtom(rangeAtom);
  const [customDateRange, setCustomDateRange] = useAtom(customDateRangeAtom);
  const providers = useAtomValue(providerInsightsAtom);
  const summary = useAtomValue(summaryAtom);
  const loading = useAtomValue(loadingAtom);
  const presetDateRange = getPresetDateRange(range);
  const rangeLabel =
    range === "all"
      ? "All retained history"
      : formatDateSpan(presetDateRange.start, presetDateRange.end);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [providerDetail, setProviderDetail] = useState<ProviderDashboardPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailRequestRef = useRef(0);

  const loadProviderDetail = useCallback(
    async (providerId: string) => {
      const requestId = ++detailRequestRef.current;
      setDetailLoading(true);
      setDetailError(null);

      try {
        const detail = await fetchProviderDashboard(providerId, range, customDateRange);
        if (requestId !== detailRequestRef.current) return;
        setProviderDetail(detail);
      } catch (error) {
        if (requestId !== detailRequestRef.current) return;
        setProviderDetail(null);
        setDetailError(error instanceof Error ? error.message : "Failed to load provider detail.");
      } finally {
        if (requestId === detailRequestRef.current) {
          setDetailLoading(false);
        }
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
        <ProviderInsightsPage
          providers={providers}
          loading={loading}
          rangeLabel={rangeLabel}
          emptyActionLabel="Reset to 7d"
          onEmptyAction={() => {
            setRange("7d");
            setCustomDateRange({ start: "", end: "" });
          }}
          selectedProviderId={providerDetail?.provider?.providerId ?? activeProviderId}
          onSelectProvider={handleProviderSelect}
        />
      </div>

      <ProviderDetailSheet
        open={activeProviderId !== null}
        onOpenChange={(open) => {
          if (!open) {
            detailRequestRef.current += 1;
            setActiveProviderId(null);
            setProviderDetail(null);
            setDetailError(null);
          }
        }}
        providerId={activeProviderId}
        detail={providerDetail}
        loading={detailLoading}
        error={detailError}
        rangeLabel={rangeLabel}
        onRetry={() => {
          if (activeProviderId) {
            void loadProviderDetail(activeProviderId);
          }
        }}
      />
    </ListLayoutShell>
  );
}
