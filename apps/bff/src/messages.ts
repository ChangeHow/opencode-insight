import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type {
  MessageDetail,
  MessageDistributionPayload,
  MessageListPayload,
  MessageOverviewPayload,
  MessagePart,
  MessagePartReasoning,
  MessagePartText,
  MessagePartTool,
  MessageTokenPoint,
  TimelinePoint,
  TokenBreakdown,
  ToolUsageStat,
} from "@opencode-dashboard/shared";
import { logger } from "./logger.js";

// ---------- path helper (mirrors usage.ts) ----------

export function getDbPath(): string {
  const configuredRoot = process.env.OPENCODE_DATA_DIR;
  const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? "";
  const defaultRoot = path.join(homeDir, ".local", "share", "opencode");
  const root =
    configuredRoot && configuredRoot.trim().length > 0 ? configuredRoot : defaultRoot;
  return path.join(root, "opencode.db");
}

// ---------- internal raw types from sqlite ----------

interface RawMessageRow {
  id: string;
  data: string;
  session_id: string;
}

interface RawPartRow {
  id: string;
  message_id: string;
  data: string;
}

interface ParsedMessageData {
  role?: string;
  time?: { created?: number; completed?: number };
  modelID?: string;
  providerID?: string;
  cost?: number;
  tokens?: {
    input?: number;
    output?: number;
    reasoning?: number | null;
    cache?: { read?: number; write?: number };
  };
  finish?: string;
}

interface ParsedPartData {
  type?: string;
  text?: string;
  time?: { start?: number; end?: number };
  callID?: string;
  tool?: string;
  state?: {
    status?: string;
    input?: unknown;
    output?: unknown;
    title?: string;
    time?: { start?: number; end?: number };
  };
}

interface MessagePayloadCacheEntry {
  overview: MessageOverviewPayload;
  distribution: MessageDistributionPayload;
  listFn: (page: number, pageSize: number) => MessageListPayload;
  expiresAt: number;
}

const MESSAGE_PAYLOAD_CACHE_TTL_MS = 5 * 60 * 1000;
const MESSAGE_PAYLOAD_CACHE_MAX_ENTRIES = 100;
const messagePayloadCache = new Map<string, MessagePayloadCacheEntry>();

// ---------- helpers ----------

function emptyTokens(): TokenBreakdown {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 };
}

function normalizeTokens(t: ParsedMessageData["tokens"]): TokenBreakdown {
  if (!t) return emptyTokens();
  return {
    input: Math.max(0, Math.trunc(t.input ?? 0)),
    output: Math.max(0, Math.trunc(t.output ?? 0)),
    cacheRead: Math.max(0, Math.trunc(t.cache?.read ?? 0)),
    cacheWrite: Math.max(0, Math.trunc(t.cache?.write ?? 0)),
    reasoning: Math.max(0, Math.trunc(t.reasoning ?? 0)),
  };
}

function totalTokenCount(t: TokenBreakdown): number {
  return t.input + t.output + t.cacheRead + t.cacheWrite + t.reasoning;
}

function outputToString(output: unknown): string {
  if (output === null || output === undefined) return "";
  if (typeof output === "string") return output;
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}

function pruneMessagePayloadCache(now: number) {
  for (const [key, entry] of messagePayloadCache) {
    if (entry.expiresAt <= now) {
      messagePayloadCache.delete(key);
    }
  }

  while (messagePayloadCache.size > MESSAGE_PAYLOAD_CACHE_MAX_ENTRIES) {
    const oldestKey = messagePayloadCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    messagePayloadCache.delete(oldestKey);
  }
}

function getMessagePayloadCacheKey(dbPath: string, sessionId: string): string {
  if (!fs.existsSync(dbPath)) {
    return `${dbPath}:missing:${sessionId}`;
  }

  try {
    const stat = fs.statSync(dbPath);
    return `${dbPath}:${stat.size}:${stat.mtimeMs}:${sessionId}`;
  } catch {
    return `${dbPath}:unknown:${sessionId}`;
  }
}

export function invalidateMessagePayloadCache() {
  messagePayloadCache.clear();
}

// ---------- sqlite queries ----------

function queryMessages(dbPath: string, sessionId: string): RawMessageRow[] {
  if (!fs.existsSync(dbPath)) return [];
  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const stmt = db.prepare<[string], RawMessageRow>(`
      SELECT m.id, m.data, m.session_id
      FROM message m
      WHERE m.session_id = ?
      ORDER BY m.time_created ASC
    `);
    return stmt.all(sessionId);
  } catch (err) {
    logger.error({ err, dbPath, sessionId }, "Failed to query messages");
    return [];
  } finally {
    db?.close();
  }
}

function queryParts(dbPath: string, sessionId: string): RawPartRow[] {
  if (!fs.existsSync(dbPath)) return [];
  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const stmt = db.prepare<[string], RawPartRow>(`
      SELECT p.id, p.message_id, p.data
      FROM part p
      WHERE p.session_id = ?
        AND json_extract(p.data, '$.type') IN ('text', 'tool', 'reasoning')
      ORDER BY p.time_created ASC
    `);
    return stmt.all(sessionId);
  } catch (err) {
    logger.error({ err, dbPath, sessionId }, "Failed to query parts");
    return [];
  } finally {
    db?.close();
  }
}

// ---------- parsers ----------

function parsePart(row: RawPartRow): MessagePart | null {
  let data: ParsedPartData;
  try {
    data = JSON.parse(row.data) as ParsedPartData;
  } catch {
    return null;
  }

  const partTime = { start: data.time?.start ?? 0, end: data.time?.end ?? 0 };

  if (data.type === "text") {
    const part: MessagePartText = {
      type: "text",
      text: data.text ?? "",
      time: partTime,
    };
    return part;
  }

  if (data.type === "reasoning") {
    const part: MessagePartReasoning = {
      type: "reasoning",
      text: data.text ?? "",
      time: partTime,
    };
    return part;
  }

  if (data.type === "tool") {
    const stateTime = data.state?.time ?? {};
    const part: MessagePartTool = {
      type: "tool",
      callId: data.callID ?? "",
      toolName: data.tool ?? "",
      status: (data.state?.status as MessagePartTool["status"]) ?? "pending",
      input: data.state?.input ?? null,
      output: outputToString(data.state?.output),
      title: data.state?.title,
      time: {
        start: stateTime.start ?? partTime.start,
        end: stateTime.end ?? partTime.end,
      },
    };
    return part;
  }

  return null;
}

function parseMessage(row: RawMessageRow, parts: MessagePart[]): MessageDetail | null {
  let data: ParsedMessageData;
  try {
    data = JSON.parse(row.data) as ParsedMessageData;
  } catch {
    return null;
  }

  const role = data.role === "user" ? "user" : data.role === "assistant" ? "assistant" : null;
  if (!role) return null;

  return {
    id: row.id,
    role,
    createdAt: Math.trunc(data.time?.created ?? 0),
    completedAt: data.time?.completed ? Math.trunc(data.time.completed) : undefined,
    modelId: data.modelID,
    providerId: data.providerID,
    cost: Math.max(0, Number(data.cost ?? 0)),
    tokens: normalizeTokens(data.tokens),
    finish: data.finish,
    parts,
  };
}

// ---------- public payload builders ----------

export function buildMessagePayloads(
  dbPath: string,
  sessionId: string,
): {
  overview: MessageOverviewPayload;
  distribution: MessageDistributionPayload;
  listFn: (page: number, pageSize: number) => MessageListPayload;
} {
  const now = Date.now();
  pruneMessagePayloadCache(now);

  const cacheKey = getMessagePayloadCacheKey(dbPath, sessionId);
  const cached = messagePayloadCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return {
      overview: cached.overview,
      distribution: cached.distribution,
      listFn: cached.listFn,
    };
  }

  const rawMessages = queryMessages(dbPath, sessionId);
  const rawParts = queryParts(dbPath, sessionId);

  // group parts by message id
  const partsByMessage = new Map<string, MessagePart[]>();
  for (const row of rawParts) {
    const part = parsePart(row);
    if (!part) continue;
    const list = partsByMessage.get(row.message_id) ?? [];
    list.push(part);
    partsByMessage.set(row.message_id, list);
  }

  // parse messages (all roles, for timeline/distribution we need user too)
  const allMessages: MessageDetail[] = [];
  for (const row of rawMessages) {
    const parts = partsByMessage.get(row.id) ?? [];
    const msg = parseMessage(row, parts);
    if (msg) allMessages.push(msg);
  }

  const total = allMessages.length;

  // ---------- overview ----------
  const timeline: TimelinePoint[] = [];
  const toolCountMap = new Map<string, { count: number; totalTokens: number }>();
  let cumulativeTokens = 0;
  let cumulativeCost = 0;

  for (let i = 0; i < allMessages.length; i++) {
    const msg = allMessages[i];
    const msgTokens = totalTokenCount(msg.tokens);
    cumulativeTokens += msgTokens;
    cumulativeCost += msg.cost;

    timeline.push({
      messageIndex: i,
      role: msg.role,
      createdAt: msg.createdAt,
      tokens: msg.tokens,
      cost: msg.cost,
      cumulativeTokens,
      cumulativeCost,
    });

    // count tool calls in this message's parts
    for (const part of msg.parts) {
      if (part.type !== "tool") continue;
      const entry = toolCountMap.get(part.toolName) ?? { count: 0, totalTokens: 0 };
      entry.count += 1;
      entry.totalTokens += msgTokens;
      toolCountMap.set(part.toolName, entry);
    }
  }

  const toolUsage: ToolUsageStat[] = [...toolCountMap.entries()]
    .map(([tool, s]) => ({ tool, count: s.count, totalTokens: s.totalTokens }))
    .sort((a, b) => b.count - a.count || b.totalTokens - a.totalTokens);

  const overview: MessageOverviewPayload = { timeline, toolUsage, totalMessages: total };

  // ---------- distribution ----------
  const points: MessageTokenPoint[] = allMessages.map((msg, i) => ({
    messageIndex: i,
    messageId: msg.id,
    role: msg.role,
    modelId: msg.modelId,
    providerId: msg.providerId,
    tokens: msg.tokens,
  }));

  const distribution: MessageDistributionPayload = { points, totalMessages: total };

  // ---------- list (closure, lazy) ----------
  function listFn(page: number, pageSize: number): MessageListPayload {
    const start = page * pageSize;
    const slice = allMessages.slice(start, start + pageSize);
    return { messages: slice, total, page, pageSize };
  }

  messagePayloadCache.set(cacheKey, {
    overview,
    distribution,
    listFn,
    expiresAt: now + MESSAGE_PAYLOAD_CACHE_TTL_MS,
  });
  pruneMessagePayloadCache(now);

  return { overview, distribution, listFn };
}
