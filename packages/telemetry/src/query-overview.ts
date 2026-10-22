import type { ContextSource, SessionInsight } from "./schema";
import { summarizeSession, tokenBreakdown, phaseBreakdown } from "./summary";
import type { OverviewResponse, TokenComposition } from "./query-schema";
import { buildTraceOverview } from "./query-trace";

function composition(sources: ContextSource[]): TokenComposition {
  return {
    total: sources.reduce((sum, source) => sum + source.tokens, 0),
    reported: sources.every((source) => source.quality === "reported"),
    groups: tokenBreakdown(sources).map(({ kind, label, tokens, share }) => ({
      kind,
      label,
      tokens,
      share,
    })),
  };
}

export function buildOverview(session: SessionInsight, now = Date.now()): OverviewResponse {
  const { currentContext, cumulativeContext, ...summary } = summarizeSession(session, now);
  const trace = buildTraceOverview(session, now);
  return {
    sessionID: session.sessionID,
    directory: session.directory,
    revision: session.revision,
    unchanged: false,
    data: {
      updatedAt: session.updatedAt,
      measuredAt: now,
      hasActivity: session.requests.length > 0 || session.tools.length > 0,
      running: trace.running,
      summary: {
        ...summary,
        hasUsage: session.requests.some((request) => request.usage !== undefined),
        hasCost: session.requests.some((request) => request.cost !== undefined),
      },
      tokens: { current: composition(currentContext), cumulative: composition(cumulativeContext) },
      trace,
      phases: phaseBreakdown(session, now),
    },
  };
}
