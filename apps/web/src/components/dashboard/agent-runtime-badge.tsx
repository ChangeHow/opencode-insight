import type { ComponentType, SVGProps } from "react";
import Codex from "@lobehub/icons/es/Codex";
import OpenCode from "@lobehub/icons/es/OpenCode";
import type { AgentRuntime } from "@opencode-dashboard/shared";
import { cn } from "@/lib/utils";

const RUNTIME_DETAILS: Record<
  AgentRuntime,
  { icon: ComponentType<SVGProps<SVGSVGElement>>; label: string }
> = {
  opencode: { icon: OpenCode, label: "OpenCode" },
  codex: { icon: Codex, label: "Codex CLI" },
};

export function AgentRuntimeBadge({
  runtime,
  className,
}: {
  runtime: AgentRuntime;
  className?: string;
}) {
  const details = RUNTIME_DETAILS[runtime];
  const Icon = details.icon;

  return (
    <span
      aria-label={`Agent runtime: ${details.label}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--panel-strong)] px-2 py-1 text-[10px] font-semibold whitespace-nowrap text-[var(--muted-foreground)]",
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      {details.label}
    </span>
  );
}
