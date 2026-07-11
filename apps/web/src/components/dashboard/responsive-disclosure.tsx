import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

function subscribeToDesktop(callback: () => void) {
  const query = window.matchMedia("(min-width: 768px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function getDesktopSnapshot() {
  return window.matchMedia("(min-width: 768px)").matches;
}

export function ResponsiveDisclosure({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const isDesktop = useSyncExternalStore(subscribeToDesktop, getDesktopSnapshot, () => false);

  return (
    <details open={isDesktop || undefined} className={cn("group", className)}>
      <summary className="flex min-h-11 list-none items-center justify-between px-1 py-3 text-sm font-semibold text-[var(--foreground)] md:hidden">
        {label}
        <ChevronDown className="size-4 text-[var(--muted-foreground)] transition group-open:rotate-180" />
      </summary>
      <div className="hidden group-open:block">{children}</div>
    </details>
  );
}
