export interface DonutEntry {
  label: string;
  color: string;
  tokens: number;
  share: number;
}

export function SessionInsightDonut({ entries, label }: { entries: DonutEntry[]; label: string }) {
  const total = entries.reduce((sum, entry) => sum + entry.tokens, 0);
  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative h-40 w-40 shrink-0">
        <svg
          viewBox="0 0 160 160"
          role="img"
          aria-label={`${label}: ${total.toLocaleString()} tokens`}
          className="h-full w-full -rotate-90"
        >
          <circle
            cx="80"
            cy="80"
            r="62"
            fill="none"
            stroke="var(--panel-strong)"
            strokeWidth="18"
          />
          {entries
            .filter((entry) => entry.share > 0)
            .map((entry) => {
              const start = offset;
              offset += entry.share * 100;
              return (
                <circle
                  key={entry.label}
                  cx="80"
                  cy="80"
                  r="62"
                  pathLength="100"
                  fill="none"
                  stroke={entry.color}
                  strokeWidth="18"
                  strokeDasharray={`${entry.share * 100} ${100 - entry.share * 100}`}
                  strokeDashoffset={-start}
                >
                  <title>
                    {entry.label}: {entry.tokens.toLocaleString()} tokens ·{" "}
                    {(entry.share * 100).toFixed(1)}%
                  </title>
                </circle>
              );
            })}
        </svg>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
        >
          <span className="text-xl font-semibold tabular-nums">{total.toLocaleString()}</span>
          <span className="text-xs text-[var(--muted-foreground)]">tokens</span>
        </div>
      </div>
      <dl className="w-full min-w-0 flex-1 space-y-2 text-xs">
        {entries.map((entry) => (
          <div key={entry.label} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: entry.color }}
            />
            <dt className="min-w-0 flex-1 truncate" title={entry.label}>
              {entry.label}
            </dt>
            <dd className="flex shrink-0 gap-3 tabular-nums">
              <span>{entry.tokens.toLocaleString()}</span>
              <span className="w-12 text-right text-[var(--muted-foreground)]">
                {(entry.share * 100).toFixed(1)}%
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
