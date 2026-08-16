import type { AgentRuntime } from "@opencode-dashboard/shared";
import { BrandIcon, type BrandIconName } from "@/components/dashboard/brand-icons";
import { cn } from "@/lib/utils";

const RUNTIME_DETAILS: Record<AgentRuntime, { icon: BrandIconName; label: string }> = {
  opencode: { icon: "opencode", label: "OpenCode" },
  codex: { icon: "codex", label: "Codex CLI" },
};

export function AgentRuntimeBadge({
  runtime,
  className,
}: {
  runtime: AgentRuntime;
  className?: string;
}) {
  const details = RUNTIME_DETAILS[runtime];

  return (
    <span
      aria-label={`Agent runtime: ${details.label}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--panel-strong)] px-2 py-1 text-[10px] font-semibold whitespace-nowrap text-[var(--muted-foreground)]",
        className,
      )}
    >
      <BrandIcon name={details.icon} className="size-3.5 shrink-0" />
      {details.label}
    </span>
  );
}
