import { useState } from "react";
import { CheckCircle, ChevronDown, ChevronRight, Clock, Wrench, XCircle } from "lucide-react";
import type { MessagePartTool } from "@opencode-dashboard/shared";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatDuration } from "@/lib/format";

interface ToolCallCardProps {
  part: MessagePartTool;
}

export function ToolCallCard({ part }: ToolCallCardProps) {
  const [open, setOpen] = useState(false);

  const statusIcon =
    part.status === "completed" ? (
      <CheckCircle className="size-3 text-[var(--metric-green)]" />
    ) : part.status === "error" ? (
      <XCircle className="size-3 text-red-500" />
    ) : (
      <Clock className="size-3 text-[var(--muted-foreground)]" />
    );

  const inputStr =
    part.input === null || part.input === undefined
      ? ""
      : typeof part.input === "string"
        ? part.input
        : JSON.stringify(part.input, null, 2);
  const duration =
    part.time.end > part.time.start ? formatDuration(part.time.end - part.time.start) : null;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-[10px] border border-[var(--border)] bg-[var(--panel)]"
    >
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-[var(--interactive-hover)]">
        {open ? (
          <ChevronDown className="size-3 shrink-0 text-[var(--muted-foreground)]" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-[var(--muted-foreground)]" />
        )}
        <Wrench className="size-3.5 shrink-0 text-[var(--muted-foreground)]" />
        {statusIcon}
        <span className="flex-1 truncate font-mono text-xs text-[var(--foreground)]">
          {part.title ?? part.toolName}
        </span>
        {duration ? (
          <span className="shrink-0 text-[10px] text-[var(--muted-foreground)]">{duration}</span>
        ) : null}
        <span className="shrink-0 rounded-[6px] bg-[var(--panel-strong)] px-2 py-0.5 text-[10px] capitalize text-[var(--muted-foreground)]">
          {part.status}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid gap-3 border-t border-[var(--border)] p-3 sm:grid-cols-2">
          {inputStr ? (
            <div className="min-w-0">
              <p className="mb-1 text-[10px] font-semibold text-[var(--muted-foreground)]">Input</p>
              <pre className="ui-collapsible-panel mt-0 font-mono text-xs text-[var(--foreground)]">
                {inputStr}
              </pre>
            </div>
          ) : null}
          {part.output ? (
            <div className="min-w-0">
              <p className="mb-1 text-[10px] font-semibold text-[var(--muted-foreground)]">
                Output
              </p>
              <pre className="ui-collapsible-panel mt-0 font-mono text-xs text-[var(--foreground)]">
                {part.output}
              </pre>
            </div>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
