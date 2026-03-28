import { atom } from "jotai";
import type { DayBreakdown, SessionBreakdown } from "@opencode-dashboard/shared";

export const dayAtom = atom<DayBreakdown | null>(null);
export const sessionAtom = atom<SessionBreakdown | null>(null);
export const detailLoadingAtom = atom(false);
