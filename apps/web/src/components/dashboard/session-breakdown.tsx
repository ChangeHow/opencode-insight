import React from "react";
import type { SessionBreakdown } from "@opencode-dashboard/shared";
import { Pin } from "lucide-react";
import {
  DetailSummaryCard,
  InlineStat,
  InlineStatList,
} from "@/components/dashboard/detail-summary-card";
import { HorizontalPanelRail } from "@/components/dashboard/horizontal-panel-rail";
import {
  CostByModelPanel,
  ModelTokenSharePanel,
} from "@/components/dashboard/model-breakdown-panels";
import { buildModelBreakdownData } from "@/components/dashboard/model-breakdown-data";
import { ModelLedgerPanel } from "@/components/dashboard/model-ledger-panel";
import { TokenBreakdownPanel } from "@/components/dashboard/token-breakdown-panel";
import { formatCompactNumber, formatCurrency, formatLongDateLabel } from "@/lib/format";

export function SessionBreakdownPanel({
  date,
  session,
}: {
  date: string;
  session: SessionBreakdown;
}) {
  const { costByModel, modelTokenMix, sortedModels } = buildModelBreakdownData(session.models);

  return (
    <div className="space-y-6">
      <DetailSummaryCard
        primaryBadge={
          <>
            <Pin className="size-3" />
            Session
          </>
        }
        secondaryBadge="Detail view"
        title={session.title || "Untitled session"}
        titleClassName="text-2xl"
        extraMeta={
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">{session.directory}</p>
        }
        description={
          <>
            {formatLongDateLabel(date)} • {formatCompactNumber(session.tokens)} tokens across{" "}
            {session.messages} assistant messages, with {formatCurrency(session.cost)} in estimated
            spend.
          </>
        }
        stats={
          <InlineStatList>
            <InlineStat label="Input" value={formatCompactNumber(session.breakdown.input)} />
            <InlineStat label="Output" value={formatCompactNumber(session.breakdown.output)} />
            <InlineStat
              label="Estimated cost"
              value={formatCurrency(session.cost)}
              valueClassName="text-lg font-bold"
            />
          </InlineStatList>
        }
      />

      <HorizontalPanelRail
        stackOnMobile
        contentClassName="gap-4 px-4 sm:px-8 md:h-[26rem] md:gap-6 lg:px-10"
      >
        <TokenBreakdownPanel breakdown={session.breakdown} eyebrow="Token mix" />
        <CostByModelPanel eyebrow="Session spend" entries={costByModel} />
        <ModelTokenSharePanel eyebrow="Model share" entries={modelTokenMix} />
      </HorizontalPanelRail>

      <ModelLedgerPanel models={sortedModels} />
    </div>
  );
}
