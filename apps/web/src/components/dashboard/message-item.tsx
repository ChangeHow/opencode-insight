import { useState } from "react";
import { Bot, ChevronDown, ChevronRight, Clock3, Sparkles, User } from "lucide-react";
import type { MessageDetail } from "@opencode-dashboard/shared";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatCompactNumber, formatCurrency, formatDuration } from "@/lib/format";
import { getModelDisplayName } from "@/lib/model-display";
import { MarkdownRenderer } from "./markdown-renderer";
import { ToolCallCard } from "./tool-call-card";

interface MessageItemProps {
  message: MessageDetail;
}

export function MessageItem({ message }: MessageItemProps) {
  const isAssistant = message.role === "assistant";
  const totalTokens =
    message.tokens.input +
    message.tokens.output +
    message.tokens.reasoning +
    message.tokens.cacheRead +
    message.tokens.cacheWrite;
  const toolCount = message.parts.filter((part) => part.type === "tool").length;
  const duration = message.completedAt
    ? formatDuration(Math.max(0, message.completedAt - message.createdAt))
    : null;

  return (
    <article
      data-message-role={message.role}
      className="border-t border-[var(--border)] py-4 first:border-t-0"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {isAssistant ? (
            <span className="grid size-6 shrink-0 place-items-center rounded-[7px] bg-[var(--accent-soft)]">
              <Bot className="size-3.5 text-[var(--accent)]" />
            </span>
          ) : (
            <span className="grid size-6 shrink-0 place-items-center rounded-[7px] bg-[var(--panel-strong)]">
              <User className="size-3.5 text-[var(--muted-foreground)]" />
            </span>
          )}
          <span className="text-xs font-semibold capitalize text-[var(--foreground)]">
            {message.role}
          </span>
          {message.modelId ? (
            <span className="rounded-[6px] bg-[var(--panel-strong)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted-foreground)]">
              {getModelDisplayName(message.modelId, message.providerId)}
            </span>
          ) : null}
          <span className="ml-auto text-[10px] tabular-nums text-[var(--muted-foreground)]">
            {new Date(message.createdAt).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        </div>

        <div
          className={
            isAssistant
              ? "mt-3 space-y-3"
              : "mt-3 space-y-3 rounded-[12px] border border-[var(--border)] bg-[var(--accent-soft)] px-4 py-3"
          }
        >
          {message.parts.map((part) => {
            if (part.type === "text") {
              return (
                <MarkdownRenderer
                  key={`${part.type}-${part.time.start}-${part.time.end}-${part.text}`}
                  content={part.text}
                />
              );
            }
            if (part.type === "reasoning") {
              return (
                <ReasoningSection
                  key={`${part.type}-${part.time.start}-${part.time.end}-${part.text}`}
                  content={part.text}
                />
              );
            }
            if (part.type === "tool") {
              return <ToolCallCard key={part.callId} part={part} />;
            }
            return null;
          })}
        </div>

        {totalTokens > 0 || message.cost > 0 || duration || toolCount > 0 ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-[var(--muted-foreground)]">
            {totalTokens > 0 ? <span>{formatCompactNumber(totalTokens)} tok</span> : null}
            {message.cost > 0 ? <span>{formatCurrency(message.cost)}</span> : null}
            {duration ? (
              <span className="inline-flex items-center gap-1">
                <Clock3 className="size-3" /> {duration}
              </span>
            ) : null}
            {toolCount > 0 ? <span>{toolCount} tools</span> : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function ReasoningSection({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="border-l-2 border-[var(--accent)]/40 pl-3">
        <CollapsibleTrigger className="flex items-center gap-2 rounded-[8px] px-1 py-1 text-xs font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]">
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          <Sparkles className="size-3.5 text-[var(--accent)]" />
          Reasoning
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-1 rounded-[8px] bg-[var(--accent-soft)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
            <MarkdownRenderer content={content} className="text-[0.8rem] leading-6 opacity-90" />
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
