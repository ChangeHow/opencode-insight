import { useEffect, useRef, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import { Activity, BarChart2, MessageSquare, Wrench } from "lucide-react";
import { Sparkline } from "@/components/dashboard/sparkline";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TOKEN_COLORS } from "@/lib/chart-colors";
import { formatCompactNumber } from "@/lib/format";
import {
  messageDistributionAtom,
  messageAnalyticsErrorAtom,
  messageOverviewAtom,
  messagesAtom,
  messagesLoadingAtom,
  messagesPageAtom,
  messagesTotalAtom,
  getMessageSessionCache,
  setMessageSessionCache,
} from "@/lib/atoms";
import { fetchMessageAnalytics, fetchMessages } from "@/lib/api";
import { MessageList } from "./message-list";

interface MessageAnalyticsPanelProps {
  date: string;
  sessionId: string;
}

export function MessageAnalyticsPanel({ date, sessionId }: MessageAnalyticsPanelProps) {
  const [, setOverview] = useAtom(messageOverviewAtom);
  const [, setDistribution] = useAtom(messageDistributionAtom);
  const [analyticsError, setAnalyticsError] = useAtom(messageAnalyticsErrorAtom);
  const [messages, setMessages] = useAtom(messagesAtom);
  const [messagesTotal, setMessagesTotal] = useAtom(messagesTotalAtom);
  const [messagesPage, setMessagesPage] = useAtom(messagesPageAtom);
  const [messagesLoading, setMessagesLoading] = useAtom(messagesLoadingAtom);
  const [messageError, setMessageError] = useState<string | null>(null);
  const messagesRequestRef = useRef(0);

  // Load overview + distribution on mount, using session-level cache
  useEffect(() => {
    let canceled = false;

    const requestId = ++messagesRequestRef.current;
    setAnalyticsError(null);
    setMessageError(null);
    setMessages([]);
    setMessagesTotal(0);
    setMessagesPage(0);
    setMessagesLoading(true);

    const cached = getMessageSessionCache(sessionId);
    if (cached) {
      setOverview(cached.overview);
      setDistribution(cached.distribution);
    } else {
      setOverview(null);
      setDistribution(null);

      void fetchMessageAnalytics(date, sessionId)
        .then(({ overview: ov, distribution: dist }) => {
          if (!canceled) {
            setOverview(ov);
            setDistribution(dist);
            setMessageSessionCache(sessionId, ov, dist);
          }
        })
        .catch((error: unknown) => {
          if (!canceled) {
            setAnalyticsError(
              error instanceof Error ? error.message : "Failed to load message analytics.",
            );
          }
        });
    }

    void fetchMessages(date, sessionId, 0)
      .then((result) => {
        if (canceled || requestId !== messagesRequestRef.current) return;
        setMessages(result.messages);
        setMessagesTotal(result.total);
        setMessagesPage(0);
      })
      .catch((error: unknown) => {
        if (!canceled && requestId === messagesRequestRef.current) {
          setMessageError(error instanceof Error ? error.message : "Failed to load conversation.");
        }
      })
      .finally(() => {
        if (!canceled && requestId === messagesRequestRef.current) {
          setMessagesLoading(false);
        }
      });

    return () => {
      canceled = true;
    };
  }, [
    date,
    sessionId,
    setAnalyticsError,
    setDistribution,
    setMessages,
    setMessagesLoading,
    setMessagesPage,
    setMessagesTotal,
    setOverview,
  ]);

  async function loadMessages(page: number) {
    const requestId = ++messagesRequestRef.current;
    setMessageError(null);
    setMessagesLoading(true);
    try {
      const result = await fetchMessages(date, sessionId, page);
      if (requestId !== messagesRequestRef.current) return;
      setMessages((prev) => (page === 0 ? result.messages : [...prev, ...result.messages]));
      setMessagesTotal(result.total);
      setMessagesPage(page);
    } catch (error) {
      setMessageError(error instanceof Error ? error.message : "Failed to load conversation.");
    } finally {
      if (requestId === messagesRequestRef.current) {
        setMessagesLoading(false);
      }
    }
  }

  function handleLoadMore() {
    void loadMessages(messagesPage + 1);
  }

  function handleTabChange(value: string) {
    if (value === "messages" && messages.length === 0 && !messagesLoading) {
      void loadMessages(0);
    }
  }

  return (
    <div
      data-testid="conversation-workspace"
      className="mx-auto w-full max-w-[64rem] border-t border-[var(--border)] pt-8 pb-6"
    >
      <div className="mb-5 space-y-2">
        <p className="metric-label">
          <MessageSquare className="size-3.5" />
          Session detail
        </p>
        <h3 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
          Transcript
        </h3>
        <p className="text-sm text-[var(--muted-foreground)]">
          Messages, tool activity, and usage metrics in chronological order.
        </p>
      </div>

      <Tabs defaultValue="messages" onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="messages" className="h-10 px-2 text-[11px] sm:text-xs">
            <MessageSquare className="mr-1.5 hidden size-3 sm:inline" />
            Transcript
            {messagesTotal > 0 ? (
              <span className="ml-1.5 rounded-full bg-[var(--panel-strong)] px-1.5 py-0.5 text-[10px]">
                {messagesTotal}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="overview" className="h-10 px-2 text-[11px] sm:text-xs">
            <Activity className="mr-1.5 hidden size-3 sm:inline" />
            Metrics
          </TabsTrigger>
          <TabsTrigger value="distribution" className="h-10 px-2 text-[11px] sm:text-xs">
            <BarChart2 className="mr-1.5 hidden size-3 sm:inline" />
            Token profile
          </TabsTrigger>
        </TabsList>

        <TabsContent value="messages">
          <MessageList
            messages={messages}
            total={messagesTotal}
            loading={messagesLoading}
            error={messageError}
            onRetry={() => void loadMessages(0)}
            onLoadMore={handleLoadMore}
          />
        </TabsContent>

        <TabsContent value="overview">
          <OverviewTab error={analyticsError} />
        </TabsContent>

        <TabsContent value="distribution">
          <DistributionTab error={analyticsError} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OverviewTab({ error }: { error: string | null }) {
  const overview = useAtomValue(messageOverviewAtom);

  if (error) {
    return <AnalyticsError message={error} />;
  }

  if (!overview) {
    return <LoadingPlaceholder />;
  }

  const topTools = overview.toolUsage.slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-3 text-xs font-semibold text-[var(--muted-foreground)]">
          Cumulative tokens over messages
        </p>
        <div className="h-44 border border-[var(--border)] bg-[var(--chart-surface)] p-4 sm:h-48">
          <Sparkline
            points={overview.timeline.map((point) => ({
              date: `Message ${point.messageIndex}`,
              value: point.cumulativeTokens,
            }))}
            label="Cumulative tokens over messages"
            accent="var(--metric-violet)"
            className="h-full w-full"
          />
        </div>
      </div>

      {topTools.length > 0 ? (
        <div>
          <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-[var(--muted-foreground)]">
            <Wrench className="size-3" />
            Tool usage ({overview.toolUsage.length} tools)
          </p>
          <div className="space-y-2">
            {topTools.map((t) => (
              <div key={t.tool} className="flex items-center gap-3">
                <p
                  className="w-28 shrink-0 truncate text-xs text-[var(--foreground)] sm:w-44"
                  title={t.tool}
                >
                  {t.tool}
                </p>
                <div className="h-2.5 flex-1 overflow-hidden bg-black/6">
                  <div
                    className="h-full"
                    style={{
                      width: `${Math.max((t.count / (topTools[0]?.count ?? 1)) * 100, 2)}%`,
                      background: TOKEN_COLORS.input,
                    }}
                  />
                </div>
                <p className="w-10 shrink-0 text-right text-xs font-semibold text-[var(--foreground)]">
                  {t.count}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DistributionTab({ error }: { error: string | null }) {
  const distribution = useAtomValue(messageDistributionAtom);

  if (error) {
    return <AnalyticsError message={error} />;
  }

  if (!distribution) {
    return <LoadingPlaceholder />;
  }

  const data = distribution.points.map((pt) => ({
    idx: pt.messageIndex,
    input: pt.tokens.input,
    output: pt.tokens.output,
    reasoning: pt.tokens.reasoning,
    cacheRead: pt.tokens.cacheRead,
    cacheWrite: pt.tokens.cacheWrite,
    role: pt.role,
  }));
  const maxTokens = Math.max(
    ...data.map((point) =>
      (["input", "output", "reasoning", "cacheRead", "cacheWrite"] as const).reduce(
        (total, key) => total + point[key],
        0,
      ),
    ),
    1,
  );

  return (
    <div>
      <p className="mb-3 text-xs font-semibold text-[var(--muted-foreground)]">
        Token breakdown per message
      </p>
      <div
        role="img"
        aria-label="Token breakdown per message"
        className="flex h-56 items-end gap-1 overflow-x-auto border border-[var(--border)] bg-[var(--chart-surface)] p-3 sm:h-64"
      >
        {data.map((point) => {
          const total =
            point.input + point.output + point.reasoning + point.cacheRead + point.cacheWrite;
          return (
            <div
              key={point.idx}
              className="flex h-full min-w-2 flex-1 items-end"
              title={`Message ${point.idx}: ${formatCompactNumber(total)} tokens`}
            >
              <div
                className="flex w-full flex-col-reverse"
                style={{ height: `${(total / maxTokens) * 100}%` }}
              >
                {(["input", "output", "reasoning", "cacheRead", "cacheWrite"] as const).map(
                  (key) => (
                    <span
                      key={key}
                      style={{
                        height: `${total > 0 ? (point[key] / total) * 100 : 0}%`,
                        background: TOKEN_COLORS[key],
                      }}
                    />
                  ),
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(["input", "output", "reasoning", "cacheRead", "cacheWrite"] as const).map((key) => (
          <div key={key} className="ui-pill-chip py-1.5">
            <span className="size-2.5 rounded-[2px]" style={{ background: TOKEN_COLORS[key] }} />
            <span className="capitalize">
              {key === "cacheRead" ? "Cache Read" : key === "cacheWrite" ? "Cache Write" : key}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LoadingPlaceholder() {
  return <div className="h-40 animate-pulse rounded-[18px] bg-[var(--panel-strong)]" />;
}

function AnalyticsError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-[18px] border border-[var(--destructive)]/30 bg-[var(--destructive)]/5 p-4 text-sm"
    >
      <p className="font-semibold text-[var(--foreground)]">Unable to load message analytics.</p>
      <p className="mt-1 text-[var(--muted-foreground)]">{message}</p>
    </div>
  );
}
