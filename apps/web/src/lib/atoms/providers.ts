import { atom } from "jotai";
import type { ProviderInsight } from "@opencode-dashboard/shared";

export const providerInsightsAtom = atom<ProviderInsight[]>([]);
