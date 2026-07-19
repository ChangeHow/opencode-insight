import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, House } from "lucide-react";
import { ThemeToggleButton } from "@/components/dashboard/dashboard-toolbar";

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
        <div className="mx-auto max-w-7xl px-4 pt-2.5 pb-2 sm:px-8 lg:px-10">{children}</div>
      </div>
    </div>
  );
}

export function DetailStickyHeader({
  backTo,
  backParams,
  backLabel,
  theme,
  onThemeChange,
}: {
  backTo: "/overview" | "/detail/$date";
  backParams?: { date: string };
  backLabel: string;
  theme: "light" | "dark" | "system";
  onThemeChange: (nextTheme: "light" | "dark" | "system") => void;
}) {
  const detailHeaderLinkClassName =
    "inline-flex h-10 cursor-pointer items-center gap-2 rounded-[9px] border border-[var(--border)] bg-[var(--panel)] text-sm font-semibold text-[var(--foreground)] outline-none transition hover:bg-[var(--interactive-hover)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

  return (
    <StickyHeaderShell>
      <div className="flex min-w-0 flex-wrap items-center gap-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Link to={backTo} params={backParams} className={`${detailHeaderLinkClassName} px-3.5`}>
            <ChevronLeft className="size-4" />
            <span className="hidden sm:inline">{backLabel}</span>
            <span className="sm:hidden">Back</span>
          </Link>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Link
            to="/"
            aria-label="Dashboard home"
            title="Dashboard home"
            className={`${detailHeaderLinkClassName} w-10 justify-center`}
          >
            <House data-testid="dashboard-home-icon" className="size-[20px] shrink-0" />
          </Link>
          <ThemeToggleButton theme={theme} onChange={onThemeChange} compact />
        </div>
      </div>
    </StickyHeaderShell>
  );
}
