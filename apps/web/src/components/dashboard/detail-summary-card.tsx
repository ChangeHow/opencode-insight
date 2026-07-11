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
    <div className="px-4 sm:px-8 lg:px-10">
      <div className="mx-auto w-full max-w-[54rem] rounded-[12px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[var(--surface-shadow)] sm:p-6">
        <div className="flex flex-col items-start gap-4 md:flex-row md:justify-between">
          <div className="min-w-0 space-y-3 [overflow-wrap:anywhere]">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="gap-2">{primaryBadge}</Badge>
              <Badge variant="muted">{secondaryBadge}</Badge>
            </div>
            <div>
              <h2
                className={`${titleClassName} font-bold tracking-[-0.02em] text-[var(--foreground)] break-words`.trim()}
              >
                {title}
              </h2>
              {extraMeta}
              <p className="mt-2 break-words text-xs leading-5 text-[var(--muted-foreground)]">
                {description}
              </p>
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
    <div className="grid w-full grid-cols-1 gap-2 text-sm md:w-auto md:shrink-0 md:self-center min-[920px]:min-w-56">
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
