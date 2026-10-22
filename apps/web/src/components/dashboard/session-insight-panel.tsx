import type { SessionInsightQueryPayload } from "@opencode-dashboard/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SessionInsightContext } from "./session-insight-context";
import { SessionInsightChart } from "./session-insight-chart";
import { SessionInsightTiming } from "./session-insight-timing";

export interface SessionInsightPanelProps {
  sessionId: string;
  data?: SessionInsightQueryPayload;
  loading: boolean;
  error?: string;
  onRetry: () => void;
}

export function SessionInsightPanel({
  sessionId,
  data,
  loading,
  error,
  onRetry,
}: SessionInsightPanelProps) {
  const summary = data?.overview.data.summary;
  const hasUsage = summary?.hasUsage;
  return (
    <Card className="min-w-0 w-full" aria-label="Context & speed insight" aria-busy={loading}>
      <CardContent className="min-w-0 space-y-5 p-4 sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Session insight</h2>
          <span
            className="max-w-full truncate text-xs text-[var(--muted-foreground)]"
            title={sessionId}
          >
            Session {sessionId}
          </span>
          {summary?.capturePartial && (
            <span
              role="status"
              title="Some requests or reported usage are missing; captured data only."
              className="rounded-full bg-[var(--panel-strong)] px-2 py-1 text-xs text-[var(--muted-foreground)]"
            >
              Partial capture
            </span>
          )}
        </header>
        {loading && (
          <p role="status" className="text-sm">
            {data ? "Refreshing insight; showing retained snapshot." : "Loading session insight…"}
          </p>
        )}
        {error && (
          <div role="alert" className="space-y-2 text-sm [overflow-wrap:anywhere]">
            <p>{error}</p>
            {data && <p>Showing retained snapshot; data may be stale.</p>}
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry insight
            </Button>
          </div>
        )}
        {!data && !loading && !error && (
          <p className="text-sm text-[var(--muted-foreground)]">
            No captured insight for this session.
          </p>
        )}
        {data && summary && (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                [
                  "Estimated context",
                  data.overview.data.tokens.current.groups.length
                    ? data.overview.data.tokens.current.total.toLocaleString()
                    : "Unavailable",
                ],
                ["Reported input", hasUsage ? summary.usage.input.toLocaleString() : "Unavailable"],
                [
                  "Reported output",
                  hasUsage ? summary.usage.output.toLocaleString() : "Unavailable",
                ],
                [
                  "Mean speed · reported",
                  summary.tps === undefined ? "Unavailable" : `${summary.tps.toFixed(2)} tok/s`,
                ],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 rounded-[8px] bg-[var(--panel-strong)] p-3">
                  <dt className="text-xs text-[var(--muted-foreground)]">{label}</dt>
                  <dd className="mt-1 break-words text-base font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            <Tabs defaultValue="speed">
              <TabsList aria-label="Insight view" className="w-full">
                <TabsTrigger value="speed" className="flex-1">
                  Speed
                </TabsTrigger>
                <TabsTrigger value="token" className="flex-1">
                  Token
                </TabsTrigger>
                <TabsTrigger value="time" className="flex-1">
                  Time
                </TabsTrigger>
              </TabsList>
              <TabsContent value="speed">
                <SessionInsightChart series={data.series} />
              </TabsContent>
              <TabsContent value="token">
                <SessionInsightContext
                  sessionId={sessionId}
                  revision={data.overview.revision}
                  current={data.overview.data.tokens.current}
                  cumulative={data.overview.data.tokens.cumulative}
                  usage={hasUsage ? summary.usage : undefined}
                />
              </TabsContent>
              <TabsContent value="time">
                <SessionInsightTiming
                  sessionId={sessionId}
                  revision={data.overview.revision}
                  overview={data.overview.data}
                />
              </TabsContent>
            </Tabs>
          </>
        )}
      </CardContent>
    </Card>
  );
}
