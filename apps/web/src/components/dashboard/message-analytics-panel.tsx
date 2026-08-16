import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import type { MessageOverviewPayload } from "@opencode-dashboard/shared";
import { Activity, MessageSquare, Waypoints, Wrench } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCompactNumber } from "@/lib/format";
import { buildSessionTrace } from "@/lib/session-trace";
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

const TraceViewer = lazy(() =>
  import("@/components/agent-prism/TraceViewer/TraceViewer").then((m) => ({
    default: m.TraceViewer,
  })),
);

interface MessageAnalyticsPanelProps {
  sessionId: string;
}

const DONUT_COLORS = [
  "var(--metric-violet)",
  "var(--metric-green)",
  "var(--metric-orange)",
  "var(--metric-amber)",
  "var(--metric-gold)",
  "var(--metric-teal)",
  "var(--chart)",
];

export function MessageAnalyticsPanel({ sessionId }: MessageAnalyticsPanelProps) {
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

      void fetchMessageAnalytics(sessionId)
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

    void fetchMessages(sessionId, 0)
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
      const result = await fetchMessages(sessionId, page);
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

  // Use a ref so the scroll-prefetch effect always reads the latest page
  // without re-subscribing the scroll listener between pages.
  const messagesPageRef = useRef(messagesPage);
  messagesPageRef.current = messagesPage;

  function handleLoadMore() {
    if (messagesLoading) return;
    void loadMessages(messagesPageRef.current + 1);
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
          <TabsTrigger value="trace" className="h-10 px-2 text-[11px] sm:text-xs">
            <Waypoints className="mr-1.5 hidden size-3 sm:inline" />
            Trace
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

        <TabsContent value="trace">
          <TraceTab messages={messages} loading={messagesLoading} total={messagesTotal} />
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

  if (overview.toolUsage.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">
        No tool activity in this session.
      </p>
    );
  }

  const totalCalls = overview.toolUsage.reduce((sum, tool) => sum + tool.count, 0);
  const initContext = overview.firstPromptContext ?? null;

  return (
    <div className="space-y-6">
      {initContext ? <InitialContextCard stat={initContext} /> : null}

      <div>
        <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-[var(--muted-foreground)]">
          <Wrench className="size-3" />
          Tool usage · {overview.toolUsage.length} tools · {formatCompactNumber(totalCalls)} calls
        </p>
        <div className="grid gap-6 rounded-[12px] border border-[var(--border)] bg-[var(--panel)] p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
          <ToolUsageDonut tools={overview.toolUsage} totalCalls={totalCalls} />
          <ul className="grid gap-1.5">
            {overview.toolUsage.map((tool, index) => {
              const share = totalCalls > 0 ? (tool.count / totalCalls) * 100 : 0;
              return (
                <li key={tool.tool} className="flex items-center gap-2.5 text-xs">
                  <span
                    className="size-2.5 shrink-0 rounded-[3px]"
                    style={{ background: DONUT_COLORS[index % DONUT_COLORS.length] }}
                  />
                  <p
                    className="min-w-0 flex-1 truncate font-mono text-[var(--foreground)]"
                    title={tool.tool}
                  >
                    {tool.tool}
                  </p>
                  <span
                    className="w-14 shrink-0 text-right font-mono tabular-nums text-[var(--muted-foreground)]"
                    title={`${tool.count} calls · ${tool.totalTokens} tokens`}
                  >
                    {formatCompactNumber(tool.totalTokens)}t
                  </span>
                  <span className="w-10 shrink-0 text-right font-mono font-semibold tabular-nums text-[var(--foreground)]">
                    {tool.count}
                  </span>
                  <span className="w-12 shrink-0 text-right font-mono tabular-nums text-[var(--muted-foreground)]">
                    {share.toFixed(1)}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

const SEGMENT_COLORS: Record<string, string> = {
  user: "var(--accent)",
  instructions: "var(--metric-violet)",
  environment: "var(--metric-teal)",
  other: "var(--metric-amber)",
};

function InitialContextCard({
  stat,
}: {
  stat: NonNullable<MessageOverviewPayload["firstPromptContext"]>;
}) {
  const hasWindow = stat.contextWindow > 0 && stat.ratio > 0;
  const percent = hasWindow ? Math.min(100, stat.ratio * 100) : 0;
  const hot = hasWindow && percent >= 60;
  const label = formatCompactNumber(stat.contextWindow);
  const segments = stat.segments ?? [];

  return (
    <div className="rounded-[12px] border border-[var(--border)] bg-[var(--panel)] p-5">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--muted-foreground)]">
          <Activity className="size-3" />
          Initial context at first user prompt
        </p>
        <p className="font-mono text-[11px] text-[var(--muted-foreground)]">
          {stat.modelId}
          {stat.providerId ? ` · ${stat.providerId}` : ""}
          {hasWindow ? " · window from runtime" : ""}
        </p>
      </div>
      <p className="mb-3 text-sm text-[var(--muted-foreground)]">
        Everything the model saw on its first call — system prompt, tool definitions, injected files
        (AGENTS.md, skills), and the prompt itself.
      </p>
      <div className="flex items-baseline justify-between font-mono text-xs">
        <p className="font-semibold tabular-nums text-[var(--foreground)]">
          {stat.promptTokens.toLocaleString("en-US")} tokens
        </p>
        {hasWindow ? (
          <p className="tabular-nums text-[var(--muted-foreground)]">
            {percent.toFixed(1)}% of {label} window
          </p>
        ) : (
          <p className="text-[var(--muted-foreground)]">
            window unknown — this runtime does not report it
          </p>
        )}
      </div>
      {hasWindow ? (
        <div
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
          aria-label="Initial context usage of model context window"
          className="mt-2 h-2.5 overflow-hidden rounded-full bg-[var(--panel-strong)]"
        >
          <div
            className="h-full rounded-full transition-[width]"
            style={{
              width: `${Math.max(percent, 0.8)}%`,
              background: hot
                ? "linear-gradient(90deg, var(--metric-amber), var(--danger))"
                : "linear-gradient(90deg, var(--metric-teal), var(--accent))",
            }}
          />
        </div>
      ) : null}
      {hot ? (
        <p className="mt-2 text-[11px] text-[var(--danger)]">
          High initialization overhead — more than {Math.round(percent)}% of the window is spent
          before the first response.
        </p>
      ) : null}
      {segments.length > 0 ? (
        <div className="mt-4 border-t border-[var(--border)] pt-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
            Where it came from <span className="normal-case">(estimated)</span>
          </p>
          <ul className="grid gap-1.5">
            {segments.map((segment) => (
              <li key={segment.kind} className="flex items-center gap-2.5 text-xs">
                <span
                  className="size-2.5 shrink-0 rounded-[3px]"
                  style={{ background: SEGMENT_COLORS[segment.kind] ?? SEGMENT_COLORS.other }}
                />
                <p
                  className="min-w-0 flex-1 truncate text-[var(--foreground)]"
                  title={segment.label}
                >
                  {segment.label}
                </p>
                <span className="shrink-0 font-mono tabular-nums text-[var(--foreground)]">
                  {formatCompactNumber(segment.tokens)}t
                </span>
                <span className="w-12 shrink-0 text-right font-mono tabular-nums text-[var(--muted-foreground)]">
                  {stat.promptTokens > 0
                    ? `${((segment.tokens / stat.promptTokens) * 100).toFixed(0)}%`
                    : "-"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ToolUsageDonut({
  tools,
  totalCalls,
}: {
  tools: { tool: string; count: number }[];
  totalCalls: number;
}) {
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div
      role="img"
      aria-label={`Tool usage distribution across ${tools.length} tools, ${totalCalls} total calls`}
      className="relative mx-auto size-40 shrink-0"
    >
      <svg viewBox="0 0 140 140" className="size-full -rotate-90">
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="var(--panel-strong)"
          strokeWidth="16"
        />
        {tools.map((tool, index) => {
          const fraction = totalCalls > 0 ? tool.count / totalCalls : 0;
          const length = fraction * circumference;
          const dashOffset = offset;
          offset += length;
          if (length <= 0) return null;
          return (
            <circle
              key={tool.tool}
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke={DONUT_COLORS[index % DONUT_COLORS.length]}
              strokeWidth="16"
              strokeDasharray={`${Math.max(length - 1.5, 0.5)} ${circumference}`}
              strokeDashoffset={-dashOffset}
              strokeLinecap="butt"
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-2xl font-semibold tabular-nums tracking-[-0.03em] text-[var(--foreground)]">
            {formatCompactNumber(totalCalls)}
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
            calls
          </p>
        </div>
      </div>
    </div>
  );
}

function TraceTab({
  messages,
  loading,
  total,
}: {
  messages: ReturnType<typeof useAtomValue<typeof messagesAtom>>;
  loading: boolean;
  total: number;
}) {
  const trace = messages.length > 0 ? buildSessionTrace(messages) : null;

  if (loading && messages.length === 0) {
    return <LoadingPlaceholder />;
  }

  if (!trace) {
    return (
      <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">
        No messages to trace yet.
      </p>
    );
  }

  const partial = messages.length < total;

  return (
    <div>
      {partial ? (
        <p className="mb-3 text-xs text-[var(--muted-foreground)]">
          Showing the first {messages.length} of {total} messages. Scroll the transcript to load
          more, then return here for the full trace.
        </p>
      ) : null}
      <div className="overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--agentprism-background)]">
        <Suspense
          fallback={<div className="h-64 animate-pulse rounded-[12px] bg-[var(--panel-strong)]" />}
        >
          <TraceViewer data={[{ traceRecord: trace.record, spans: trace.spans }]} />
        </Suspense>
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
