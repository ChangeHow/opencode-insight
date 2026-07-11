import { useState } from "react";
import { Bot, BrainCircuit, ChevronDown, ChevronRight, Clock3, User } from "lucide-react";
import type { MessageDetail } from "@opencode-dashboard/shared";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatCompactNumber, formatCurrency, formatDuration } from "@/lib/format";
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
  const toolCount = message.parts.filter((part) => part.type === "tool").length;
  const duration = message.completedAt
    ? formatDuration(Math.max(0, message.completedAt - message.createdAt))
    : null;

  return (
    <article
      data-message-role={message.role}
      className="border-t border-[var(--border)] py-5 first:border-t-0"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {isAssistant ? (
            <Bot className="size-4 text-[var(--accent)]" />
          ) : (
            <User className="size-4 text-[var(--muted-foreground)]" />
          )}
          <span className="text-xs font-semibold capitalize text-[var(--foreground)]">
            {message.role}
          </span>
          {message.modelId ? (
            <span className="text-[10px] text-[var(--muted-foreground)]">
              {getModelDisplayName(message.modelId, message.providerId)}
            </span>
          ) : null}
          <span className="text-[10px] text-[var(--muted-foreground)]">
            {new Date(message.createdAt).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        </div>

        <div className="mt-3 space-y-3">
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

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-[var(--muted-foreground)]">
          {totalTokens > 0 ? (
            <span>
              {formatCompactNumber(totalTokens)} tokens
              {cumulativeTokens != null
                ? ` · ${formatCompactNumber(cumulativeTokens)} cumulative`
                : ""}
            </span>
          ) : null}
          {message.cost > 0 ? <span>{formatCurrency(message.cost)}</span> : null}
          {duration ? (
            <span className="inline-flex items-center gap-1">
              <Clock3 className="size-3" /> {duration}
            </span>
          ) : null}
          {toolCount > 0 ? <span>{toolCount} tool calls</span> : null}
        </div>
      </div>
    </article>
  );
}

function ReasoningSection({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-xs font-medium text-[var(--muted-foreground)] hover:bg-[var(--interactive-hover)] hover:text-[var(--foreground)]">
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <BrainCircuit className="size-3.5" />
        Reasoning
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ui-collapsible-panel whitespace-pre-wrap text-xs leading-5 text-[var(--muted-foreground)]">
          {content}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
