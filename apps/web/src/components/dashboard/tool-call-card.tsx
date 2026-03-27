import { useState } from "react";
import { ChevronDown, ChevronRight, CheckCircle, XCircle, Clock } from "lucide-react";
import type { MessagePartTool } from "@opencode-dashboard/shared";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="-ml-6 flex w-[calc(100%+1.5rem)] items-center gap-2 rounded-[10px] px-2.5 py-1.5 pl-6 text-left hover:bg-[var(--panel)]/60">
        {open ? <ChevronDown className="size-3 shrink-0 text-[var(--muted-foreground)]" /> : <ChevronRight className="size-3 shrink-0 text-[var(--muted-foreground)]" />}
        {statusIcon}
        <span className="flex-1 truncate font-mono text-xs text-[var(--foreground)]">
          {part.title ?? part.toolName}
        </span>
        <span className="shrink-0 text-[10px] text-[var(--muted-foreground)]">{part.toolName}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 space-y-2 pb-1 pl-6">
          {inputStr ? (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Input</p>
              <pre className="ui-collapsible-panel mt-0 font-mono text-xs text-[var(--foreground)]">{inputStr}</pre>
            </div>
          ) : null}
          {part.output ? (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Output</p>
              <pre className="ui-collapsible-panel mt-0 font-mono text-xs text-[var(--foreground)]">{part.output}</pre>
            </div>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
