import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DayBreakdownPanel } from "@/components/dashboard/day-breakdown";
import { Heatmap } from "@/components/dashboard/heatmap";
import { MetricCard } from "@/components/dashboard/metric-card";
import { RangePicker } from "@/components/dashboard/range-picker";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { detailLoadingAtom, errorAtom, heatmapAtom, loadingAtom, rangeAtom, refreshTickAtom, selectedDateAtom, summaryAtom, trendAtom, dayAtom } from "@/lib/atoms";
import { refreshSnapshot } from "@/lib/api";
import { formatCompactNumber, formatCurrency, formatDateLabel } from "@/lib/format";
import { useDashboardData } from "@/lib/use-dashboard-data";

export function DashboardPage() {
  useDashboardData();

  const [range, setRange] = useAtom(rangeAtom);
  const [selectedDate, setSelectedDate] = useAtom(selectedDateAtom);
  const summary = useAtomValue(summaryAtom);
  const heatmap = useAtomValue(heatmapAtom);
  const trend = useAtomValue(trendAtom);
  const day = useAtomValue(dayAtom);
  const loading = useAtomValue(loadingAtom);
  const detailLoading = useAtomValue(detailLoadingAtom);
  const error = useAtomValue(errorAtom);
  const bumpRefresh = useSetAtom(refreshTickAtom);

  async function handleRefresh() {
    await refreshSnapshot();
    bumpRefresh((current) => current + 1);
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <section className="relative overflow-hidden border-b border-[var(--border)]">
        <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top_left,_rgba(202,141,92,0.28),_transparent_48%),radial-gradient(circle_at_top_right,_rgba(78,107,138,0.15),_transparent_36%)]" />
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-12 sm:px-8 lg:grid-cols-[1.2fr_0.8fr] lg:py-20">
          <div className="relative">
            <Badge>OpenCode ledger</Badge>
            <h1 className="mt-5 max-w-3xl font-[Newsreader_Variable] text-5xl leading-[0.95] tracking-[-0.03em] sm:text-7xl">
              Your token trail, arranged like a quiet newsroom spread.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-[var(--muted-foreground)] sm:text-lg">
              A local-first front page for OpenCode usage: streaks, spend, heat, and the model mix behind each working day.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <RangePicker value={range} onChange={setRange} />
              <Button variant="outline" onClick={() => void handleRefresh()}>
                <RefreshCcw className="size-4" />
                Refresh scan
              </Button>
            </div>
          </div>
          <Card className="relative self-start bg-[linear-gradient(180deg,rgba(255,250,244,0.98),rgba(248,241,231,0.98))]">
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted-foreground)]">Current range</p>
                  <p className="mt-2 font-[Newsreader_Variable] text-3xl">{range}</p>
                </div>
                <div className="text-right text-sm text-[var(--muted-foreground)]">
                  <p>Source</p>
                  <p className="mt-1 font-semibold text-[var(--foreground)]">{summary?.source.kind ?? "..."}</p>
                </div>
              </div>
              <div className="space-y-3 text-sm leading-7 text-[var(--muted-foreground)]">
                <p>Latest scan</p>
                <p className="font-semibold text-[var(--foreground)]">
                  {summary ? new Date(summary.scannedAt).toLocaleString("en-US") : "Loading..."}
                </p>
                <p className="pt-3 text-xs uppercase tracking-[0.18em]">Paths</p>
                <div className="space-y-2 text-xs leading-6">
                  {summary?.source.paths.length ? summary.source.paths.map((item) => <p key={item}>{item}</p>) : <p>No local OpenCode data detected yet.</p>}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-7xl space-y-8 px-6 py-10 sm:px-8 lg:py-14">
        {error ? (
          <div className="rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-6 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            eyebrow="Total tokens"
            value={summary ? formatCompactNumber(summary.totalTokens) : "—"}
            detail={summary ? `${summary.activeDays} active days in view.` : "Waiting for local data."}
          />
          <MetricCard
            eyebrow="Estimated cost"
            value={summary ? formatCurrency(summary.totalCost) : "—"}
            detail={summary?.bestDay ? `Peak day ${formatDateLabel(summary.bestDay.date)}.` : "No priced messages yet."}
          />
          <MetricCard
            eyebrow="Longest streak"
            value={summary ? `${summary.longestStreak}d` : "—"}
            detail={summary ? `Current streak ${summary.currentStreak} days.` : "Build a cadence to see streaks."}
          />
          <MetricCard
            eyebrow="Top model"
            value={summary?.topModel?.modelId ?? "—"}
            detail={summary?.topModel ? `${formatCompactNumber(summary.topModel.tokens)} tokens in this range.` : "No model usage yet."}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <Card>
            <CardContent className="p-6 sm:p-8">
              {loading ? (
                <div className="grid grid-cols-7 gap-2">
                  {Array.from({ length: 28 }).map((_, index) => (
                    <div key={index} className="aspect-square animate-pulse rounded-[18px] bg-black/5" />
                  ))}
                </div>
              ) : (
                <Heatmap days={heatmap} selectedDate={selectedDate} onSelect={setSelectedDate} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 sm:p-8">
              {loading ? (
                <div className="h-72 animate-pulse rounded-[24px] bg-black/5" />
              ) : (
                <TrendChart data={trend} />
              )}
            </CardContent>
          </Card>
        </div>

        <DayBreakdownPanel day={day} loading={detailLoading} />
      </section>
    </main>
  );
}
