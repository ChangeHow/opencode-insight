import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { CostSeriesLine, CostSeriesOption, DashboardSummary, DayBreakdown, HeatmapDay, MessageDetail, MessageDistributionPayload, MessageOverviewPayload, ProviderInsight, SessionBreakdown, TimeRange, TrendPoint } from "@opencode-dashboard/shared";
import { getPresetDateRange } from "@/lib/date-range";

export type ThemeMode = "light" | "dark" | "system";

export const rangeAtom = atom<TimeRange>("7d");
export const customDateRangeAtom = atom<{ start: string; end: string }>(getPresetDateRange("7d"));
export const themeAtom = atomWithStorage<ThemeMode>("opencode-telescope-theme", "system");
export const summaryAtom = atom<DashboardSummary | null>(null);
export const heatmapAtom = atom<HeatmapDay[]>([]);
export const trendAtom = atom<TrendPoint[]>([]);
export const seriesOptionsAtom = atom<CostSeriesOption[]>([]);
export const selectedSeriesKeysAtom = atom<string[]>([]);
export const seriesLinesAtom = atom<CostSeriesLine[]>([]);
export const providerInsightsAtom = atom<ProviderInsight[]>([]);
export const dashboardStateAtom = atom<{ key: string | null; refreshTick: number; lastRefreshAt: Date | null }>({ key: null, refreshTick: -1, lastRefreshAt: null });
export const bumpDashboardRefreshAtom = atom(null, (_get, set) => {
  set(dashboardStateAtom, (prev) => ({ ...prev, refreshTick: prev.refreshTick + 1 }));
});
export const dayAtom = atom<DayBreakdown | null>(null);
export const sessionAtom = atom<SessionBreakdown | null>(null);
export const loadingAtom = atom(true);
export const detailLoadingAtom = atom(false);
export const errorAtom = atom<string | null>(null);

// Message analytics atoms
export const messageOverviewAtom = atom<MessageOverviewPayload | null>(null);
export const messageDistributionAtom = atom<MessageDistributionPayload | null>(null);
export const messagesAtom = atom<MessageDetail[]>([]);
export const messagesTotalAtom = atom(0);
export const messagesPageAtom = atom(0);
export const messagesLoadingAtom = atom(false);

// Session-level cache for message overview + distribution (avoids re-fetch on tab switch)
const MESSAGE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface MessageSessionCacheEntry {
  overview: MessageOverviewPayload;
  distribution: MessageDistributionPayload;
  fetchedAt: number;
}

export const messageSessionCache = new Map<string, MessageSessionCacheEntry>();

export function getMessageSessionCache(sessionId: string): MessageSessionCacheEntry | null {
  const entry = messageSessionCache.get(sessionId);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > MESSAGE_CACHE_TTL_MS) {
    messageSessionCache.delete(sessionId);
    return null;
  }
  return entry;
}

export function setMessageSessionCache(
  sessionId: string,
  overview: MessageOverviewPayload,
  distribution: MessageDistributionPayload,
): void {
  messageSessionCache.set(sessionId, { overview, distribution, fetchedAt: Date.now() });
}
