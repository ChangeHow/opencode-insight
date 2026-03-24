import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { CostSeriesLine, CostSeriesOption, DashboardSummary, DayBreakdown, HeatmapDay, ProviderInsight, TimeRange, TrendPoint } from "@opencode-dashboard/shared";
import { getPresetDateRange } from "@/lib/date-range";

export type ThemeMode = "light" | "dark" | "system";

export const rangeAtom = atom<TimeRange>("month");
export const customDateRangeAtom = atom<{ start: string; end: string }>(getPresetDateRange("month"));
export const refreshTickAtom = atom(0);
export const themeAtom = atomWithStorage<ThemeMode>("opencode-telescope-theme", "system");
export const summaryAtom = atom<DashboardSummary | null>(null);
export const heatmapAtom = atom<HeatmapDay[]>([]);
export const trendAtom = atom<TrendPoint[]>([]);
export const seriesOptionsAtom = atom<CostSeriesOption[]>([]);
export const selectedSeriesKeysAtom = atom<string[]>([]);
export const seriesLinesAtom = atom<CostSeriesLine[]>([]);
export const providerInsightsAtom = atom<ProviderInsight[]>([]);
export const dayAtom = atom<DayBreakdown | null>(null);
export const loadingAtom = atom(true);
export const detailLoadingAtom = atom(false);
export const errorAtom = atom<string | null>(null);
