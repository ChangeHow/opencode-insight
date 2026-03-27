import type { MessageDetail } from "@opencode-dashboard/shared";
import { MessageItem } from "./message-item";
import { Button } from "@/components/ui/button";

interface MessageListProps {
  messages: MessageDetail[];
  total: number;
  loading: boolean;
  onLoadMore: () => void;
}

function totalTokenCount(msg: MessageDetail): number {
  return msg.tokens.input + msg.tokens.output + msg.tokens.reasoning + msg.tokens.cacheRead + msg.tokens.cacheWrite;
}

export function MessageList({ messages, total, loading, onLoadMore }: MessageListProps) {
  if (loading && messages.length === 0) {
    return <div className="h-40 animate-pulse rounded-[18px] bg-[var(--panel-strong)]" />;
  }

  if (messages.length === 0 && !loading) {
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
    <div className="detail-scrollbar max-h-[70vh] space-y-1 overflow-y-auto pr-1">
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
