import type { SessionBreakdown } from "@opencode-dashboard/shared";
import { Link } from "@tanstack/react-router";
import { ChevronRight, MessageSquare } from "lucide-react";
import { ProviderIcon } from "@/components/dashboard/provider-icon";
import { Stat } from "@/components/dashboard/stat";
import { formatCompactNumber, formatCurrency } from "@/lib/format";

const TOKEN_THRESHOLD = 1_000_000;

export function SessionListPanel({
  date,
  sessions,
  totalSessions,
  filteredCount,
}: {
  date: string;
  sessions: SessionBreakdown[];
  totalSessions: number;
  filteredCount: number;
}) {
  if (totalSessions === 0) {
    return (
      <div className="mx-auto w-full max-w-[54rem] rounded-[28px] border border-dashed border-[var(--border)] bg-[var(--panel)] p-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
          Sessions
        </p>
        <h3 className="mt-2 text-lg font-semibold text-[var(--foreground)]">
          No session data available
        </h3>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          There are no sessions recorded for this day.
        </p>
      </div>
    );
  }

  if (sessions.length === 0 && filteredCount > 0) {
    return (
      <div className="mx-auto w-full max-w-[54rem] rounded-[28px] border border-dashed border-[var(--border)] bg-[var(--panel)] p-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
          Sessions
        </p>
        <h3 className="mt-2 text-lg font-semibold text-[var(--foreground)]">
          No high-token sessions
        </h3>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          This day has {totalSessions} session{totalSessions > 1 ? "s" : ""}, but all have fewer
          than {formatCompactNumber(TOKEN_THRESHOLD)} tokens.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[54rem] rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-6">
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
          Sessions
        </p>
        <h3 className="text-xl font-semibold text-[var(--foreground)]">
          High-token sessions ({formatCompactNumber(TOKEN_THRESHOLD)}+ tokens)
        </h3>
        {filteredCount > 0 && (
          <p className="text-xs text-[var(--muted-foreground)]">
            {filteredCount} session{filteredCount > 1 ? "s" : ""} below threshold hidden
          </p>
        )}
      </div>
      <div className="mt-5 space-y-3">
        {sessions.map((session) => (
          <SessionCard key={session.sessionId} date={date} session={session} />
        ))}
      </div>
    </div>
  );
}

export function SessionCard({ date, session }: { date: string; session: SessionBreakdown }) {
  const topModel = session.models.length > 0 ? session.models[0] : null;

  return (
    <Link
      to="/detail/$date/$session"
      params={{ date, session: session.sessionId }}
      className="group grid gap-4 rounded-[22px] border border-[var(--border)] bg-[var(--panel-strong)] p-4 transition hover:border-[var(--accent)] hover:bg-[var(--panel-strong)]/80 sm:grid-cols-[1.5fr_1fr_1fr_1fr_auto]"
    >
      <div className="min-w-0">
        <p className="truncate font-semibold text-[var(--foreground)]">
          {session.title || "Untitled session"}
        </p>
        <p className="mt-1 truncate text-xs text-[var(--muted-foreground)]">{session.directory}</p>
        {topModel && (
          <p className="mt-1.5 flex items-center gap-1.5">
            <ProviderIcon providerId={topModel.providerId} className="size-3" withTooltip />
            <span className="truncate text-[11px] text-[var(--muted-foreground)]">
              {topModel.modelId}
            </span>
          </p>
        )}
      </div>
      <Stat label="Tokens" value={formatCompactNumber(session.tokens)} />
      <Stat
        label="Messages"
        value={String(session.messages)}
        icon={<MessageSquare className="size-3" />}
      />
      <Stat label="Cost" value={formatCurrency(session.cost)} />
      <div className="hidden items-center justify-end sm:flex">
        <ChevronRight className="size-5 text-[var(--muted-foreground)] transition group-hover:text-[var(--foreground)]" />
      </div>
    </Link>
  );
}
