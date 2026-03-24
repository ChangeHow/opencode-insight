import { atom } from "jotai";
import type { DashboardSummary, DayBreakdown, HeatmapDay, TimeRange, TrendPoint } from "@opencode-dashboard/shared";

export const rangeAtom = atom<TimeRange>("30d");
export const selectedDateAtom = atom<string | null>(null);
export const refreshTickAtom = atom(0);
export const summaryAtom = atom<DashboardSummary | null>(null);
export const heatmapAtom = atom<HeatmapDay[]>([]);
export const trendAtom = atom<TrendPoint[]>([]);
export const dayAtom = atom<DayBreakdown | null>(null);
export const loadingAtom = atom(true);
export const detailLoadingAtom = atom(false);
export const errorAtom = atom<string | null>(null);
