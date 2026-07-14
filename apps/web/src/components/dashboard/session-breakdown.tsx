import { Clock3, Coins, Folder, MessageSquare, Shapes } from "lucide-react";
import type { SessionDetailBreakdown } from "@opencode-dashboard/shared";
import { AgentRuntimeBadge } from "@/components/dashboard/agent-runtime-badge";
import { ProviderIcon } from "@/components/dashboard/provider-icon";
import { TOKEN_COLORS } from "@/lib/chart-colors";
import { cn } from "@/lib/utils";
import { formatCompactDuration, formatCompactNumber, formatCurrency } from "@/lib/format";
import { getModelDisplayName } from "@/lib/model-display";

const TOKEN_PARTS = [
  { key: "input" as const, label: "Input", color: TOKEN_COLORS.input },
  { key: "output" as const, label: "Output", color: TOKEN_COLORS.output },
  { key: "reasoning" as const, label: "Reasoning", color: TOKEN_COLORS.reasoning },
  { key: "cacheRead" as const, label: "Cache read", color: TOKEN_COLORS.cacheRead },
  { key: "cacheWrite" as const, label: "Cache write", color: TOKEN_COLORS.cacheWrite },
];

export function SessionBreakdownPanel({ session }: { session: SessionDetailBreakdown }) {
  const classifiedTokens = TOKEN_PARTS.reduce(
    (total, part) => total + session.breakdown[part.key],
    0,
  );
  const topModels = session.models
    .toSorted((left, right) => right.tokens - left.tokens || right.cost - left.cost)
    .slice(0, 4);

  return (
    <section className="px-4 sm:px-8 lg:px-10" aria-labelledby="session-overview-title">
      <div data-testid="session-overview" className="mx-auto max-w-[64rem] py-5 sm:py-6">
        <div className="flex flex-col gap-4 border-b border-[var(--border)] pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="metric-label">Entire session</p>
            <div data-testid="session-title-row" className="mt-2 flex min-w-0 items-center gap-2.5">
              <h2
                id="session-overview-title"
                title={session.title || "Untitled session"}
                className="max-w-[34rem] min-w-0 truncate text-xl font-semibold tracking-[-0.025em] text-[var(--foreground)]"
              >
                {session.title || "Untitled session"}
              </h2>
              <AgentRuntimeBadge runtime={session.runtime} className="shrink-0" />
            </div>
            <p className="mt-2 flex min-w-0 items-center gap-2 text-xs text-[var(--muted-foreground)]">
              <Folder className="size-3.5 shrink-0" />
              <span className="truncate">{session.directory}</span>
            </p>
          </div>
          <p className="shrink-0 self-start text-xs font-medium whitespace-nowrap text-[var(--accent)]">
            {session.models.length} model{session.models.length === 1 ? "" : "s"}
          </p>
        </div>

        <div data-testid="session-metrics" className="mt-5 grid grid-cols-2 lg:grid-cols-4">
          <SessionMetric
            className="border-b border-[var(--border)] lg:border-b-0"
            icon={Coins}
            label="Tokens"
            value={formatCompactNumber(session.tokens)}
          />
          <SessionMetric
            className="border-b border-l border-[var(--border)] lg:border-b-0"
            icon={MessageSquare}
            label="Messages"
            value={`${session.messages}`}
          />
          <SessionMetric
            className="lg:border-l lg:border-[var(--border)]"
            icon={Shapes}
            label="Estimated spend"
            value={formatCurrency(session.cost)}
          />
          <SessionMetric
            className="border-l border-[var(--border)]"
            icon={Clock3}
            label="Longest active task"
            value={
              session.runtime === "opencode"
                ? formatCompactDuration(session.longestTaskDurationMs)
                : "N/A"
            }
          />
        </div>
        {session.runtime === "opencode" ? (
          <p className="mt-2 text-[10px] text-[var(--muted-foreground)]">
            Assistant active time. Steer continuations are merged and overlapping subagent work is
            counted once.
          </p>
        ) : null}

        <div className="mt-5 grid lg:grid-cols-2 lg:divide-x lg:divide-[var(--border)]">
          <div className="py-5 lg:pr-5">
            <p className="text-sm font-semibold text-[var(--foreground)]">Token mix</p>
            <div
              role="img"
              aria-label="Session token mix"
              className="mt-4 flex h-3 overflow-hidden rounded-full bg-[var(--border)]"
            >
              {TOKEN_PARTS.map((part) => (
                <span
                  key={part.key}
                  style={{
                    width: `${classifiedTokens > 0 ? (session.breakdown[part.key] / classifiedTokens) * 100 : 0}%`,
                    background: part.color,
                  }}
                />
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              {TOKEN_PARTS.map((part) => (
                <p key={part.key} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-2 text-[var(--muted-foreground)]">
                    <span className="size-2 rounded-full" style={{ background: part.color }} />
                    {part.label}
                  </span>
                  <span className="font-medium text-[var(--foreground)]">
                    {formatCompactNumber(session.breakdown[part.key])}
                  </span>
                </p>
              ))}
            </div>
          </div>

          <div className="border-t border-[var(--border)] py-5 lg:border-t-0 lg:pl-5">
            <p className="text-sm font-semibold text-[var(--foreground)]">Model routing</p>
            <div className="mt-3 grid gap-2">
              {topModels.map((model) => (
                <div
                  key={`${model.providerId}/${model.modelId}`}
                  className="flex items-center gap-3 border-t border-[var(--border)] py-2.5 first:border-t-0"
                >
                  <ProviderIcon providerId={model.providerId} className="size-4" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--foreground)]">
                      {getModelDisplayName(model.modelId, model.providerId)}
                    </p>
                    <p className="text-[10px] text-[var(--muted-foreground)]">
                      {formatCompactNumber(model.tokens)} tokens
                    </p>
                  </div>
                  <p className="text-xs font-semibold text-[var(--foreground)]">
                    {formatCurrency(model.cost)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SessionMetric({
  className,
  icon: Icon,
  label,
  value,
}: {
  className?: string;
  icon: typeof Coins;
  label: string;
  value: string;
}) {
  return (
    <div className={cn("p-3.5", className)}>
      <p className="metric-label">
        <Icon className="size-3.5" />
        {label}
      </p>
      <p className="metric-value mt-2 text-xl">{value}</p>
    </div>
  );
}
