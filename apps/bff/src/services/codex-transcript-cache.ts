import fs from "node:fs";
import path from "node:path";
import type { MessagePayloads } from "./message-payloads";
import { listCodexSessionFiles } from "./usage/codex-reader";

const MAX_CACHE_ENTRIES = 100;
const payloadCache = new Map<string, MessagePayloads>();
const sessionFileCache = new Map<string, string>();

function sessionCacheKey(sessionDirs: string[], slug: string) {
  return `${sessionDirs.join("\0")}\0${slug}`;
}

function payloadCacheKey(filePath: string): string | undefined {
  try {
    const stat = fs.statSync(filePath);
    return `${filePath}:${stat.size}:${stat.mtimeMs}`;
  } catch {
    return undefined;
  }
}

function resolveSessionFile(sessionDirs: string[], slug: string): string | undefined {
  const key = sessionCacheKey(sessionDirs, slug);
  const cached = sessionFileCache.get(key);
  if (cached && fs.existsSync(cached)) {
    return cached;
  }

  const filePath = listCodexSessionFiles(sessionDirs).find(
    (candidate) => path.basename(candidate, ".jsonl") === slug,
  );
  if (filePath) {
    sessionFileCache.set(key, filePath);
    while (sessionFileCache.size > MAX_CACHE_ENTRIES) {
      const oldest = sessionFileCache.keys().next().value;
      if (!oldest) break;
      sessionFileCache.delete(oldest);
    }
  } else {
    sessionFileCache.delete(key);
  }
  return filePath;
}

export function getCodexTranscriptCache(sessionDirs: string[], slug: string) {
  const filePath = resolveSessionFile(sessionDirs, slug);
  if (!filePath) return undefined;

  const payloadKey = payloadCacheKey(filePath);
  if (!payloadKey) {
    sessionFileCache.delete(sessionCacheKey(sessionDirs, slug));
    return undefined;
  }

  return { filePath, payloadKey, payloads: payloadCache.get(payloadKey) };
}

export function cacheCodexTranscriptPayload(
  payloadKey: string,
  payloads: MessagePayloads,
): MessagePayloads {
  payloadCache.set(payloadKey, payloads);
  while (payloadCache.size > MAX_CACHE_ENTRIES) {
    const oldest = payloadCache.keys().next().value;
    if (!oldest) break;
    payloadCache.delete(oldest);
  }
  return payloads;
}
