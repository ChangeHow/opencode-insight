import { useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { customDateRangeAtom, providerInsightsAtom, rangeAtom, summaryAtom } from "@/lib/atoms";
import { fetchProviders, fetchSummary } from "@/lib/api";
import { useDataFetcher } from "@/lib/use-data-fetcher";

export function useProviderInsightsData() {
  const range = useAtomValue(rangeAtom);
  const customDateRange = useAtomValue(customDateRangeAtom);
  const setSummary = useSetAtom(summaryAtom);
  const setProviderInsights = useSetAtom(providerInsightsAtom);

  type ProviderInsightsFetchResult = [
    Awaited<ReturnType<typeof fetchSummary>>,
    Awaited<ReturnType<typeof fetchProviders>>,
  ];

  useDataFetcher({
    prefix: "providers",
    fetchFn: useCallback(
      async () =>
        Promise.all([fetchSummary(range, customDateRange), fetchProviders(range, customDateRange)]),
      [range, customDateRange],
    ),
    onSuccess: useCallback(
      ([summary, providers]: ProviderInsightsFetchResult) => {
        setSummary(summary);
        setProviderInsights(providers.providers);
      },
      [setProviderInsights, setSummary],
    ),
    onError: useCallback(() => {
      setSummary(null);
      setProviderInsights([]);
    }, [setProviderInsights, setSummary]),
  });
}
