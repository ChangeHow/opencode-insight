import { z } from "zod";
import {
  requestSchema,
  seriesPointSchema,
  sourceKinds,
  sourceSchema,
  type SessionInsight,
} from "./schema";
import { speedWindowInputSchema } from "./query-schema";
import { buildSeries } from "./series";
import { summarizeSession } from "./summary";
import { speedWindow } from "./visuals";

const identity = {
  sessionID: z.string().min(1).max(128),
  directory: z.string(),
  revision: z.number().int().nonnegative(),
};
export const seriesRequestHeaderSchema = requestSchema
  .omit({ context: true, buckets: true })
  .extend({ captured: z.boolean() });
export type SeriesRequestHeader = z.infer<typeof seriesRequestHeaderSchema>;
export const seriesWindowInputSchema = speedWindowInputSchema;
export type SeriesWindowInput = z.input<typeof seriesWindowInputSchema>;
export const seriesWindowSchema = z.object({
  ...identity,
  start: z.number(),
  end: z.number(),
  running: z.boolean(),
  points: z.array(seriesPointSchema),
  requests: z.array(seriesRequestHeaderSchema),
  channels: z.object({ reasoning: z.boolean(), summary: z.boolean() }),
});
export type SeriesWindow = z.infer<typeof seriesWindowSchema>;

/** Preserve the dashboard's 5-second estimator, but not its full transcript transfer. */
export function buildSeriesWindow(
  session: SessionInsight,
  input: SeriesWindowInput = { sessionID: session.sessionID },
  now = Date.now(),
): SeriesWindow {
  const range = seriesWindowInputSchema.parse(input);
  const series = buildSeries(
    session,
    { sessionID: session.sessionID, bucketMs: 1000, windowMs: 5000 },
    now,
  );
  const window = speedWindow(series.points, session.requests, now);
  const start = range.from ?? window.start;
  const end = range.to ?? window.end;
  const points = series.points.filter((point) => point.at >= start && point.at <= end);
  const ids = new Set(points.map((point) => point.requestID));
  return {
    sessionID: session.sessionID,
    directory: session.directory,
    revision: session.revision,
    start,
    end,
    running: session.requests.some((request) => request.status === "running"),
    points,
    requests: session.requests
      .filter((request) => ids.has(request.id))
      .map((request) => {
        const { context: _context, buckets, ...header } = request;
        return { ...header, captured: buckets.length > 0 };
      }),
    channels: {
      reasoning: session.requests.some((request) =>
        request.buckets.some((bucket) => bucket.reasoning > 0),
      ),
      summary: session.requests.some((request) =>
        request.buckets.some((bucket) => bucket.summary > 0),
      ),
    },
  };
}

export const sourcePageInputSchema = z.object({
  sessionID: identity.sessionID,
  scope: z.enum(["current", "cumulative"]).default("current"),
  kind: z.enum(sourceKinds).optional(),
  cursor: z.string().max(4096).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export type SourcePageInput = z.input<typeof sourcePageInputSchema>;
export const sourcePageSchema = z.object({
  ...identity,
  scope: z.enum(["current", "cumulative"]),
  total: z.number().int().nonnegative(),
  entries: z.array(sourceSchema),
  previousCursor: z.string().max(4096).optional(),
  nextCursor: z.string().max(4096).optional(),
  reset: z.boolean(),
});
export type SourcePage = z.infer<typeof sourcePageSchema>;
const sourceCursorSchema = z.object({
  sessionID: identity.sessionID,
  directory: z.string(),
  scope: z.enum(["current", "cumulative"]),
  kind: z.enum(sourceKinds).nullable(),
  contextID: z.string(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().min(1).max(100),
  direction: z.enum(["forward", "backward"]),
});

/** Context snapshots are immutable within their captured input identity, not token revisions. */
export function buildSourcePage(session: SessionInsight, input: SourcePageInput): SourcePage {
  const options = sourcePageInputSchema.parse(input);
  const last = session.requests.at(-1);
  const contextID = JSON.stringify([
    session.requests[0]?.id,
    last?.id,
    session.requests.length,
    last?.context.length,
  ]);
  const sources =
    options.scope === "current"
      ? (last?.context ?? [])
      : summarizeSession(session).cumulativeContext;
  const entries = options.kind ? sources.filter((source) => source.kind === options.kind) : sources;
  const scope = {
    sessionID: session.sessionID,
    directory: session.directory,
    scope: options.scope,
    kind: options.kind ?? null,
  };
  const base = {
    sessionID: session.sessionID,
    directory: session.directory,
    revision: session.revision,
    scope: options.scope,
    total: entries.length,
  };
  let offset = 0;
  let backward = false;
  if (options.cursor) {
    let cursor: z.infer<typeof sourceCursorSchema>;
    try {
      cursor = sourceCursorSchema.parse(JSON.parse(decodeURIComponent(options.cursor)));
    } catch {
      throw new Error("Invalid source cursor");
    }
    if (
      Object.entries(scope).some(([key, value]) => cursor[key as keyof typeof scope] !== value) ||
      cursor.limit !== options.limit
    )
      throw new Error("Source cursor belongs to another query");
    if (cursor.contextID !== contextID) return { ...base, entries: [], reset: true };
    offset = cursor.offset;
    backward = cursor.direction === "backward";
    if (backward ? offset > entries.length : offset >= entries.length)
      return { ...base, entries: [], reset: true };
  }
  let start = offset;
  let end = offset;
  let bytes = 0;
  while (end - start < options.limit && (backward ? start > 0 : end < entries.length)) {
    const entry = entries[backward ? start - 1 : end];
    const size = new TextEncoder().encode(JSON.stringify(entry)).byteLength;
    if (bytes + size > 196608) {
      if (start === end) throw new Error("A source entry exceeds the page budget");
      break;
    }
    if (backward) start--;
    else end++;
    bytes += size;
  }
  const cursorAt = (next: number, direction: "forward" | "backward") =>
    encodeURIComponent(
      JSON.stringify({ ...scope, contextID, offset: next, direction, limit: options.limit }),
    );
  return {
    ...base,
    entries: entries.slice(start, end).map((entry) => ({ ...entry })),
    reset: false,
    previousCursor: start > 0 ? cursorAt(start, "backward") : undefined,
    nextCursor: end < entries.length ? cursorAt(end, "forward") : undefined,
  };
}
