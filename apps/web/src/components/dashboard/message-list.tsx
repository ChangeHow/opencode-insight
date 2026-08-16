import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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

const PREFETCH_RATIO = 0.75;

export function MessageList({
  messages,
  total,
  loading,
  error,
  onRetry,
  onLoadMore,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(loading);
  loadingRef.current = loading;

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 160,
    overscan: 6,
    getItemKey: (index) => `${messages[index]?.id ?? index}:${index}`,
  });

  const hasMore = messages.length < total;

  // Infinite prefetch: when the viewport scrolls past 75% of the loaded range,
  // silently load the next page. No button, no visible loading state.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !hasMore) return;

    function handleScroll(this: HTMLDivElement) {
      if (loadingRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = this;
      if (scrollTop + clientHeight >= scrollHeight * PREFETCH_RATIO) {
        onLoadMore();
      }
    }

    handleScroll.call(element);
    element.addEventListener("scroll", handleScroll, { passive: true });
    return () => element.removeEventListener("scroll", handleScroll);
  }, [hasMore, onLoadMore, messages.length]);

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

  return (
    <div>
      <div
        ref={scrollRef}
        className="detail-scrollbar max-h-[70vh] overflow-y-auto rounded-[12px] border border-[var(--border)] bg-[var(--panel)] px-4 sm:px-5"
      >
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const message = messages[virtualRow.index];
            if (!message) return null;
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <MessageItem message={message} />
              </div>
            );
          })}
        </div>
        {hasMore ? (
          <p className="py-3 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
            {loading ? "Loading…" : `${formatRemaining(total - messages.length)} more messages`}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function formatRemaining(count: number) {
  return `${count}+`;
}
