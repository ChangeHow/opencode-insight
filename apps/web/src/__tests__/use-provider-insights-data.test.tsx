import { vi, describe, test, expect, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import {
  dashboardStateAtom,
  errorAtom,
  loadingAtom,
  providerInsightsAtom,
  summaryAtom,
} from "../lib/atoms.js";
import { makeDashboardSummary, makeProviderInsightsPayload } from "./factories.js";

vi.mock("../lib/api.js", () => ({
  fetchProviders: vi.fn(),
  fetchSummary: vi.fn(),
  refreshSnapshot: vi.fn(),
}));

import { fetchProviders, fetchSummary } from "../lib/api.js";
import { useProviderInsightsData } from "../lib/use-provider-insights-data.js";

const mockFetchProviders = vi.mocked(fetchProviders);
const mockFetchSummary = vi.mocked(fetchSummary);

describe("useProviderInsightsData Hook", () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createStore();

    mockFetchSummary.mockResolvedValue(makeDashboardSummary());
    mockFetchProviders.mockResolvedValue(makeProviderInsightsPayload());
  });

  function wrapper({ children }: { children: ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  }

  test("loads summary and provider insights without fetching dashboard payload", async () => {
    const summary = makeDashboardSummary({ totalCost: 71.0012 });
    const providers = makeProviderInsightsPayload();

    mockFetchSummary.mockResolvedValue(summary);
    mockFetchProviders.mockResolvedValue(providers);

    renderHook(() => useProviderInsightsData(), { wrapper });

    await waitFor(() => {
      expect(store.get(loadingAtom)).toBe(false);
    });

    expect(mockFetchSummary).toHaveBeenCalledTimes(1);
    expect(mockFetchProviders).toHaveBeenCalledTimes(1);
    expect(store.get(summaryAtom)).toEqual(summary);
    expect(store.get(providerInsightsAtom)).toEqual(providers.providers);
    expect(store.get(dashboardStateAtom).key?.startsWith("providers:")).toBe(true);
  });

  test("clears provider atoms when request fails", async () => {
    mockFetchSummary.mockRejectedValue(new Error("Provider API error"));

    renderHook(() => useProviderInsightsData(), { wrapper });

    await waitFor(() => {
      expect(store.get(loadingAtom)).toBe(false);
    });

    expect(store.get(errorAtom)).toBe("Provider API error");
    expect(store.get(summaryAtom)).toBeNull();
    expect(store.get(providerInsightsAtom)).toEqual([]);
  });
});
