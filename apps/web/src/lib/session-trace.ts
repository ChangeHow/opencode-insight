import type {
  MessageDetail,
  MessagePartReasoning,
  MessagePartTool,
} from "@opencode-dashboard/shared";
import type { TraceRecord, TraceSpan, TraceSpanStatus } from "@evilmartians/agent-prism-types";
import type { TraceSpanAttribute } from "@evilmartians/agent-prism-types";
import { formatCompactNumber, formatCurrency } from "@/lib/format";
import { getModelDisplayName } from "@/lib/model-display";

function totalTokens(tokens: MessageDetail["tokens"]) {
  return tokens.input + tokens.output + tokens.reasoning + tokens.cacheRead + tokens.cacheWrite;
}

function toSpanStatus(part: MessagePartTool): TraceSpanStatus {
  if (part.status === "error") return "error";
  if (part.status === "pending") return "pending";
  return "success";
}

function attribute(key: string, value: string | number | boolean): TraceSpanAttribute {
  if (typeof value === "string") {
    return { key, value: { stringValue: value } };
  }
  if (typeof value === "boolean") {
    return { key, value: { boolValue: value } };
  }
  return { key, value: { intValue: String(value) } };
}

function reasoningPartSpan(
  message: MessageDetail,
  part: MessagePartReasoning,
  index: number,
): TraceSpan {
  const duration = Math.max(0, part.time.end - part.time.start);
  return {
    id: `${message.id}:reasoning:${index}`,
    title: "Reasoning",
    startTime: new Date(part.time.start),
    endTime: new Date(part.time.end),
    duration,
    type: "llm_call",
    raw: part.text,
    status: "success",
    attributes: [attribute("part.type", "reasoning"), attribute("text.length", part.text.length)],
    children: [],
  };
}

function toolPartSpan(message: MessageDetail, part: MessagePartTool, index: number): TraceSpan {
  const input =
    part.input === null || part.input === undefined
      ? undefined
      : typeof part.input === "string"
        ? part.input
        : JSON.stringify(part.input, null, 2);
  const duration = Math.max(0, part.time.end - part.time.start);

  return {
    id: `${message.id}:tool:${index}:${part.callId}`,
    title: part.title ?? part.toolName,
    startTime: new Date(part.time.start),
    endTime: part.time.end > part.time.start ? new Date(part.time.end) : new Date(part.time.start),
    duration,
    type: "tool_execution",
    raw: part.output ?? "",
    input,
    output: part.output || undefined,
    status: toSpanStatus(part),
    attributes: [
      attribute("tool.name", part.toolName),
      attribute("tool.call_id", part.callId),
      attribute("tool.status", part.status),
    ],
    children: [],
  };
}

function messageSpan(message: MessageDetail): TraceSpan {
  const start = message.parts.length > 0 ? message.parts[0].time.start : message.createdAt;
  const end =
    message.completedAt ??
    (message.parts.length > 0
      ? Math.max(...message.parts.map((part) => part.time.end))
      : message.createdAt);
  const tokens = totalTokens(message.tokens);
  const label =
    message.role === "user"
      ? "User turn"
      : `${getModelDisplayName(message.modelId ?? "", message.providerId)} turn`;

  // Trace spans focus on *actions* (tools, reasoning) — message text lives in
  // the Transcript tab and would only bloat the trace DOM (large sessions
  // render 1000+ cards, which crashes weaker machines).
  const children: TraceSpan[] = message.parts
    .map((part, index) => {
      if (part.type === "reasoning") return reasoningPartSpan(message, part, index);
      if (part.type === "tool") return toolPartSpan(message, part, index);
      return null;
    })
    .filter((span): span is TraceSpan => span !== null);

  return {
    id: message.id,
    title: label,
    startTime: new Date(start),
    endTime: new Date(end),
    duration: Math.max(0, end - start),
    type: "agent_invocation",
    raw: "",
    status: "success",
    cost: message.cost,
    tokensCount: tokens,
    attributes: [
      attribute("message.role", message.role),
      ...(message.modelId ? [attribute("gen_ai.request.model", message.modelId)] : []),
      ...(message.providerId ? [attribute("gen_ai.provider", message.providerId)] : []),
      ...(message.finish ? [attribute("message.finish", message.finish)] : []),
      attribute("gen_ai.usage.total_tokens", tokens),
      attribute("gen_ai.usage.input_tokens", message.tokens.input),
      attribute("gen_ai.usage.output_tokens", message.tokens.output),
      attribute("gen_ai.usage.cache_read_tokens", message.tokens.cacheRead),
      attribute("gen_ai.usage.cache_write_tokens", message.tokens.cacheWrite),
      attribute("gen_ai.usage.reasoning_tokens", message.tokens.reasoning),
      ...(message.cost > 0 ? [attribute("gen_ai.usage.cost", message.cost)] : []),
    ],
    children,
  };
}

export function buildSessionTrace(messages: MessageDetail[]): {
  record: TraceRecord;
  spans: TraceSpan[];
} {
  const spans = messages.map(messageSpan);
  const first = messages[0];
  const last = messages[messages.length - 1];
  const startMs = first ? first.createdAt : 0;
  const endMs = messages.reduce(
    (latest, message) =>
      Math.max(
        latest,
        message.completedAt ??
          (message.parts.length > 0
            ? Math.max(...message.parts.map((part) => part.time.end))
            : message.createdAt),
      ),
    startMs,
  );
  const totalTokensSum = messages.reduce((sum, message) => sum + totalTokens(message.tokens), 0);
  const totalCost = messages.reduce((sum, message) => sum + message.cost, 0);

  const record: TraceRecord = {
    id: first?.id ?? "session",
    name: "Session timeline",
    spansCount: spans.length,
    durationMs: Math.max(0, endMs - startMs),
    agentDescription: `${messages.length} turns · ${formatCompactNumber(totalTokensSum)} tokens · ${formatCurrency(totalCost)}`,
    totalCost,
    totalTokens: totalTokensSum,
    startTime: startMs,
  };

  return { record, spans };
}
