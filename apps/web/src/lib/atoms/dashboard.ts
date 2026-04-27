import { atom } from "jotai";
import type {
  CostSeriesLine,
  CostSeriesOption,
  DashboardSummary,
  HeatmapDay,
  RemoteUsagePayload,
  TrendPoint,
} from "@opencode-dashboard/shared";

export const summaryAtom = atom<DashboardSummary | null>(null);
export const heatmapAtom = atom<HeatmapDay[]>([]);
export const trendAtom = atom<TrendPoint[]>([]);
export const seriesOptionsAtom = atom<CostSeriesOption[]>([]);
export const selectedSeriesKeysAtom = atom<string[]>([]);
export const seriesLinesAtom = atom<CostSeriesLine[]>([]);
export const remoteUsageAtom = atom<RemoteUsagePayload | null>(null);
export const dashboardStateAtom = atom<{
  key: string | null;
  refreshTick: number;
  lastRefreshAt: Date | null;
}>({ key: null, refreshTick: -1, lastRefreshAt: null });
export const bumpDashboardRefreshAtom = atom(null, (_get, set) => {
  set(dashboardStateAtom, (prev) => ({ ...prev, refreshTick: prev.refreshTick + 1 }));
});
