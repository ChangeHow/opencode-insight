import { atom } from "jotai";
import type {
  MessageDetail,
  MessageDistributionPayload,
  MessageOverviewPayload,
} from "@opencode-dashboard/shared";

export const messageOverviewAtom = atom<MessageOverviewPayload | null>(null);
export const messageDistributionAtom = atom<MessageDistributionPayload | null>(null);
export const messagesAtom = atom<MessageDetail[]>([]);
export const messagesTotalAtom = atom(0);
export const messagesPageAtom = atom(0);
export const messagesLoadingAtom = atom(false);

const MESSAGE_CACHE_TTL_MS = 5 * 60 * 1000;

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
