import { useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { customDateRangeAtom, providerInsightsAtom, rangeAtom, summaryAtom } from "@/lib/atoms";
import { fetchProviders } from "@/lib/api";
import { useDataFetcher } from "@/lib/use-data-fetcher";

export function useProviderInsightsData() {
  const range = useAtomValue(rangeAtom);
  const customDateRange = useAtomValue(customDateRangeAtom);
  const setSummary = useSetAtom(summaryAtom);
  const setProviderInsights = useSetAtom(providerInsightsAtom);

  useDataFetcher({
    prefix: "providers",
    fetchFn: useCallback(() => fetchProviders(range, customDateRange), [range, customDateRange]),
    onSuccess: useCallback(
      (payload: Awaited<ReturnType<typeof fetchProviders>>) => {
        setSummary(payload.summary ?? null);
        setProviderInsights(payload.providers);
      },
      [setProviderInsights, setSummary],
    ),
    onError: useCallback(() => {
      setSummary(null);
      setProviderInsights([]);
    }, [setProviderInsights, setSummary]),
  });
}
