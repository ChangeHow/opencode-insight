import type { Plugin } from "@opencode/plugin";
import { estimateTokens, type SessionInsight, type ToolInsight } from "@opencode-insight/telemetry";
import type { Collector } from "./collector";

type Events = ReturnType<Plugin.Context["event"]["subscribe"]>;
export type NativeEvent = Events extends AsyncIterable<infer E> ? E : never;

function tool(
  session: SessionInsight,
  id: string,
  name: string,
  requestID: string | undefined,
  now: number,
): ToolInsight {
  let result = session.tools.find((entry) => entry.id === id);
  if (!result) {
    result = { id, name, requestID, startedAt: now, status: "running", background: false };
    session.tools.push(result);
    if (session.tools.length > 2048) {
      session.tools.shift();
      session.interruptedCapture = true;
    }
  }
  return result;
}

/** Native hooks do not expose a parent call ID; accept only explicit host metadata. */
export function toolMetadata(
  entry: ToolInsight,
  metadata: Record<string, unknown> | undefined,
): void {
  if (!metadata) return;
  if (typeof metadata.parentID === "string") entry.parentID = metadata.parentID;
  if (typeof metadata.parentCallID === "string") entry.parentID = metadata.parentCallID;
  if (metadata.background === true) entry.background = true;
}

export { tool as ensureTool };
const toolNames = new WeakMap<SessionInsight, Map<string, string>>();

export async function captureEvent(collector: Collector, event: NativeEvent): Promise<void> {
  if (
    !("sessionID" in event.data) ||
    typeof event.data.sessionID !== "string" ||
    !("created" in event)
  )
    return;
  const session = await collector.session(event.data.sessionID);
  const now = event.created;
  if (event.type === "session.created") {
    session.parentID = event.data.parentID;
    session.interruptedCapture = false;
    collector.touch(session, now);
    return;
  }
  if (event.type === "session.step.started") {
    collector.start(
      session,
      event.data.assistantMessageID,
      `${event.data.model.providerID}/${event.data.model.id}`,
      event.data.started,
    );
    return;
  }
  if (event.type === "session.execution.interrupted" || event.type === "session.execution.failed") {
    for (const request of session.requests) {
      if (request.status !== "running") continue;
      request.status = event.type === "session.execution.interrupted" ? "interrupted" : "error";
      request.endedAt = now;
      request.capture = "partial";
      collector.release(session, request);
    }
    for (const entry of session.tools) {
      if (entry.status !== "running" || entry.background) continue;
      entry.status = "interrupted";
      entry.endedAt = now;
    }
    collector.touch(session, now);
    await collector.flush();
    return;
  }
  const data = event.data;
  const requestID =
    "assistantMessageID" in data && typeof data.assistantMessageID === "string"
      ? data.assistantMessageID
      : undefined;
  const request = session.requests.find((r) => r.id === requestID);
  if (event.type === "session.tool.input.started") {
    let names = toolNames.get(session);
    if (!names) {
      names = new Map();
      toolNames.set(session, names);
    }
    if (names.size < 2048) names.set(event.data.id, event.data.name);
  }
  if (event.type === "session.tool.called") {
    const names = toolNames.get(session);
    const entry = tool(
      session,
      event.data.id,
      names?.get(event.data.id) ?? "unknown",
      requestID,
      now,
    );
    names?.delete(event.data.id);
    toolMetadata(entry, event.metadata);
    collector.touch(session, now);
  }
  if (
    event.type === "session.tool.progress" ||
    event.type === "session.tool.success" ||
    event.type === "session.tool.failed"
  ) {
    const entry = session.tools.find((t) => t.id === event.data.id);
    if (entry) {
      toolMetadata(entry, event.data.metadata);
      toolMetadata(entry, event.metadata);
      if (event.type !== "session.tool.progress") {
        entry.endedAt = now;
        entry.status = event.type === "session.tool.success" ? "completed" : "error";
        if (event.data.content)
          entry.resultTokens = estimateTokens(JSON.stringify(event.data.content));
      }
      collector.touch(session, now);
    }
  }
  if (!request) {
    // Joining an already running session cannot recover live token arrival times.
    if (requestID) {
      session.interruptedCapture = true;
      collector.touch(session, now);
    }
    return;
  }
  if (
    request.status === "interrupted" &&
    event.type !== "session.step.ended" &&
    event.type !== "session.step.failed"
  )
    return;
  if (
    event.type === "session.text.delta" ||
    event.type === "session.reasoning.delta" ||
    event.type === "session.tool.input.delta"
  ) {
    const reasoning = event.type === "session.reasoning.delta";
    const summary = reasoning && /(?:^openai\/|\/gpt-|\/o[134](?:-|$))/i.test(request.model);
    if (reasoning) request.reasoningMode = summary ? "summary" : "visible";
    const key =
      event.type === "session.tool.input.delta"
        ? `args:${event.data.id}`
        : `${event.type}:${event.data.ordinal}`;
    collector.delta(
      session,
      request,
      key,
      reasoning ? (summary ? "summary" : "reasoning") : "output",
      event.data.delta,
      now,
    );
  }
  if (event.type === "session.step.streamed") {
    request.streamedAt = now;
    collector.touch(session, now);
    await collector.flush();
  }
  if (event.type === "session.step.ended" || event.type === "session.step.failed") {
    if (request.status !== "interrupted") {
      request.status = event.type === "session.step.ended" ? "completed" : "error";
      request.endedAt = now;
    }
    if (event.data.tokens) {
      const tokens = event.data.tokens;
      request.usage = {
        input: tokens.input,
        output: tokens.output,
        reasoning: tokens.reasoning,
        cacheRead: tokens.cache.read,
        cacheWrite: tokens.cache.write,
      };
      if (tokens.reasoning > 0 && request.reasoningMode === "unknown")
        request.reasoningMode = "hidden";
    }
    request.cost = event.data.cost;
    if (
      !request.context.length ||
      !request.usage ||
      request.streamedAt === undefined ||
      (request.usage.output > 0 && request.firstDeltaAt === undefined)
    )
      request.capture = "partial";
    collector.touch(session, now);
    collector.release(session, request);
    await collector.flush();
  }
}
