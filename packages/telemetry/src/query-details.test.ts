import { describe, expect, test } from "vitest";
import type { ContextSource, RequestInsight, SessionInsight } from "./schema";
import { buildSeries } from "./series";
import { speedWindow, summarizeSession } from "./summary";
import {
  buildSeriesWindow,
  buildSourcePage,
  seriesWindowSchema,
  sourcePageInputSchema,
  sourcePageSchema,
} from "./query-details";

function source(id: string, overrides: Partial<ContextSource> = {}): ContextSource {
  return { id, kind: "user", label: id, tokens: 10, quality: "estimated", ...overrides };
}
function request(overrides: Partial<RequestInsight> = {}): RequestInsight {
  return {
    id: "old",
    model: "model",
    startedAt: 0,
    streamedAt: 6000,
    endedAt: 7000,
    status: "completed",
    reasoningMode: "summary",
    capture: "live",
    usage: { input: 20, output: 30, reasoning: 10, cacheRead: 4, cacheWrite: 2 },
    cost: 0.1,
    context: [source("shared"), source("old-only"), source("shared", { kind: "tool" })],
    buckets: [
      { at: 0, output: 10, reasoning: 4, summary: 5 },
      { at: 2000, output: 20, reasoning: 0, summary: 0 },
    ],
    ...overrides,
  };
}
function fixture(): SessionInsight {
  return {
    version: 1,
    sessionID: "s",
    directory: "/project",
    updatedAt: 710000,
    revision: 2,
    interruptedCapture: false,
    tools: [],
    requests: [
      request(),
      request({
        id: "recent",
        startedAt: 700000,
        firstDeltaAt: 702000,
        streamedAt: undefined,
        endedAt: undefined,
        status: "running",
        reasoningMode: "hidden",
        capture: "partial",
        context: [
          source("shared", { tokens: 7, quality: "reported" }),
          ...Array.from({ length: 6 }, (_, i) =>
            source(`current-${i}`, { kind: i % 2 ? "tool" : "user", tokens: i + 1 }),
          ),
        ],
        buckets: [
          { at: 701000, output: 12, reasoning: 0, summary: 0 },
          { at: 705000, output: 8, reasoning: 0, summary: 0 },
        ],
      }),
    ],
  };
}

describe("bounded detail queries", () => {
  test("retains legacy 5-second series points for default and explicit windows without raw headers", () => {
    const session = fixture();
    const now = 710000;
    const legacy = buildSeries(session, { sessionID: "s", bucketMs: 1000, windowMs: 5000 }, now);
    const defaultWindow = speedWindow(legacy.points, session.requests, now);
    for (const range of [undefined, { sessionID: "s", from: 0, to: 6000 }]) {
      const page = buildSeriesWindow(session, range, now);
      const start = range?.from ?? defaultWindow.start;
      const end = range?.to ?? defaultWindow.end;
      const expected = legacy.points.filter((point) => point.at >= start && point.at <= end);
      expect(expected.length).toBeGreaterThan(0);
      expect(page).toMatchObject({ start, end, points: expected, running: true });
      expect(page.channels).toEqual({ reasoning: true, summary: true });
      expect(page.requests).toHaveLength(new Set(expected.map((point) => point.requestID)).size);
      for (const header of page.requests) {
        const original = session.requests.find((item) => item.id === header.id)!;
        const { context: _context, buckets, ...metadata } = original;
        expect(header).toEqual({ ...metadata, captured: buckets.length > 0 });
        expect(header).not.toHaveProperty("context");
        expect(header).not.toHaveProperty("buckets");
      }
      expect(seriesWindowSchema.parse(page)).toEqual(page);
    }
    const page = buildSeriesWindow(session, undefined, now);
    expect(page.points.every((point) => point.reasoningTps === 0 && point.summaryTps === 0)).toBe(
      true,
    );
    session.requests[1].status = "completed";
    session.requests[1].streamedAt = now;
    session.requests[1].endedAt = now + 1000;
    const closed = buildSeriesWindow(session, undefined, now + 900000);
    expect(closed).toMatchObject({
      ...speedWindow(
        buildSeries(session, { sessionID: "s" }, now).points,
        session.requests,
        now + 900000,
      ),
      running: false,
    });
  });

  test("traverses current and cumulative sources once with legacy order, tokens and quality", () => {
    const session = fixture();
    const before = structuredClone(session);
    const legacy = summarizeSession(session, 710000);
    for (const scope of ["current", "cumulative"] as const) {
      for (const kind of [undefined, "tool"] as const) {
        const expected = (
          scope === "current" ? legacy.currentContext : legacy.cumulativeContext
        ).filter((entry) => kind === undefined || entry.kind === kind);
        const entries: ContextSource[] = [];
        let cursor: string | undefined;
        do {
          const page = buildSourcePage(session, { sessionID: "s", scope, kind, cursor, limit: 2 });
          expect(page).toMatchObject({ total: expected.length, scope, reset: false });
          expect(page.entries.length).toBeGreaterThan(0);
          expect(page.entries.length).toBeLessThanOrEqual(2);
          expect(sourcePageSchema.parse(page)).toEqual(page);
          entries.push(...page.entries);
          expect(entries.length).toBeLessThanOrEqual(expected.length);
          cursor = page.nextCursor;
        } while (cursor);
        expect(entries).toEqual(expected);
      }
    }
    expect(legacy.currentContext[0]).toMatchObject({ tokens: 7, quality: "reported" });
    expect(legacy.cumulativeContext[0]).toMatchObject({ tokens: 17, quality: "estimated" });
    expect(session).toEqual(before);
  });

  test("rejects source cursors from another query and resets after the input context changes", () => {
    const session = fixture();
    const query = { sessionID: "s", scope: "current", limit: 2 } as const;
    const first = buildSourcePage(session, query);
    expect(first.nextCursor).toBeDefined();
    const cursor = first.nextCursor!;
    for (const altered of [{ scope: "cumulative" }, { kind: "tool" }, { limit: 3 }] as const) {
      expect(() => buildSourcePage(session, { ...query, ...altered, cursor })).toThrow();
    }
    for (const altered of [{ sessionID: "other" }, { directory: "/other" }]) {
      expect(() =>
        buildSourcePage(
          { ...session, ...altered },
          { ...query, sessionID: altered.sessionID ?? "s", cursor },
        ),
      ).toThrow();
    }
    session.revision++;
    session.requests[1].buckets.push({ at: 709000, output: 1, reasoning: 0, summary: 0 });
    expect(buildSourcePage(session, { ...query, cursor })).toMatchObject({
      reset: false,
      entries: session.requests[1].context.slice(2, 4),
    });
    session.requests.push(request({ id: "next", context: [source("new-context")] }));
    expect(buildSourcePage(session, { ...query, cursor })).toMatchObject({
      reset: true,
      entries: [],
    });
    expect(buildSourcePage(session, query).entries).toEqual([source("new-context")]);
  });

  test("bounds source entry count and encoded output without skipping entries", () => {
    const session = fixture();
    session.requests = [
      request({
        context: Array.from({ length: 23 }, (_, i) =>
          source(String(i), { label: "界".repeat(10000) }),
        ),
      }),
    ];
    const ids: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    const seenPages: string[][] = [];
    let previousCursor: string | undefined;
    do {
      const page = buildSourcePage(session, { sessionID: "s", limit: 100, cursor });
      expect(page.entries.length).toBeGreaterThan(0);
      expect(page.entries.length).toBeLessThanOrEqual(100);
      expect(new TextEncoder().encode(JSON.stringify(page)).byteLength).toBeLessThanOrEqual(200000);
      ids.push(...page.entries.map((entry) => entry.id));
      seenPages.push(page.entries.map((entry) => entry.id));
      expect(ids.length).toBeLessThanOrEqual(23);
      pages++;
      cursor = page.nextCursor;
      previousCursor = page.previousCursor;
    } while (cursor);
    expect(pages).toBeGreaterThan(1);
    expect(ids).toEqual(session.requests[0].context.map((entry) => entry.id));
    for (const expected of seenPages.slice(0, -1).reverse()) {
      const previous = buildSourcePage(session, {
        sessionID: "s",
        limit: 100,
        cursor: previousCursor,
      });
      expect(previous.entries.map((entry) => entry.id)).toEqual(expected);
      previousCursor = previous.previousCursor;
    }
    expect(previousCursor).toBeUndefined();
    expect(sourcePageInputSchema.safeParse({ sessionID: "s", limit: 101 }).success).toBe(false);
    session.requests[0].context = [source("oversized", { label: "界".repeat(70000) })];
    expect(() => buildSourcePage(session, { sessionID: "s" })).toThrow();
  });
});
