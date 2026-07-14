import fs from "node:fs";
import path from "node:path";
import { DEFAULT_TIME_ZONE, formatDateInTimeZone } from "@opencode-dashboard/shared";
import { totalTokens } from "./sqlite-reader";
import type { RawMessage } from "./types";

type TokenUsage = Record<string, unknown>;

interface CodexState {
  sessionId?: string;
  sessionTitle?: string;
  fallbackTitle?: string;
  providerId: string;
  modelId: string;
  directory: string;
  forkParentId?: string;
  sourceParentId?: string;
  total?: ReturnType<typeof normalizeUsage>;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function cleanCodexUserText(text: string) {
  return text.replace(/^\s*## My request for Codex:\s*/i, "").trim();
}

export function isInjectedCodexContext(text: string) {
  const trimmed = text.trimStart();
  return ["<environment_context>", "<system-reminder>", "<user_instructions>"].some((prefix) =>
    trimmed.startsWith(prefix),
  );
}

function titleFromUserText(text: string) {
  const title = text.replace(/\s+/g, " ").trim();
  return title.length <= 80 ? title : `${title.slice(0, 77).trimEnd()}...`;
}

function readSessionTitles(sessionDirs: string[]) {
  const titles = new Map<string, string>();
  const root = sessionDirs[0] ? path.dirname(sessionDirs[0]) : "";
  if (!root) return titles;
  try {
    for (const line of fs
      .readFileSync(path.join(root, "session_index.jsonl"), "utf8")
      .split(/\r?\n/)) {
      try {
        const entry = JSON.parse(line) as { id?: unknown; thread_name?: unknown };
        const id = stringValue(entry.id);
        const title = stringValue(entry.thread_name);
        if (id && title) titles.set(id, title);
      } catch {
        continue;
      }
    }
  } catch {
    // Older Codex versions may not have a session index.
  }
  return titles;
}

function nonnegativeInteger(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function normalizeUsage(usage: TokenUsage) {
  const rawInput = nonnegativeInteger(usage.input_tokens);
  const rawCacheRead = Math.max(
    nonnegativeInteger(usage.cached_input_tokens),
    nonnegativeInteger(usage.cache_read_input_tokens),
  );
  const cacheRead = Math.min(rawInput, rawCacheRead);
  return {
    input: rawInput - cacheRead,
    cacheRead,
    output: nonnegativeInteger(usage.output_tokens),
    cacheWrite: 0,
    reasoning: nonnegativeInteger(usage.reasoning_output_tokens),
    rawInput,
    rawCacheRead,
  };
}

function sameUsage(
  left: ReturnType<typeof normalizeUsage>,
  right: ReturnType<typeof normalizeUsage>,
) {
  return (
    left.input === right.input &&
    left.cacheRead === right.cacheRead &&
    left.output === right.output &&
    left.reasoning === right.reasoning
  );
}

function usageDelta(
  total: ReturnType<typeof normalizeUsage>,
  previous: ReturnType<typeof normalizeUsage>,
) {
  return normalizeUsage({
    input_tokens: total.rawInput - previous.rawInput,
    cached_input_tokens: total.rawCacheRead - previous.rawCacheRead,
    output_tokens: total.output - previous.output,
    reasoning_output_tokens: total.reasoning - previous.reasoning,
  });
}

function isMonotonic(
  total: ReturnType<typeof normalizeUsage>,
  previous: ReturnType<typeof normalizeUsage>,
) {
  return (
    total.rawInput >= previous.rawInput &&
    total.rawCacheRead >= previous.rawCacheRead &&
    total.output >= previous.output &&
    total.reasoning >= previous.reasoning
  );
}

function usageTotal(usage: ReturnType<typeof normalizeUsage>) {
  return usage.rawInput + usage.output + usage.reasoning;
}

function isLikelyOlderSnapshot(
  total: ReturnType<typeof normalizeUsage>,
  previous: ReturnType<typeof normalizeUsage>,
  last: ReturnType<typeof normalizeUsage>,
) {
  if (isMonotonic(total, previous)) return false;
  const currentTotal = usageTotal(total);
  const previousTotal = usageTotal(previous);
  return (
    currentTotal * 100 >= previousTotal * 98 || currentTotal + 2 * usageTotal(last) >= previousTotal
  );
}

function toTokenBreakdown(usage: ReturnType<typeof normalizeUsage>) {
  return {
    input: usage.input,
    output: usage.output,
    cacheRead: usage.cacheRead,
    cacheWrite: 0,
    reasoning: usage.reasoning,
  };
}

function getForkParent(payload: Record<string, unknown>) {
  const fork = payload.fork;
  const forkRecord = fork && typeof fork === "object" ? (fork as Record<string, unknown>) : {};
  return (
    stringValue(payload.forked_from_id) ??
    stringValue(payload.fork_parent_id) ??
    stringValue(forkRecord.parent_id) ??
    stringValue(forkRecord.parent_session_id) ??
    stringValue(forkRecord.id)
  );
}

function getSourceParent(source: unknown) {
  if (!source || typeof source !== "object") {
    return undefined;
  }
  const subagent = (source as Record<string, unknown>).subagent;
  if (!subagent || typeof subagent !== "object") {
    return undefined;
  }
  const threadSpawn = (subagent as Record<string, unknown>).thread_spawn;
  return threadSpawn && typeof threadSpawn === "object"
    ? stringValue((threadSpawn as Record<string, unknown>).parent_thread_id)
    : undefined;
}

function timestampFor(entry: Record<string, unknown>, fallback: number) {
  const timestamp = stringValue(entry.timestamp);
  const parsed = timestamp ? Date.parse(timestamp) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getCodexPaths() {
  const configuredRoot = process.env.CODEX_HOME;
  const isDefault = !configuredRoot || configuredRoot.trim().length === 0;
  const root = isDefault
    ? path.join(process.env.HOME ?? process.env.USERPROFILE ?? "", ".codex")
    : configuredRoot.trim();
  return {
    root,
    sessionDirs: [path.join(root, "sessions"), path.join(root, "archived_sessions")],
    sessionIndexPath: path.join(root, "session_index.jsonl"),
    isDefault,
  };
}

export function listCodexSessionFiles(sessionDirs: string[]) {
  const files: string[] = [];
  const visit = (directory: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(entryPath);
      }
    }
  };
  for (const directory of sessionDirs) {
    visit(directory);
  }
  return files.toSorted();
}

function readSessionFile(filePath: string, sessionTitles: ReadonlyMap<string, string>) {
  let content: string;
  let mtimeMs: number;
  try {
    content = fs.readFileSync(filePath, "utf8");
    mtimeMs = Math.trunc(fs.statSync(filePath).mtimeMs);
  } catch {
    return [] as RawMessage[];
  }

  const slug = path.basename(filePath, ".jsonl");
  const state: CodexState = {
    providerId: "openai",
    modelId: "unknown",
    directory: path.normalize(path.dirname(filePath)),
  };
  const messages: Array<RawMessage & { runtime: "codex" }> = [];
  for (const [lineIndex, line] of content.split(/\r?\n/).entries()) {
    let entry: Record<string, unknown>;
    try {
      const value: unknown = JSON.parse(line);
      if (!value || typeof value !== "object") {
        continue;
      }
      entry = value as Record<string, unknown>;
    } catch {
      continue;
    }
    const payload = entry.payload;
    if (!payload || typeof payload !== "object") {
      continue;
    }
    const data = payload as Record<string, unknown>;
    if (entry.type === "session_meta") {
      state.sessionId = stringValue(data.session_id) ?? stringValue(data.id) ?? state.sessionId;
      state.sessionTitle =
        (state.sessionId ? sessionTitles.get(state.sessionId) : undefined) ?? state.sessionTitle;
      state.providerId =
        stringValue(data.provider) ?? stringValue(data.model_provider) ?? state.providerId;
      state.directory = path.normalize(stringValue(data.cwd) ?? state.directory);
      state.forkParentId = getForkParent(data) ?? state.forkParentId;
      state.sourceParentId = getSourceParent(data.source) ?? state.sourceParentId;
      continue;
    }
    if (entry.type === "event_msg" && data.type === "user_message") {
      const text = cleanCodexUserText(stringValue(data.message) ?? stringValue(data.text) ?? "");
      if (text && !isInjectedCodexContext(text)) {
        state.fallbackTitle ??= titleFromUserText(text);
      }
      continue;
    }
    if (entry.type === "turn_context") {
      const modelInfo = data.model_info;
      const info = data.info;
      const modelInfoRecord =
        modelInfo && typeof modelInfo === "object" ? (modelInfo as Record<string, unknown>) : {};
      const infoRecord = info && typeof info === "object" ? (info as Record<string, unknown>) : {};
      state.modelId =
        stringValue(modelInfoRecord.slug) ??
        stringValue(data.model) ??
        stringValue(data.model_name) ??
        stringValue(infoRecord.model) ??
        stringValue(infoRecord.model_name) ??
        state.modelId;
      continue;
    }
    if (entry.type !== "event_msg" || data.type !== "token_count") {
      continue;
    }
    const info = data.info;
    if (!info || typeof info !== "object") {
      continue;
    }
    const tokenInfo = info as Record<string, unknown>;
    const totalRaw = tokenInfo.total_token_usage;
    const lastRaw = tokenInfo.last_token_usage;
    const total =
      totalRaw && typeof totalRaw === "object" ? normalizeUsage(totalRaw as TokenUsage) : undefined;
    const last =
      lastRaw && typeof lastRaw === "object" ? normalizeUsage(lastRaw as TokenUsage) : undefined;
    let tokens: RawMessage["tokens"] | undefined;
    if (total && last) {
      if (
        !state.total ||
        (!sameUsage(total, state.total) && !isLikelyOlderSnapshot(total, state.total, last))
      ) {
        tokens = toTokenBreakdown(last);
      }
      if (!state.total || !isLikelyOlderSnapshot(total, state.total, last)) {
        state.total = total;
      }
    } else if (total) {
      if (!state.total) {
        tokens = toTokenBreakdown(total);
      } else if (isMonotonic(total, state.total)) {
        tokens = toTokenBreakdown(usageDelta(total, state.total));
      }
      state.total = total;
    } else if (last) {
      tokens = toTokenBreakdown(last);
    }
    if (!tokens || totalTokens(tokens) === 0) {
      continue;
    }
    const timestampMs = timestampFor(entry, mtimeMs);
    const scope = state.forkParentId ?? state.sourceParentId ?? state.sessionId ?? slug;
    const totalKey = total
      ? `${total.rawInput}:${total.rawCacheRead}:${total.output}:${total.reasoning}`
      : `${filePath}:${lineIndex}:${timestampMs}`;
    messages.push({
      id: `codex:${scope}:${state.providerId}:${state.modelId}:${totalKey}`,
      sessionId: `codex:${slug}`,
      sessionTitle: "Codex CLI session",
      sessionSlug: slug,
      sessionDirectory: state.directory,
      runtime: "codex",
      date: formatDateInTimeZone(timestampMs, DEFAULT_TIME_ZONE),
      timestampMs,
      modelId: state.modelId,
      providerId: state.providerId,
      cost: 0,
      estimatedCost: 0,
      pricedTokens: 0,
      tokens,
    });
  }
  const sessionTitle = state.sessionTitle ?? state.fallbackTitle ?? "Codex CLI session";
  return messages.map((message) => ({ ...message, sessionTitle }));
}

export function readCodexMessages(sessionDirs: string[], options?: { fromTimestampMs?: number }) {
  const deduped = new Map<string, RawMessage>();
  const sessionTitles = readSessionTitles(sessionDirs);
  for (const filePath of listCodexSessionFiles(sessionDirs)) {
    for (const message of readSessionFile(filePath, sessionTitles)) {
      if (!deduped.has(message.id)) {
        deduped.set(message.id, message);
      }
    }
  }
  return [...deduped.values()]
    .filter(
      (message) =>
        options?.fromTimestampMs === undefined || message.timestampMs >= options.fromTimestampMs,
    )
    .toSorted((left, right) => left.timestampMs - right.timestampMs);
}
