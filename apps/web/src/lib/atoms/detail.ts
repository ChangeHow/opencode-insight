import { atom } from "jotai";
import type { DayBreakdown, SessionDetailBreakdown } from "@opencode-dashboard/shared";

export const dayAtom = atom<DayBreakdown | null>(null);
export const sessionAtom = atom<SessionDetailBreakdown | null>(null);
export const detailLoadingAtom = atom(false);
