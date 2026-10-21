import { useState } from "react";
import {
  phaseBreakdown,
  summarizeReportedCalls,
  type SessionInsight,
} from "@opencode-dashboard/shared";
import { useInsightClock } from "./session-insight-clock";

const duration = (ms: number) =>
  ms > 0 && ms < 1000 ? `${ms.toLocaleString()} ms` : `${(ms / 1000).toFixed(2)} s`;

export function SessionInsightTiming({ session }: { session: SessionInsight }) {
  const now = useInsightClock(
    session.requests.some((request) => request.status === "running") ||
      session.tools.some((tool) => tool.status === "running"),
  );
  const { phases, totalMs, backgroundMs, unknownCount } = phaseBreakdown(session, now);
  const [selected, setSelected] = useState<string>();
  const inspected = phases.find((phase) => phase.id === selected);
  const reported = session.tools.filter((tool) => tool.reportedCalls?.length);
  return (
    <section
      aria-label="Time accounting"
      className="min-w-0 space-y-4"
      onKeyDown={(event) => {
        if (event.key === "Escape") setSelected(undefined);
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Foreground time</h3>
        <span className="text-lg font-semibold tabular-nums">{duration(totalMs)}</span>
      </div>
      {totalMs > 0 ? (
        <div
          className="flex h-12 overflow-hidden rounded-lg bg-[var(--panel-strong)]"
          role="group"
          aria-label="Exclusive foreground phases"
        >
          {phases
            .filter((phase) => phase.ms > 0)
            .map((phase) => (
              <button
                key={phase.id}
                type="button"
                aria-label={`${phase.label}: ${duration(phase.ms)}, ${(phase.share * 100).toFixed(1)}%`}
                aria-pressed={selected === phase.id}
                onPointerEnter={() => setSelected(phase.id)}
                onFocus={() => setSelected(phase.id)}
                onClick={() => setSelected(phase.id)}
                className="min-w-0 shrink-0 outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--foreground)]"
                style={{ width: `${phase.share * 100}%`, background: phase.color }}
              />
            ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--muted-foreground)]">No captured timing.</p>
      )}
      <div className="grid grid-cols-2 gap-x-5 gap-y-3 text-xs sm:grid-cols-3">
        {phases
          .filter((phase) => phase.ms > 0)
          .map((phase) => (
            <div key={phase.id}>
              <button
                type="button"
                aria-label={`${phase.label} phase details`}
                aria-pressed={selected === phase.id}
                onPointerEnter={() => setSelected(phase.id)}
                onFocus={() => setSelected(phase.id)}
                onClick={() => setSelected(phase.id)}
                className="w-full rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                <span className="flex items-center gap-2 text-[var(--muted-foreground)]">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-full"
                    style={{ background: phase.color }}
                  />
                  {phase.label}
                </span>
                <span className="mt-1 block tabular-nums">
                  {duration(phase.ms)}{" "}
                  <span className="text-[var(--muted-foreground)]">
                    · {(phase.share * 100).toFixed(1)}%
                  </span>
                </span>
              </button>
            </div>
          ))}
      </div>
      {inspected && (
        <div role="status" className="rounded-lg bg-[var(--panel-strong)] p-3 text-xs">
          <span className="font-semibold">
            {inspected.label} · {duration(inspected.ms)} · {(inspected.share * 100).toFixed(1)}% ·{" "}
            {inspected.count} activities
          </span>
          <span className="mt-1 block text-[var(--muted-foreground)]">{inspected.description}</span>
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted-foreground)]">
        <span title="Separate from foreground; may overlap it.">
          Background · {duration(backgroundMs)}
        </span>
        {unknownCount > 0 && <span>Timing unavailable · {unknownCount} closed intervals</span>}
      </div>
      {reported.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-[var(--muted-foreground)]">
            Reported Code Mode calls · per-call timing unavailable
          </summary>
          <ul className="mt-3 space-y-3">
            {reported.map((tool) => (
              <li key={tool.id}>
                <span className="font-semibold">{tool.name}</span>
                <ul className="mt-1 space-y-1 [overflow-wrap:anywhere]">
                  {summarizeReportedCalls(tool.reportedCalls).map((call) => (
                    <li key={`${call.name}:${call.status}`}>
                      {call.name} ×{call.count} · {call.status}
                    </li>
                  ))}
                </ul>
                {tool.reportedCallsTruncated && (
                  <span className="text-[var(--muted-foreground)]">
                    Reported call details truncated.
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
