import { useState } from "react";
import {
  tokenBreakdown,
  type ContextSource,
  type SessionInsight,
} from "@opencode-dashboard/shared";
import { SessionInsightDonut } from "./session-insight-donut";

type Usage = NonNullable<SessionInsight["requests"][number]["usage"]>;
const usageFields = [
  ["input", "Input", "var(--accent)"],
  ["output", "Output", "var(--metric-green)"],
  ["reasoning", "Reasoning", "var(--metric-violet)"],
  ["cacheRead", "Cache read", "var(--metric-amber)"],
  ["cacheWrite", "Cache write", "var(--muted-foreground)"],
] as const;

export function SessionInsightContext({
  current,
  cumulative,
  usage,
}: {
  current: ContextSource[];
  cumulative: ContextSource[];
  usage?: Usage;
}) {
  const [scope, setScope] = useState<"current" | "cumulative">("current");
  const entries = tokenBreakdown(scope === "current" ? current : cumulative);
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
              onClick={() => setScope(value)}
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
        <details className="text-xs">
          <summary className="cursor-pointer text-[var(--muted-foreground)]">
            Source details
          </summary>
          <div className="mt-3 space-y-3">
            {entries.map((entry) => (
              <div key={entry.kind}>
                <h4 className="mb-1 font-semibold">
                  {entry.label} · {entry.tokens.toLocaleString()} tokens
                </h4>
                <ul className="space-y-1 [overflow-wrap:anywhere]">
                  {entry.items.map((source, index) => (
                    <li key={`${source.id}:${index}`}>
                      <span>{source.label}</span> · {source.id}{" "}
                      <span className="text-[var(--muted-foreground)]">
                        · {source.tokens.toLocaleString()} tokens · {source.quality}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
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
