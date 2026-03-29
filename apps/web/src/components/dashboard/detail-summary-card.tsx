import React from "react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

export function DetailSummaryCard({
  primaryBadge,
  secondaryBadge,
  title,
  description,
  extraMeta,
  stats,
  titleClassName = "text-3xl",
}: {
  primaryBadge: ReactNode;
  secondaryBadge: string;
  title: ReactNode;
  description: ReactNode;
  extraMeta?: ReactNode;
  stats: ReactNode;
  titleClassName?: string;
}) {
  return (
    <div className="px-6 sm:px-8 lg:px-10">
      <div className="mx-auto w-full max-w-[54rem] rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="gap-2">{primaryBadge}</Badge>
              <Badge variant="muted">{secondaryBadge}</Badge>
            </div>
            <div>
              <h2
                className={`${titleClassName} font-bold tracking-[-0.02em] text-[var(--foreground)]`.trim()}
              >
                {title}
              </h2>
              {extraMeta}
              <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">{description}</p>
            </div>
          </div>
          {stats}
        </div>
      </div>
    </div>
  );
}

export function InlineStatList({ children }: { children: ReactNode }) {
  return (
    <div className="grid shrink-0 grid-cols-1 gap-2 self-center text-sm min-[920px]:min-w-56">
      {children}
    </div>
  );
}

export function InlineStat({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 whitespace-nowrap border-b border-[var(--border)]/60 pb-2 last:border-b-0 last:pb-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
        {label}
      </p>
      <p
        className={`text-sm font-semibold text-[var(--foreground)] ${valueClassName ?? ""}`.trim()}
      >
        {value}
      </p>
    </div>
  );
}
