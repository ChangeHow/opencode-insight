import { useEffect } from "react";
import { useAtom, useAtomValue } from "jotai";
import {
  CartesianGrid,
  Line,
  LineChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, BarChart2, MessageSquare, Wrench } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCompactNumber } from "@/lib/format";
import {
  messageDistributionAtom,
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

const TOKEN_COLORS = {
  input: "var(--metric-violet)",
  output: "var(--metric-orange)",
  reasoning: "var(--metric-gold)",
  cacheRead: "var(--metric-green)",
  cacheWrite: "var(--metric-teal, var(--metric-green))",
};

interface MessageAnalyticsPanelProps {
  date: string;
  sessionId: string;
}

export function MessageAnalyticsPanel({ date, sessionId }: MessageAnalyticsPanelProps) {
  const [overview, setOverview] = useAtom(messageOverviewAtom);
  const [distribution, setDistribution] = useAtom(messageDistributionAtom);
  const [messages, setMessages] = useAtom(messagesAtom);
  const [messagesTotal, setMessagesTotal] = useAtom(messagesTotalAtom);
  const [messagesPage, setMessagesPage] = useAtom(messagesPageAtom);
  const [messagesLoading, setMessagesLoading] = useAtom(messagesLoadingAtom);

  // Load overview + distribution on mount, using session-level cache
  useEffect(() => {
    let canceled = false;

    const cached = getMessageSessionCache(sessionId);
    if (cached) {
      setOverview(cached.overview);
      setDistribution(cached.distribution);
      return;
    }

    setOverview(null);
    setDistribution(null);
    setMessages([]);
    setMessagesTotal(0);
    setMessagesPage(0);

    void fetchMessageAnalytics(date, sessionId)
      .then(({ overview: ov, distribution: dist }) => {
        if (!canceled) {
          setOverview(ov);
          setDistribution(dist);
          setMessageSessionCache(sessionId, ov, dist);
        }
      })
      .catch(() => {
        /* silently ignore */
      });

    return () => {
      canceled = true;
    };
  }, [date, sessionId]);

  async function loadMessages(page: number) {
    setMessagesLoading(true);
    try {
      const result = await fetchMessages(date, sessionId, page);
      setMessages((prev) => (page === 0 ? result.messages : [...prev, ...result.messages]));
      setMessagesTotal(result.total);
      setMessagesPage(page);
    } catch {
      // silently ignore
    } finally {
      setMessagesLoading(false);
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
    <div className="mx-auto w-full max-w-[54rem] rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-5 sm:p-6">
      <div className="mb-5 space-y-2">
        <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
          <Activity className="size-3.5" />
          Message analytics
        </p>
        <h3 className="text-xl font-semibold text-[var(--foreground)]">Session breakdown</h3>
      </div>

      <Tabs defaultValue="overview" onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview" className="h-10 px-2 text-[11px] sm:text-xs">
            <Activity className="mr-1.5 hidden size-3 sm:inline" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="distribution" className="h-10 px-2 text-[11px] sm:text-xs">
            <BarChart2 className="mr-1.5 hidden size-3 sm:inline" />
            Token Distribution
          </TabsTrigger>
          <TabsTrigger value="messages" className="h-10 px-2 text-[11px] sm:text-xs">
            <MessageSquare className="mr-1.5 hidden size-3 sm:inline" />
            Messages
            {overview ? (
              <span className="ml-1.5 rounded-full bg-[var(--panel-strong)] px-1.5 py-0.5 text-[10px]">
                {overview.totalMessages}
              </span>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab />
        </TabsContent>

        <TabsContent value="distribution">
          <DistributionTab />
        </TabsContent>

        <TabsContent value="messages">
          <MessageList
            messages={messages}
            total={messagesTotal}
            loading={messagesLoading}
            onLoadMore={handleLoadMore}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OverviewTab() {
  const overview = useAtomValue(messageOverviewAtom);

  if (!overview) {
    return <LoadingPlaceholder />;
  }

  const timelineData = overview.timeline.map((pt) => ({
    idx: pt.messageIndex,
    cumulativeTokens: pt.cumulativeTokens,
    role: pt.role,
  }));

  const topTools = overview.toolUsage.slice(0, 10);

  return (
    <div className="space-y-6">
      {/* Timeline chart */}
      <div>
        <p className="mb-3 text-xs font-semibold text-[var(--muted-foreground)]">
          Cumulative tokens over messages
        </p>
        <div className="h-44 sm:h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timelineData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="idx"
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                label={{
                  value: "Message #",
                  position: "insideBottom",
                  offset: -2,
                  fontSize: 10,
                  fill: "var(--muted-foreground)",
                }}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickFormatter={(v: number) => formatCompactNumber(v)}
              />
              <Tooltip
                formatter={
                  ((value: number) => [formatCompactNumber(value), "Cumulative tokens"]) as any
                }
                labelFormatter={((label: number) => `Message #${label}`) as any}
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 12,
                  background: "var(--panel)",
                  border: "1px solid var(--border)",
                }}
              />
              <Line
                type="monotone"
                dataKey="cumulativeTokens"
                stroke="var(--metric-violet)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tool usage */}
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
                <div className="flex-1 h-2.5 overflow-hidden rounded-full bg-black/6">
                  <div
                    className="h-full rounded-full"
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

function DistributionTab() {
  const distribution = useAtomValue(messageDistributionAtom);

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

  return (
    <div>
      <p className="mb-3 text-xs font-semibold text-[var(--muted-foreground)]">
        Token breakdown per message
      </p>
      <div className="h-56 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="idx" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickFormatter={(v: number) => formatCompactNumber(v)}
            />
            <Tooltip
              formatter={
                ((value: number, name: string) => [formatCompactNumber(value), name]) as any
              }
              labelFormatter={((label: number) => `Message #${label}`) as any}
              contentStyle={{
                fontSize: 12,
                borderRadius: 12,
                background: "var(--panel)",
                border: "1px solid var(--border)",
              }}
            />
            <Bar dataKey="input" stackId="a" fill={TOKEN_COLORS.input} name="Input" />
            <Bar dataKey="output" stackId="a" fill={TOKEN_COLORS.output} name="Output" />
            <Bar dataKey="reasoning" stackId="a" fill={TOKEN_COLORS.reasoning} name="Reasoning" />
            <Bar dataKey="cacheRead" stackId="a" fill={TOKEN_COLORS.cacheRead} name="Cache Read" />
            <Bar
              dataKey="cacheWrite"
              stackId="a"
              fill={TOKEN_COLORS.cacheWrite}
              name="Cache Write"
              radius={[3, 3, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(["input", "output", "reasoning", "cacheRead", "cacheWrite"] as const).map((key) => (
          <div key={key} className="ui-pill-chip py-1.5">
            <span className="size-2.5 rounded-full" style={{ background: TOKEN_COLORS[key] }} />
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
