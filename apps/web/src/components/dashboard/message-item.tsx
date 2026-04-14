import { useState } from "react";
import { ChevronDown, ChevronRight, User, Bot } from "lucide-react";
import type { MessageDetail } from "@opencode-dashboard/shared";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatCompactNumber, formatCurrency } from "@/lib/format";
import { getModelDisplayName } from "@/lib/model-display";
import { MarkdownRenderer } from "./markdown-renderer";
import { ToolCallCard } from "./tool-call-card";

interface MessageItemProps {
  message: MessageDetail;
  cumulativeTokens?: number;
}

export function MessageItem({ message, cumulativeTokens }: MessageItemProps) {
  const isAssistant = message.role === "assistant";
  const totalTokens =
    message.tokens.input +
    message.tokens.output +
    message.tokens.reasoning +
    message.tokens.cacheRead +
    message.tokens.cacheWrite;

  const toolCount = message.parts.filter((p) => p.type === "tool").length;

  return (
    <div className="rounded-[16px] px-4 py-3">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-2">
        {isAssistant ? (
          <Bot className="size-4 shrink-0 text-[var(--metric-violet)]" />
        ) : (
          <User className="size-4 shrink-0 text-[var(--muted-foreground)]" />
        )}
        <span className="text-xs font-semibold capitalize text-[var(--foreground)]">
          {message.role}
        </span>
        {message.modelId ? (
          <span className="text-[10px] text-[var(--muted-foreground)]">
            {getModelDisplayName(message.modelId, message.providerId)}
          </span>
        ) : null}
        {totalTokens > 0 ? (
          <span className="text-[10px] text-[var(--muted-foreground)]">
            {cumulativeTokens != null
              ? `${formatCompactNumber(cumulativeTokens)} tokens (+${formatCompactNumber(totalTokens)})`
              : `${formatCompactNumber(totalTokens)} tokens`}
          </span>
        ) : null}
        {message.cost > 0 ? (
          <span className="text-[10px] text-[var(--muted-foreground)]">
            {formatCurrency(message.cost)}
          </span>
        ) : null}
        {toolCount > 0 ? (
          <span className="rounded-full bg-[var(--metric-violet)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--metric-violet)]">
            {toolCount} tool{toolCount !== 1 ? "s" : ""}
          </span>
        ) : null}
      </div>

      {/* Body: text inline, reasoning & tools collapsed */}
      <div className="mt-2 space-y-2 pl-6">
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            return <MarkdownRenderer key={i} content={part.text} />;
          }
          if (part.type === "reasoning") {
            return <ReasoningSection key={i} content={part.text} />;
          }
          if (part.type === "tool") {
            return <ToolCallCard key={part.callId} part={part} />;
          }
          return null;
        })}
      </div>
    </div>
  );
}

function ReasoningSection({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="-ml-6 flex w-[calc(100%+1.5rem)] items-center gap-1.5 pl-6 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}🧠
        Reasoning
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ui-collapsible-panel text-xs text-[var(--muted-foreground)] italic">
          {content}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
