import { useCallback, useState } from "react";
import { type TokenComposition, type SessionInsight } from "@opencode-dashboard/shared";
import { fetchSessionInsightSources } from "@/lib/api";
import { useInsightPage } from "@/lib/use-insight-page";
import { Button } from "@/components/ui/button";
import { SessionInsightDonut } from "./session-insight-donut";

type Usage = NonNullable<SessionInsight["requests"][number]["usage"]>;
const usageFields = [
  ["input", "Input", "var(--accent)"],
  ["output", "Output", "var(--metric-green)"],
  ["reasoning", "Reasoning", "var(--metric-violet)"],
  ["cacheRead", "Cache read", "var(--metric-amber)"],
  ["cacheWrite", "Cache write", "var(--muted-foreground)"],
] as const;

const sourceColors = {
  system: "#8b5cf6",
  definitions: "#f59e0b",
  user: "#22c55e",
  skill: "#f97316",
  assistant: "#3b82f6",
  tool: "#14b8a6",
  injected: "#d946ef",
};

export function SessionInsightContext({
  sessionId,
  revision,
  current,
  cumulative,
  usage,
}: {
  sessionId: string;
  revision: number;
  current: TokenComposition;
  cumulative: TokenComposition;
  usage?: Usage;
}) {
  const [scope, setScope] = useState<"current" | "cumulative">("current");
  const [expanded, setExpanded] = useState(false);
  const [kind, setKind] = useState<string>("");
  const composition = scope === "current" ? current : cumulative;
  const entries = composition.groups.map((group) => ({
    ...group,
    color: sourceColors[group.kind],
  }));
  const load = useCallback(
    (cursor?: string) =>
      fetchSessionInsightSources(sessionId, scope, { kind: kind || undefined, cursor }),
    [sessionId, scope, kind],
  );
  const details = useInsightPage(`${sessionId}:${scope}:${kind}`, expanded, load, revision);
  const reportedTotal = usage ? usageFields.reduce((sum, [key]) => sum + usage[key], 0) : 0;
  return (
    <section aria-label="Context sources" className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Estimated context</h3>
        <div
          role="group"
          aria-label="Context scope"
          className="flex gap-1 rounded-lg bg-[var(--panel-strong)] p-1"
        >
          {(["current", "cumulative"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={scope === value}
              onClick={() => {
                setScope(value);
                setKind("");
              }}
              title={
                value === "current"
                  ? "Latest request snapshot"
                  : "Sum across requests, including repeated context; not unique tokens"
              }
              className={`rounded-md px-3 py-1 text-xs ${scope === value ? "bg-[var(--panel)] font-semibold" : "text-[var(--muted-foreground)]"}`}
            >
              {value === "current" ? "Current" : "Cumulative"}
            </button>
          ))}
        </div>
      </div>
      {entries.length ? (
        <SessionInsightDonut entries={entries} label={`${scope} estimated context`} />
      ) : (
        <p className="text-sm text-[var(--muted-foreground)]">No captured context sources.</p>
      )}
      {entries.length > 0 && (
        <details className="text-xs" onToggle={(event) => setExpanded(event.currentTarget.open)}>
          <summary className="cursor-pointer text-[var(--muted-foreground)]">
            Source details
          </summary>
          <div className="mt-3 space-y-3">
            <label className="flex items-center gap-2">
              Source kind
              <select
                aria-label="Source kind"
                value={kind}
                onChange={(event) => setKind(event.target.value)}
                className="rounded bg-[var(--panel-strong)] p-1"
              >
                <option value="">All sources</option>
                {entries.map((entry) => (
                  <option key={entry.kind} value={entry.kind}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
            {details.loading && <p role="status">Loading source details…</p>}
            {details.error && (
              <p role="alert">
                {details.error}{" "}
                <Button size="sm" variant="outline" onClick={details.retry}>
                  Retry details
                </Button>
              </p>
            )}
            {details.page && (
              <>
                <p className="text-[var(--muted-foreground)]">
                  {details.page.total.toLocaleString()} sources · current page
                </p>
                {[...new Set(details.page.entries.map((source) => source.kind))].map(
                  (sourceKind) => {
                    const group = entries.find((entry) => entry.kind === sourceKind);
                    return (
                      <div key={sourceKind}>
                        <h4 className="mb-1 font-semibold">
                          {group
                            ? `${group.label} · ${group.tokens.toLocaleString()} tokens`
                            : sourceKind}
                        </h4>
                        <ul className="space-y-1 [overflow-wrap:anywhere]">
                          {details
                            .page!.entries.filter((source) => source.kind === sourceKind)
                            .map((source, index) => (
                              <li key={`${source.id}:${index}`}>
                                <span>{source.label}</span> · {source.id}{" "}
                                <span className="text-[var(--muted-foreground)]">
                                  · {source.tokens.toLocaleString()} tokens · {source.quality}
                                </span>
                              </li>
                            ))}
                        </ul>
                      </div>
                    );
                  },
                )}
                {!details.page.entries.length && <p>No captured context sources on this page.</p>}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={details.loading || !details.page.previousCursor}
                    onClick={details.previous}
                  >
                    Previous sources
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={details.loading || !details.page.nextCursor}
                    onClick={details.next}
                  >
                    Next sources
                  </Button>
                </div>
              </>
            )}
          </div>
        </details>
      )}
      <div className="space-y-3 border-t border-[var(--border)] pt-4">
        <h3 className="text-sm font-semibold">Reported usage</h3>
        {usage ? (
          <SessionInsightDonut
            label="Reported usage"
            entries={usageFields.map(([key, label, color]) => ({
              label,
              color,
              tokens: usage[key],
              share: reportedTotal ? usage[key] / reportedTotal : 0,
            }))}
          />
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">Unavailable</p>
        )}
      </div>
    </section>
  );
}
