import { describe, expect, test } from "vitest";
import type {
  RequestInsight,
  SessionInsight,
  ToolInsight,
} from "@opencode-insight/telemetry/schema";
import { advanceTraceClock, createTraceModel, requestInterval, toolInterval } from "./trace-model";

const request = (overrides: Partial<RequestInsight> = {}): RequestInsight => ({
  id: "request",
  model: "model",
  startedAt: 10,
  status: "completed",
  reasoningMode: "unknown",
  buckets: [],
  context: [],
  capture: "live",
  ...overrides,
});
const tool = (overrides: Partial<ToolInsight> = {}): ToolInsight => ({
  id: "tool",
  name: "bash",
  requestID: "request",
  startedAt: 20,
  status: "completed",
  background: false,
  ...overrides,
});
const session = (requests: RequestInsight[] = [], tools: ToolInsight[] = []): SessionInsight => ({
  version: 1,
  sessionID: "session",
  directory: "/local",
  updatedAt: 999,
  revision: 1,
  interruptedCapture: false,
  requests,
  tools,
});

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

describe("trace model", () => {
  test("keeps an empty session unmeasured with no invented usage", () => {
    expect(createTraceModel(session(), 100)).toEqual({
      start: 0,
      end: 0,
      elapsedMs: undefined,
      requests: [],
      running: false,
      summary: {
        requestCount: 0,
        toolCount: 0,
        errorCount: 0,
        unknownCount: 0,
        partialUsage: false,
        partialCost: false,
      },
    });
  });

  test("retains closed unknown records without inventing durations or bars", () => {
    for (const status of ["completed", "error", "interrupted"] as const) {
      expect(requestInterval(request({ status }), 100)).toBeUndefined();
      expect(toolInterval(tool({ status }), 100)).toBeUndefined();
    }
    const model = createTraceModel(session([request()], [tool()]), 100);
    expect(model).toMatchObject({ start: 10, end: 20, running: false });
    expect(model.elapsedMs).toBeUndefined();
    expect(model.summary.unknownCount).toBe(2);
    expect(model.requests[0].groups[0]).toMatchObject({
      tools: [tool()],
      intervals: [],
      unknownCount: 1,
      accumulatedMs: 0,
      unionMs: 0,
    });
    expect(model.requests[0].groups[0].spanMs).toBeUndefined();
  });

  test("distinguishes measured zero and clamped negative intervals from unknown", () => {
    expect(requestInterval(request({ endedAt: 0 }), 100)).toEqual({ start: 10, end: 10 });
    expect(toolInterval(tool({ endedAt: 0 }), 100)).toEqual({ start: 20, end: 20 });
    const model = createTraceModel(session([], [tool({ startedAt: 0, endedAt: 0 })]), 100);
    expect(model.elapsedMs).toBe(0);
    expect(model.requests[0].groups[0]).toMatchObject({
      intervals: [],
      spanMs: 0,
      accumulatedMs: 0,
      unionMs: 0,
      unknownCount: 0,
    });
  });

  test("uses provisional now only for captured running records", () => {
    const input = session([request({ status: "running" })], [tool({ status: "running" })]);
    expect(requestInterval(input.requests[0], 100)).toEqual({ start: 10, end: 100 });
    expect(toolInterval(input.tools[0], 100)).toEqual({ start: 20, end: 100 });
    const model = createTraceModel(input, 100);
    expect(model).toMatchObject({ start: 10, end: 100, elapsedMs: 90, running: true });
    expect(model.summary.unknownCount).toBe(0);
    expect(model.requests[0].groups[0].unionMs).toBe(80);
    expect(toolInterval(tool({ status: "running", endedAt: 30 }), 100)?.end).toBe(30);
    expect(createTraceModel(session([], [tool({ status: "running" })]), 100).running).toBe(true);
  });

  test("plots streamed end while retaining settled end for session elapsed", () => {
    const item = request({ startedAt: 0, streamedAt: 30, endedAt: 70 });
    expect(requestInterval(item, 100)).toEqual({ start: 0, end: 30 });
    expect(createTraceModel(session([item]), 100)).toMatchObject({ end: 70, elapsedMs: 70 });
    expect(requestInterval({ ...item, status: "running" }, 100)?.end).toBe(30);
    expect(createTraceModel(session([{ ...item, endedAt: undefined }]), 100).end).toBe(30);
    expect(requestInterval({ ...item, streamedAt: undefined }, 100)?.end).toBe(70);
  });

  test("associates only exact request IDs and retains all orphan tools in one bucket", () => {
    const input = session(
      [request({ id: "agent" }), request({ id: "empty" })],
      [
        tool({ id: "matched", requestID: "agent", name: "task", endedAt: 40 }),
        tool({ id: "missing", requestID: undefined, name: "agent", parentID: "matched" }),
        tool({ id: "orphan", requestID: "absent", name: "agent" }),
        tool({ id: "case", requestID: "Agent", name: "task" }),
      ],
    );
    const model = createTraceModel(input, 100);
    expect(model.requests.map((item) => [item.id, item.label])).toEqual([
      ["agent", "Request 1"],
      ["empty", "Request 2"],
      ["unassociated", "Unassociated tools"],
    ]);
    expect(model.requests[0].groups[0].tools.map((item) => item.id)).toEqual(["matched"]);
    expect(model.requests[1].groups).toEqual([]);
    expect(model.requests[2].request).toBeUndefined();
    expect(model.requests[2].groups.map((group) => [group.name, group.tools.length])).toEqual([
      ["agent", 2],
      ["task", 1],
    ]);
    expect(model.summary).toMatchObject({ requestCount: 2, toolCount: 4 });
  });

  test("preserves execution gaps and separates overlap union, span and accumulated time", () => {
    const model = createTraceModel(
      session(
        [request()],
        [
          tool({ id: "later", startedAt: 30, endedAt: 40, background: true }),
          tool({ id: "overlap", startedAt: 5, endedAt: 15 }),
          tool({ id: "first", startedAt: 0, endedAt: 10 }),
          tool({ id: "unknown", startedAt: 100 }),
        ],
      ),
      200,
    );
    expect(model.requests[0].groups[0]).toMatchObject({
      intervals: [
        { start: 0, end: 15 },
        { start: 30, end: 40 },
      ],
      unionMs: 25,
      spanMs: 40,
      accumulatedMs: 30,
      unknownCount: 1,
      backgroundCount: 1,
    });
    expect(model.end).toBe(100);
    expect(model.start).toBe(0);
    expect(model.elapsedMs).toBe(100);
  });

  test("sums only reported normalized request usage and costs, distinguishing missing and zero", () => {
    const usage = { input: 1, output: 2, reasoning: 3, cacheRead: 4, cacheWrite: 5 };
    const zero = { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 };
    const input = session(
      [
        request({ id: "reported", usage, cost: 0.25 }),
        request({ id: "zero", usage: zero, cost: 0 }),
        request({ id: "missing" }),
      ],
      [tool({ resultTokens: 10000 })],
    );
    expect(createTraceModel(input).summary).toMatchObject({
      tokens: 15,
      cost: 0.25,
      partialUsage: true,
      partialCost: true,
      toolCount: 1,
    });
    expect(createTraceModel(session([request({ usage: zero, cost: 0 })])).summary).toMatchObject({
      tokens: 0,
      cost: 0,
      partialUsage: false,
      partialCost: false,
    });
    const missing = createTraceModel(session([request()]));
    expect(missing.summary.tokens).toBeUndefined();
    expect(missing.summary.cost).toBeUndefined();
    expect(createTraceModel(session([request({ usage })])).summary).toMatchObject({
      tokens: 15,
      partialUsage: false,
      partialCost: true,
    });
    expect(createTraceModel(session([request({ cost: 0 })])).summary).toMatchObject({
      cost: 0,
      partialUsage: true,
      partialCost: false,
    });
  });

  test("counts only native error statuses, not interrupted records or CodeMode metadata", () => {
    const model = createTraceModel(
      session(
        [request({ status: "error" }), request({ id: "interrupted", status: "interrupted" })],
        [
          tool({ id: "native-error", status: "error" }),
          tool({ id: "interrupted", status: "interrupted" }),
          tool({
            name: "codemode",
            reportedCalls: [{ name: "bash", status: "error" }],
            resultTokens: 500,
          }),
        ],
      ),
    );
    expect(model.summary).toMatchObject({ errorCount: 2, toolCount: 3 });
    expect(model.requests[0].groups.map((group) => group.errorCount)).toEqual([1, 0]);
    expect(model.summary.tokens).toBeUndefined();
  });

  test("keeps stable chronological ordering, raw group names and independent immutable snapshots", () => {
    const input = session(
      [
        request({ id: "late", startedAt: 50 }),
        request({ id: "early", startedAt: 0 }),
        request({ id: "tie", startedAt: 0 }),
      ],
      [
        tool({ id: "late-tool", startedAt: 5, requestID: "early", name: "Bash" }),
        tool({
          id: "first",
          startedAt: 1,
          requestID: "early",
          name: "bash",
          reportedCalls: [{ name: "read", status: "completed" }],
        }),
        tool({ id: "tie-tool", startedAt: 1, requestID: "early", name: "bash" }),
      ],
    );
    const before = structuredClone(input);
    const model = createTraceModel(freeze(input), 100);
    expect(input).toEqual(before);
    expect(model.requests.map((item) => item.id)).toEqual(["early", "tie", "late"]);
    expect(model.requests[0].groups.map((group) => group.name)).toEqual(["bash", "Bash"]);
    expect(model.requests[0].groups[0].tools.map((item) => item.id)).toEqual(["first", "tie-tool"]);
    model.requests[0].request!.context.push({
      kind: "user",
      id: "x",
      label: "x",
      tokens: 1,
      quality: "estimated",
    });
    model.requests[0].groups[0].tools[0].reportedCalls![0].name = "changed";
    expect(input).toEqual(before);
    expect(createTraceModel(input, 100)).not.toEqual(model);
  });

  test("retains grouping and counting invariants for 2000 native tool calls", () => {
    const tools = Array.from({ length: 2000 }, (_, index) =>
      tool({
        id: `tool-${index}`,
        name: `tool-name-${index % 5}`,
        startedAt: index,
        endedAt: index % 4 === 0 ? undefined : index + 10,
        requestID: index % 3 === 0 ? "request" : index % 3 === 1 ? "missing" : undefined,
        status: index % 10 === 0 ? "error" : "completed",
        background: index % 2 === 0,
        reportedCalls: [{ name: "not-native", status: "error" }],
      }),
    );
    const model = createTraceModel(session([request({ endedAt: 20 })], tools), 9999);
    const groups = model.requests.flatMap((item) => item.groups);
    const retained = groups.flatMap((group) => group.tools);
    expect(model.requests).toHaveLength(2);
    expect(groups).toHaveLength(10);
    expect(new Set(retained.map((item) => item.id)).size).toBe(2000);
    expect(model.summary).toMatchObject({
      toolCount: 2000,
      requestCount: 1,
      errorCount: 200,
      unknownCount: 500,
    });
    expect(groups.reduce((sum, group) => sum + group.backgroundCount, 0)).toBe(1000);
    expect(groups.reduce((sum, group) => sum + group.unknownCount, 0)).toBe(500);
    expect(groups.reduce((sum, group) => sum + group.accumulatedMs, 0)).toBe(15000);
    for (const group of groups) {
      expect(group.unionMs).toBeLessThanOrEqual(group.accumulatedMs);
      expect(group.unionMs).toBeLessThanOrEqual(group.spanMs!);
      expect(group.tools.map((item) => item.startedAt)).toEqual(
        group.tools.map((item) => item.startedAt).sort((a, b) => a - b),
      );
      expect(
        group.intervals.every(
          (item, index) =>
            item.end > item.start && (!index || item.start > group.intervals[index - 1].end),
        ),
      ).toBe(true);
    }
  });

  test("clock refresh returns closed models by identity, including unknown intervals", () => {
    for (const input of [
      session(),
      session([request()], [tool()]),
      session([request({ endedAt: 50 })], [tool({ endedAt: 40 })]),
    ]) {
      const model = freeze(createTraceModel(input, 100));
      expect(advanceTraceClock(model, 200)).toBe(model);
    }
  });

  test("clock refresh advances running groups but reuses closed requests and groups", () => {
    const input = freeze(
      session(
        [request({ status: "running" }), request({ id: "closed", endedAt: 80 })],
        [
          tool({ id: "live", status: "running" }),
          tool({ id: "closed-group", name: "read", endedAt: 40 }),
          tool({ id: "closed-request", requestID: "closed", endedAt: 60 }),
        ],
      ),
    );
    const before = structuredClone(input);
    const model = freeze(createTraceModel(input, 100));
    const snapshot = structuredClone(model);
    const advanced = advanceTraceClock(model, 200);
    expect(advanced).toMatchObject({ start: 10, end: 200, elapsedMs: 190, running: true });
    expect(advanced.summary).toBe(model.summary);
    expect(advanced.requests[1]).toBe(model.requests[1]);
    expect(advanced.requests[0].request).toBe(model.requests[0].request);
    expect(advanced.requests[0].groups[1]).toBe(model.requests[0].groups[1]);
    expect(advanced.requests[0].groups[0]).not.toBe(model.requests[0].groups[0]);
    expect(advanced.requests[0].groups[0]).toMatchObject({
      intervals: [{ start: 20, end: 200 }],
      unionMs: 180,
      accumulatedMs: 180,
    });
    expect(advanceTraceClock(model, 300).requests[0].groups[0].unionMs).toBe(280);
    expect(input).toEqual(before);
    expect(model).toEqual(snapshot);
    expect(input.tools[0].endedAt).toBeUndefined();
  });

  test("a running request advances the session clock without rebuilding closed tool groups", () => {
    const model = freeze(
      createTraceModel(session([request({ status: "running" })], [tool({ endedAt: 40 })]), 100),
    );
    const advanced = advanceTraceClock(model, 250);
    expect(advanced.elapsedMs).toBe(240);
    expect(advanced.requests[0]).toBe(model.requests[0]);
    expect(requestInterval(advanced.requests[0].request!, 250)).toEqual({ start: 10, end: 250 });
  });
});
