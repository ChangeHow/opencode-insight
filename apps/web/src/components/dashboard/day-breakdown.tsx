import React from "react";
import { Pin } from "lucide-react";
import type { DayBreakdown } from "@opencode-dashboard/shared";
import {
  DetailSummaryCard,
  InlineStat,
  InlineStatList,
} from "@/components/dashboard/detail-summary-card";
import {
  CostByModelPanel,
  ModelTokenSharePanel,
} from "@/components/dashboard/model-breakdown-panels";
import { buildModelBreakdownData } from "@/components/dashboard/model-breakdown-data";
import { PinnedPlaceholderPanel } from "@/components/dashboard/pinned-placeholder-panel";
import { HorizontalPanelRail } from "@/components/dashboard/horizontal-panel-rail";
import { TokenBreakdownPanel } from "@/components/dashboard/token-breakdown-panel";
import { formatCompactNumber, formatCurrency, formatLongDateLabel } from "@/lib/format";

export function DayBreakdownPanel({
  day,
  loading,
}: {
  day: DayBreakdown | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-8 lg:px-10">
        <div className="rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-6 text-sm text-[var(--muted-foreground)]">
          Loading day detail...
        </div>
      </div>
    );
  }

  if (!day) {
    return (
      <div className="mx-4 rounded-[28px] border border-dashed border-[var(--border)] bg-[var(--panel)] p-6 text-sm text-[var(--muted-foreground)] sm:mx-8 lg:mx-10">
        Select a day to inspect model mix, message count, and token split.
      </div>
    );
  }

  const { costByModel, modelTokenShare } = buildModelBreakdownData(day.models);

  return (
    <div className="space-y-6">
      <DetailSummaryCard
        primaryBadge={
          <>
            <Pin className="size-3" />
            Pinned day
          </>
        }
        secondaryBadge="Detail view"
        title={formatLongDateLabel(day.date)}
        description={
          <>
            {formatCompactNumber(day.tokens)} tokens across {day.messages} assistant messages, with{" "}
            {formatCurrency(day.cost)} in estimated spend.
          </>
        }
        stats={
          <InlineStatList>
            <InlineStat label="Input" value={formatCompactNumber(day.breakdown.input)} />
            <InlineStat label="Output" value={formatCompactNumber(day.breakdown.output)} />
            <InlineStat
              label="Estimated cost"
              value={formatCurrency(day.cost)}
              valueClassName="text-lg font-bold"
            />
          </InlineStatList>
        }
      />

      <HorizontalPanelRail
        stackOnMobile
        contentClassName="gap-4 px-4 sm:px-8 md:h-[26rem] md:gap-6 lg:px-10"
      >
        <TokenBreakdownPanel breakdown={day.breakdown} />

        <CostByModelPanel eyebrow="Pinned spend" entries={costByModel} />

        <ModelTokenSharePanel eyebrow="Pinned share" entries={modelTokenShare} />
        <PinnedPlaceholderPanel />
      </HorizontalPanelRail>
    </div>
  );
}
