import fs from "node:fs";
import path from "node:path";
import type { MessageDetail, MessagePartTool, TokenBreakdown } from "@opencode-dashboard/shared";
import { buildMessagePayloadsFromMessages, type MessagePayloads } from "./message-payloads";
import {
  cleanCodexUserText,
  isInjectedCodexContext,
  listCodexSessionFiles,
} from "./usage/codex-reader";

const MAX_CACHE_ENTRIES = 100;
const payloadCache = new Map<string, MessagePayloads>();

function emptyTokens(): TokenBreakdown {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function textValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function timestamp(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value < 10_000_000_000 ? value * 1000 : value);
  }
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function outputText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function toolInput(value: unknown): unknown {
  if (typeof value !== "string") return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function responseText(payload: Record<string, unknown>): string | undefined {
  const content = payload.content;
  if (!Array.isArray(content)) return textValue(payload.text) ?? textValue(payload.message);
  return content
    .map((item) => {
      const part = record(item);
      return part ? (textValue(part.text) ?? textValue(part.content) ?? "") : "";
    })
    .join("");
}

function cacheKey(filePath: string): string | undefined {
  try {
    const stat = fs.statSync(filePath);
    return `${filePath}:${stat.size}:${stat.mtimeMs}`;
  } catch {
    return undefined;
  }
}

function cache(payloadKey: string, payloads: MessagePayloads): MessagePayloads {
  payloadCache.set(payloadKey, payloads);
  while (payloadCache.size > MAX_CACHE_ENTRIES) {
    const oldest = payloadCache.keys().next().value;
    if (!oldest) break;
    payloadCache.delete(oldest);
  }
  return payloads;
}

export function buildCodexMessagePayloads(
  sessionDirs: string[],
  sessionId: string,
): MessagePayloads {
  const slug = sessionId.startsWith("codex:") ? sessionId.slice("codex:".length) : "";
  const filePath = slug
    ? listCodexSessionFiles(sessionDirs).find(
        (candidate) => path.basename(candidate, ".jsonl") === slug,
      )
    : undefined;
  if (!filePath) return buildMessagePayloadsFromMessages([]);
  const key = cacheKey(filePath);
  if (!key) return buildMessagePayloadsFromMessages([]);
  const cached = payloadCache.get(key);
  if (cached) return cached;

  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return buildMessagePayloadsFromMessages([]);
  }

  const messages: MessageDetail[] = [];
  const assistants = new Map<string, MessageDetail>();
  const tools = new Map<string, MessagePartTool>();
  const canonicalUsers = new Set<string>();
  const canonicalAssistants = new Set<string>();
  const fallbacks: Array<{ role: "user" | "assistant"; text: string; at: number }> = [];
  let modelId: string | undefined;
  let providerId: string | undefined;
  let currentAssistant: MessageDetail | undefined;
  let assistantNumber = 0;

  const createAssistant = (at: number, turnId?: string) => {
    const assistant: MessageDetail = {
      id: `codex:${slug}:assistant:${turnId ?? assistantNumber++}`,
      role: "assistant",
      createdAt: at,
      modelId,
      providerId,
      cost: 0,
      tokens: emptyTokens(),
      parts: [],
    };
    messages.push(assistant);
    currentAssistant = assistant;
    if (turnId) assistants.set(turnId, assistant);
    return assistant;
  };

  for (const [index, line] of content.split(/\r?\n/).entries()) {
    let entry: Record<string, unknown> | undefined;
    try {
      entry = record(JSON.parse(line));
    } catch {
      continue;
    }
    const payload = record(entry?.payload);
    if (!entry || !payload) continue;
    const at = timestamp(entry.timestamp, index);
    if (entry.type === "session_meta") {
      providerId = textValue(payload.provider) ?? textValue(payload.model_provider) ?? providerId;
      continue;
    }
    if (entry.type === "turn_context") {
      const modelInfo = record(payload.model_info);
      modelId = textValue(modelInfo?.slug) ?? textValue(payload.model) ?? modelId;
      continue;
    }
    if (entry.type === "event_msg") {
      const eventType = textValue(payload.type);
      if (eventType === "task_started" || eventType === "turn_started") {
        createAssistant(timestamp(payload.started_at, at), textValue(payload.turn_id));
      } else if (eventType === "task_complete" || eventType === "turn_complete") {
        const assistant = assistants.get(textValue(payload.turn_id) ?? "") ?? currentAssistant;
        if (assistant) assistant.completedAt = timestamp(payload.completed_at, at);
      } else if (eventType === "user_message") {
        const text = cleanCodexUserText(
          textValue(payload.message) ?? textValue(payload.text) ?? "",
        );
        if (text && !isInjectedCodexContext(text)) {
          canonicalUsers.add(text);
          messages.push({
            id: `codex:${slug}:user:${index}`,
            role: "user",
            createdAt: at,
            cost: 0,
            tokens: emptyTokens(),
            parts: [{ type: "text", text, time: { start: at, end: at } }],
          });
        }
      } else if (eventType === "agent_reasoning" || eventType === "agent_message") {
        const text = textValue(payload.text) ?? textValue(payload.message) ?? "";
        if (text) {
          if (eventType === "agent_message") canonicalAssistants.add(text);
          const assistant = currentAssistant ?? createAssistant(at);
          assistant.parts.push({
            type: eventType === "agent_reasoning" ? "reasoning" : "text",
            text,
            time: { start: at, end: at },
          });
        }
      } else if (eventType === "token_count") {
        const info = record(payload.info);
        const usage = record(info?.last_token_usage);
        if (usage && currentAssistant) {
          const input = Math.max(0, Math.trunc(Number(usage.input_tokens) || 0));
          const cacheRead = Math.min(
            input,
            Math.max(
              0,
              Math.trunc(
                Math.max(
                  Number(usage.cached_input_tokens) || 0,
                  Number(usage.cache_read_input_tokens) || 0,
                ),
              ),
            ),
          );
          currentAssistant.tokens = {
            input: input - cacheRead,
            cacheRead,
            output: Math.max(0, Math.trunc(Number(usage.output_tokens) || 0)),
            cacheWrite: 0,
            reasoning: Math.max(0, Math.trunc(Number(usage.reasoning_output_tokens) || 0)),
          };
        }
      }
      continue;
    }
    if (entry.type !== "response_item") continue;
    const type = textValue(payload.type) ?? "";
    if (type === "message") {
      const role = textValue(payload.role);
      const text = responseText(payload);
      if ((role === "user" || role === "assistant") && text) {
        fallbacks.push({ role, text: role === "user" ? cleanCodexUserText(text) : text, at });
      }
      continue;
    }
    const callId = textValue(payload.call_id);
    if (["function_call", "custom_tool_call", "local_shell_call"].includes(type) && callId) {
      const tool: MessagePartTool = {
        type: "tool",
        callId,
        toolName: textValue(payload.name) ?? type,
        status: "pending",
        input: toolInput(payload.arguments ?? payload.input),
        output: "",
        time: { start: at, end: at },
      };
      (currentAssistant ?? createAssistant(at)).parts.push(tool);
      tools.set(callId, tool);
    } else if (type.endsWith("_output") && callId) {
      const tool = tools.get(callId);
      if (tool) {
        tool.output = outputText(payload.output ?? payload.content);
        tool.status = payload.error ? "error" : "completed";
        tool.time.end = at;
      }
    }
  }

  for (const fallback of fallbacks) {
    const seen = fallback.role === "user" ? canonicalUsers : canonicalAssistants;
    if (
      !fallback.text ||
      seen.has(fallback.text) ||
      (fallback.role === "user" && isInjectedCodexContext(fallback.text))
    )
      continue;
    if (fallback.role === "user") {
      messages.push({
        id: `codex:${slug}:user:fallback:${messages.length}`,
        role: "user",
        createdAt: fallback.at,
        cost: 0,
        tokens: emptyTokens(),
        parts: [
          { type: "text", text: fallback.text, time: { start: fallback.at, end: fallback.at } },
        ],
      });
    } else {
      const assistant = createAssistant(fallback.at);
      assistant.parts.push({
        type: "text",
        text: fallback.text,
        time: { start: fallback.at, end: fallback.at },
      });
    }
  }
  messages.sort(
    (left, right) =>
      (left.parts[0]?.time.start ?? left.createdAt) -
      (right.parts[0]?.time.start ?? right.createdAt),
  );
  return cache(key, buildMessagePayloadsFromMessages(messages));
}
