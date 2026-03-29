import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type { TimeRange } from "@opencode-dashboard/shared";
import { getPresetDateRange } from "@/lib/date-range";

export type ThemeMode = "light" | "dark" | "system";

export const rangeAtom = atom<TimeRange>("7d");
export const customDateRangeAtom = atom<{ start: string; end: string }>(getPresetDateRange("7d"));
export const themeAtom = atomWithStorage<ThemeMode>("opencode-telescope-theme", "system");
export const loadingAtom = atom(true);
export const errorAtom = atom<string | null>(null);
