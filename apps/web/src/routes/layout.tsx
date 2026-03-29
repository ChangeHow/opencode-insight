import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ThemeToggleButton } from "./shared";

function useStuck(): [React.RefObject<HTMLDivElement | null>, boolean] {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([e]) => setStuck(e.intersectionRatio < 1), {
      threshold: [1],
      rootMargin: "0px 0px -1px 0px",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [sentinelRef, stuck];
}

export function DashboardPageLayout({
  header,
  children,
  variant = "default",
}: {
  header?: ReactNode;
  children: ReactNode;
  variant?: "default" | "wide";
}) {
  return (
    <>
      {header}
      <section
        className={
          variant === "wide"
            ? "w-full space-y-8 pb-10 lg:pb-14"
            : "mx-auto max-w-7xl space-y-6 pb-8 lg:pb-10"
        }
      >
        {children}
      </section>
    </>
  );
}

export function StickyHeaderShell({ children }: { children: ReactNode }) {
  const [sentinelRef, stuck] = useStuck();
  return (
    <div ref={sentinelRef} className="sticky top-0 z-30 w-full overflow-x-clip">
      <div
        className={`w-full bg-[color-mix(in_oklch,var(--background)_82%,transparent)]/90 backdrop-blur-xl transition-shadow duration-200 supports-[backdrop-filter]:bg-[color-mix(in_oklch,var(--background)_72%,transparent)]${stuck ? " shadow-[0_1px_3px_var(--header-shadow-color),0_8px_24px_var(--header-shadow-color)]" : ""}`}
      >
        <div className="mx-auto max-w-7xl px-6 pt-2.5 pb-2 sm:px-8 lg:px-10">{children}</div>
      </div>
    </div>
  );
}

export function DetailStickyHeader({
  backTo,
  backParams,
  backLabel,
  title,
  theme,
  onThemeChange,
  canRefresh = false,
  refreshDisabledReason = "Refresh is only available when the selected range includes today.",
  onRefresh,
}: {
  backTo: "/overview" | "/detail/$date";
  backParams?: { date: string };
  backLabel: string;
  title: string;
  theme: "light" | "dark" | "system";
  onThemeChange: (nextTheme: "light" | "dark" | "system") => void;
  canRefresh?: boolean;
  refreshDisabledReason?: string;
  onRefresh?: () => Promise<void>;
}) {
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefreshClick() {
    if (!onRefresh || refreshing || !canRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <StickyHeaderShell>
      <div className="relative flex items-center justify-between gap-3">
        <div className="relative z-10 shrink-0">
          <Link
            to={backTo}
            params={backParams}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3.5 text-sm font-semibold text-[var(--foreground)] outline-none transition hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <ChevronLeft className="size-4" />
            {backLabel}
          </Link>
        </div>
        <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-base font-semibold text-[var(--foreground)]">
          {title}
        </p>
        <div className="relative z-10 flex shrink-0 items-center gap-2">
          <HeaderRefreshButton
            canRefresh={canRefresh}
            refreshing={refreshing}
            disabledReason={refreshDisabledReason}
            onRefresh={handleRefreshClick}
          />
          <ThemeToggleButton theme={theme} onChange={onThemeChange} />
        </div>
      </div>
    </StickyHeaderShell>
  );
}

export function HeaderRefreshButton({
  canRefresh,
  refreshing,
  disabledReason,
  onRefresh,
}: {
  canRefresh: boolean;
  refreshing: boolean;
  disabledReason: string;
  onRefresh: () => void | Promise<void>;
}) {
  const button = (
    <Button variant="outline" size="sm" onClick={onRefresh} disabled={!canRefresh || refreshing}>
      <RefreshCcw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
      Refresh
    </Button>
  );

  if (canRefresh) {
    return button;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>{button}</span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{disabledReason}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
