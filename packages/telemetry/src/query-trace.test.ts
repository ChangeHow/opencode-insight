import { describe, expect, test } from "vitest";
import type { SessionInsight, ToolInsight } from "./schema";
import {
  advanceTraceClock,
  createTraceModel,
} from "../../openchamber-extension/src/panel/trace-model";
import {
  advanceTraceOverview,
  buildToolPage,
  buildTraceOverview,
  toolPageInputSchema,
  toolPageSchema,
} from "./queries";

function fixture(): SessionInsight {
  const tools: ToolInsight[] = [
    { id: "a", name: "shell", startedAt: 30, endedAt: 50, status: "completed", background: false },
    { id: "b", name: "shell", startedAt: 10, status: "running", background: true },
    {
      id: "c",
      name: "zero",
      startedAt: 10,
      endedAt: 10,
      status: "completed",
      background: false,
      reportedCalls: [{ name: "read", status: "completed" }],
      reportedCallsTruncated: true,
    },
    { id: "d", name: "unknown", startedAt: 5, status: "error", background: false },
    { id: "e", name: "future", startedAt: 300, status: "running", background: false },
  ];
  return {
    version: 1,
    sessionID: "s",
    directory: "/project",
    updatedAt: 0,
    revision: 1,
    interruptedCapture: false,
    tools,
    requests: [
      {
        id: "r",
        model: "m",
        startedAt: 0,
        status: "running",
        capture: "partial",
        reasoningMode: "unknown",
        context: [],
        buckets: [],
        usage: { input: 10, output: 5, reasoning: 2, cacheRead: 1, cacheWrite: 1 },
        cost: 0,
      },
    ],
  };
}
function comparable(model: ReturnType<typeof buildTraceOverview>) {
  const { measuredAt: _, groups, ...rest } = model;
  return {
    ...rest,
    groups: groups.map(
      ({
        count: _,
        range: __,
        runningStarts: ___,
        singleTool: ____,
        zeroStarts: _zero,
        errorIntervals: _errors,
        unknownStarts: _unknown,
        ...group
      }) => group,
    ),
  };
}
function legacy(model: ReturnType<typeof createTraceModel>) {
  return { ...model, groups: model.groups.map(({ tools: _, ...group }) => group) };
}

describe("bounded trace queries", () => {
  test("preserves legacy timing, summary, ordering and advances only running groups", () => {
    const session = fixture();
    const old = createTraceModel(session, 100);
    const model = buildTraceOverview(session, 100);
    expect(comparable(model)).toEqual(legacy(old));
    for (const group of model.groups) {
      const original = old.groups.find((item) => item.name === group.name)!;
      const endpoint = (tool: ToolInsight) =>
        tool.endedAt ?? (tool.status === "running" ? 100 : undefined);
      expect(group.zeroStarts).toEqual(
        original.tools
          .filter(
            (tool) =>
              (tool.status !== "running" || tool.endedAt !== undefined) &&
              endpoint(tool) !== undefined &&
              Math.max(tool.startedAt, endpoint(tool)!) === tool.startedAt,
          )
          .map((tool) => tool.startedAt),
      );
      expect(group.errorIntervals).toEqual(
        original.tools
          .filter((tool) => tool.status === "error" && endpoint(tool) !== undefined)
          .map((tool) => ({
            start: tool.startedAt,
            end: Math.max(tool.startedAt, endpoint(tool)!),
          })),
      );
      expect(group.unknownStarts).toEqual(
        original.tools.filter((tool) => endpoint(tool) === undefined).map((tool) => tool.startedAt),
      );
    }
    expect(model.groups.find((group) => group.name === "zero")?.singleTool).not.toHaveProperty(
      "reportedCalls",
    );
    expect(model.groups.find((group) => group.name === "shell")?.singleTool).toBeUndefined();
    for (const now of [200, 400, 500]) {
      const advanced = advanceTraceOverview(model, now);
      expect(comparable(advanced)).toEqual(legacy(advanceTraceClock(old, now)));
      expect(advanced.groups.find((group) => group.name === "zero")).toBe(
        model.groups.find((group) => group.name === "zero"),
      );
      expect(comparable(advanceTraceOverview(advanced, now + 10))).toEqual(
        legacy(advanceTraceClock(old, now + 10)),
      );
    }
    session.requests = [];
    session.tools = session.tools.filter((tool) => tool.status !== "running");
    const closed = buildTraceOverview(session, 100);
    expect(advanceTraceOverview(closed, 500)).toBe(closed);
  });

  test("traverses a fixed capture prefix once while tools append with unordered timestamps", () => {
    const session = fixture();
    session.tools = Array.from({ length: 11 }, (_, i) => ({
      ...session.tools[0],
      id: String(i),
      startedAt: 10,
    }));
    const ids: string[] = [];
    let page = buildToolPage(session, { sessionID: "s", limit: 3 });
    const pages: string[][] = [];
    while (true) {
      const currentIDs = page.entries.map((tool) => tool.id);
      pages.push(currentIDs);
      ids.push(...currentIDs);
      for (const startedAt of [10, -1]) {
        session.tools.push({
          ...session.tools[0],
          id: `new-${ids.length}-${startedAt}`,
          startedAt,
        });
        session.revision++;
        expect(page.cursor).toBeDefined();
        const refreshed = buildToolPage(session, { sessionID: "s", limit: 3, cursor: page.cursor });
        expect(refreshed.entries.map((tool) => tool.id)).toEqual(currentIDs);
        expect(refreshed).toMatchObject({ total: 11, reset: false, revision: session.revision });
        expect(toolPageSchema.parse(refreshed)).toEqual(refreshed);
      }
      if (!page.nextCursor) break;
      page = buildToolPage(session, { sessionID: "s", limit: 3, cursor: page.nextCursor });
      expect(page.total).toBe(11);
      expect(toolPageSchema.parse(page)).toEqual(page);
    }
    expect(ids).toEqual(["8", "9", "10", "5", "6", "7", "2", "3", "4", "0", "1"]);
    expect(new Set(ids).size).toBe(11);
    for (const expected of pages.slice(0, -1).reverse()) {
      expect(page.previousCursor).toBeDefined();
      page = buildToolPage(session, { sessionID: "s", limit: 3, cursor: page.previousCursor });
      expect(page.entries.map((tool) => tool.id)).toEqual(expected);
      expect(page).toMatchObject({ total: 11, reset: false });
    }
    expect(page.previousCursor).toBeUndefined();
  });

  test("binds cursor scope, resets on retention and returns full inspector metadata", () => {
    const session = fixture();
    const page = buildToolPage(session, { sessionID: "s", limit: 1, group: "shell" });
    for (const altered of [{ sessionID: "other" }, { directory: "/elsewhere" }]) {
      const scoped = { ...session, ...altered };
      expect(() =>
        buildToolPage(scoped, {
          sessionID: scoped.sessionID,
          limit: 1,
          group: "shell",
          cursor: page.nextCursor,
        }),
      ).toThrow();
    }
    expect(() =>
      buildToolPage(session, { sessionID: "s", limit: 1, group: "zero", cursor: page.nextCursor }),
    ).toThrow();
    expect(() =>
      buildToolPage(session, { sessionID: "s", limit: 2, group: "shell", cursor: page.nextCursor }),
    ).toThrow();
    expect(() => buildToolPage(session, { sessionID: "s", limit: 1, cursor: "%bad" })).toThrow();
    expect(buildToolPage(session, { sessionID: "s", toolID: "c", limit: 20 }).entries[0]).toEqual(
      session.tools[2],
    );
    expect(
      toolPageInputSchema.safeParse({ sessionID: "s", toolID: "c", group: "zero" }).success,
    ).toBe(false);
    for (const id of ["a", "e", "b"]) {
      const retained = { ...session, tools: session.tools.filter((tool) => tool.id !== id) };
      expect(
        buildToolPage(retained, {
          sessionID: "s",
          limit: 1,
          group: "shell",
          cursor: page.nextCursor,
        }),
      ).toMatchObject({ reset: true, entries: [] });
    }
  });

  test("enforces encoded page budget without losing entries and rejects oversized tools", () => {
    const session = fixture();
    session.tools = Array.from({ length: 4 }, (_, i) => ({
      ...session.tools[0],
      id: String(i),
      reportedCalls: Array(1500).fill({ name: "x".repeat(30), status: "completed" }),
    }));
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = buildToolPage(session, { sessionID: "s", limit: 4, cursor });
      expect(new TextEncoder().encode(JSON.stringify(page)).byteLength).toBeLessThanOrEqual(256000);
      ids.push(...page.entries.map((tool) => tool.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect([...ids].sort()).toEqual(["0", "1", "2", "3"]);
    session.tools[0].reportedCalls = Array(10000).fill({ name: "large", status: "completed" });
    expect(() => buildToolPage(session, { sessionID: "s", toolID: "0", limit: 1 })).toThrow();
  });
});
