import type { MessageDetail } from "@opencode-dashboard/shared";
import { MessageItem } from "./message-item";
import { Button } from "@/components/ui/button";

interface MessageListProps {
  messages: MessageDetail[];
  total: number;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onLoadMore: () => void;
}

function totalTokenCount(msg: MessageDetail): number {
  return (
    msg.tokens.input +
    msg.tokens.output +
    msg.tokens.reasoning +
    msg.tokens.cacheRead +
    msg.tokens.cacheWrite
  );
}

export function MessageList({
  messages,
  total,
  loading,
  error,
  onRetry,
  onLoadMore,
}: MessageListProps) {
  if (loading && messages.length === 0) {
    return <div className="h-40 animate-pulse rounded-[18px] bg-[var(--panel-strong)]" />;
  }

  if (messages.length === 0 && !loading) {
    if (error) {
      return (
        <div role="alert" className="rounded-[10px] bg-[var(--danger-soft)] p-4 text-sm">
          <p className="font-semibold text-[var(--danger)]">Unable to load this conversation.</p>
          <p className="mt-1 text-[var(--muted-foreground)]">{error}</p>
          <Button className="mt-3" variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      );
    }
    return (
      <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">No messages found.</p>
    );
  }

  const hasMore = messages.length < total;

  let cumulative = 0;
  const cumulativeTokens = messages.map((msg) => {
    cumulative += totalTokenCount(msg);
    return cumulative;
  });

  return (
    <div>
      {messages.map((msg, i) => (
        <MessageItem key={msg.id} message={msg} cumulativeTokens={cumulativeTokens[i]} />
      ))}
      {hasMore ? (
        <div className="flex justify-center py-3">
          <Button variant="outline" size="sm" onClick={onLoadMore} disabled={loading}>
            {loading ? "Loading..." : `Load more (${total - messages.length} remaining)`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
