import { useState } from "react";
import type { SessionBreakdown } from "@opencode-dashboard/shared";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, MessageSquare } from "lucide-react";
import { ProviderIcon } from "@/components/dashboard/provider-icon";
import { Stat } from "@/components/dashboard/stat";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { formatCompactNumber, formatCurrency } from "@/lib/format";
import { getModelDisplayName } from "@/lib/model-display";

const TOKEN_THRESHOLD = 1_000_000;

export function SessionListPanel({
  date,
  sessions,
  hiddenSessions,
  totalSessions,
  filteredCount,
}: {
  date: string;
  sessions: SessionBreakdown[];
  hiddenSessions: SessionBreakdown[];
  totalSessions: number;
  filteredCount: number;
}) {
  const [showHiddenSessions, setShowHiddenSessions] = useState(false);

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
            {filteredCount} session{filteredCount > 1 ? "s" : ""} below threshold hidden by default
          </p>
        )}
      </div>
      {sessions.length > 0 ? (
        <div className="mt-5 max-h-[450px] overflow-y-auto space-y-3">
          {sessions.map((session) => (
            <SessionCard key={session.sessionId} date={date} session={session} />
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-[22px] border border-dashed border-[var(--border)] bg-[var(--panel-strong)]/45 p-4 text-sm text-[var(--muted-foreground)]">
          No sessions meet the {formatCompactNumber(TOKEN_THRESHOLD)} token threshold. Expand the
          hidden sessions below to inspect the rest of the day.
        </div>
      )}
      {hiddenSessions.length > 0 && (
        <Collapsible open={showHiddenSessions} onOpenChange={setShowHiddenSessions}>
          <div className="mt-4 rounded-[22px] border border-[var(--border)] bg-[var(--panel-strong)]/45 p-2">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="h-auto w-full justify-between rounded-[18px] px-3 py-2.5"
              >
                <span>
                  {showHiddenSessions ? "Hide" : "Show"} {filteredCount} session
                  {filteredCount > 1 ? "s" : ""} below {formatCompactNumber(TOKEN_THRESHOLD)} tokens
                </span>
                <ChevronDown
                  className={`size-4 transition-transform ${showHiddenSessions ? "rotate-180" : ""}`}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-2 pt-2 pb-1">
              <p className="mb-3 text-xs text-[var(--muted-foreground)]">
                These sessions are hidden by default, but you can still open any of them to inspect
                detailed usage.
              </p>
              <div className="max-h-[360px] space-y-3 overflow-y-auto">
                {hiddenSessions.map((session) => (
                  <SessionCard key={session.sessionId} date={date} session={session} />
                ))}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}
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
              {getModelDisplayName(topModel.modelId, topModel.providerId)}
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
