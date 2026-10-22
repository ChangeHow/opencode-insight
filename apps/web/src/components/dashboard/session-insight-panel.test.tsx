import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, within, cleanup } from "@testing-library/react";
import {
  summarizeSession,
  tokenBreakdown,
  phaseBreakdown,
  type SessionInsightQueryPayload,
  type InsightSeries,
  type SessionInsight,
} from "@opencode-dashboard/shared";
import { SessionInsightPanel as CompactPanel } from "./session-insight-panel";
import { fetchSessionInsightSources, fetchSessionInsightTools } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  fetchSessionInsightSources: vi.fn(),
  fetchSessionInsightTools: vi.fn(),
}));

// The UI receives only bounded query responses, never this legacy fixture's arrays.
function compact(data: {
  session: SessionInsight;
  series: InsightSeries;
}): SessionInsightQueryPayload {
  const { session, series } = data;
  const { currentContext, cumulativeContext, ...summary } = summarizeSession(session);
  const composition = (sources: typeof currentContext) => ({
    total: sources.reduce((sum, source) => sum + source.tokens, 0),
    reported: sources.every((source) => source.quality === "reported"),
    groups: tokenBreakdown(sources).map(({ kind, label, tokens, share }) => ({
      kind,
      label,
      tokens,
      share,
    })),
  });
  const running = session.requests.some((request) => request.status === "running");
  const end = running
    ? Date.now()
    : Math.max(
        ...session.requests.map((request) => request.endedAt ?? request.startedAt),
        ...series.points.map((point) => point.at),
      );
  const start = Math.max(
    end - 600000,
    Math.min(...session.requests.map((request) => request.startedAt), end - 1000),
  );
  const identity = {
    sessionID: session.sessionID,
    directory: session.directory,
    revision: session.revision,
  };
  return {
    overview: {
      ...identity,
      unchanged: false,
      data: {
        updatedAt: session.updatedAt,
        measuredAt: Date.now(),
        hasActivity: true,
        running,
        summary: {
          ...summary,
          hasUsage: session.requests.some((request) => request.usage !== undefined),
          hasCost: session.requests.some((request) => request.cost !== undefined),
        },
        tokens: {
          current: composition(currentContext),
          cumulative: composition(cumulativeContext),
        },
        phases: phaseBreakdown(session),
        trace: {
          start,
          end,
          measuredAt: Date.now(),
          running,
          summary: {
            requestCount: session.requests.length,
            toolCount: session.tools.length,
            errorCount: 0,
            unknownCount: 0,
            partialUsage: false,
            partialCost: false,
          },
          groups: [],
        },
      },
    },
    series: {
      ...identity,
      start,
      end,
      running,
      points: series.points.filter((point) => point.at >= start && point.at <= end),
      requests: session.requests.map(({ context: _context, buckets, ...request }) => ({
        ...request,
        captured: buckets.length > 0,
      })),
      channels: {
        reasoning: session.requests.some((request) =>
          request.buckets.some((bucket) => bucket.reasoning > 0),
        ),
        summary: session.requests.some((request) =>
          request.buckets.some((bucket) => bucket.summary > 0),
        ),
      },
    },
  };
}

function SessionInsightPanel({
  data,
  ...props
}: Omit<React.ComponentProps<typeof CompactPanel>, "data"> & {
  data?: ReturnType<typeof makeData>;
}) {
  if (data) {
    const identity = {
      sessionID: data.session.sessionID,
      directory: data.session.directory,
      revision: data.session.revision,
    };
    vi.mocked(fetchSessionInsightSources).mockImplementation(async (_id, scope, options) => {
      const summary = summarizeSession(data.session);
      const sources = scope === "current" ? summary.currentContext : summary.cumulativeContext;
      const entries = options?.kind
        ? sources.filter((source) => source.kind === options.kind)
        : sources;
      return {
        ...identity,
        scope,
        entries: entries.slice(0, 50),
        total: entries.length,
        reset: false,
      };
    });
    vi.mocked(fetchSessionInsightTools).mockResolvedValue({
      ...identity,
      total: data.session.tools.length,
      entries: data.session.tools.slice(0, 20),
      reset: false,
    });
  }
  return <CompactPanel {...props} data={data ? compact(data) : undefined} />;
}

const makeData = (): { session: SessionInsight; series: InsightSeries } => ({
  session: {
    version: 1,
    sessionID: "session-1",
    directory: "/project",
    updatedAt: 5000,
    revision: 1,
    interruptedCapture: false,
    requests: [
      {
        id: "request-1",
        model: "model-a",
        startedAt: 1000,
        firstDeltaAt: 1500,
        streamedAt: 5000,
        endedAt: 6000,
        status: "completed",
        reasoningMode: "visible",
        capture: "live",
        usage: { input: 100, output: 12, reasoning: 8, cacheRead: 30, cacheWrite: 4 },
        context: [
          { kind: "skill", id: "skill-a", label: "Debugging", tokens: 7, quality: "estimated" },
          { kind: "tool", id: "tool-a", label: "shell", tokens: 3, quality: "estimated" },
        ],
        buckets: [
          { at: 1000, output: 2, reasoning: 1, summary: 4 },
          { at: 2000, output: 6, reasoning: 2, summary: 0 },
        ],
      },
    ],
    tools: [
      {
        id: "tool-1",
        name: "shell",
        startedAt: 3000,
        endedAt: 6000,
        status: "completed",
        background: false,
      },
      {
        id: "tool-2",
        name: "search",
        startedAt: 4000,
        endedAt: 7000,
        status: "completed",
        background: true,
      },
    ],
  },
  series: {
    revision: 1,
    unchanged: false,
    points: [
      {
        at: 1000,
        requestID: "request-1",
        model: "model-a",
        outputTps: 2,
        reasoningTps: 1,
        summaryTps: 4,
        requestTps: 5,
        quality: "estimated",
      },
      {
        at: 2000,
        requestID: "request-1",
        model: "model-a",
        outputTps: 4,
        reasoningTps: 1.5,
        summaryTps: 2,
        requestTps: 5,
        quality: "estimated",
      },
    ],
  },
});

const props = { sessionId: "session-1", loading: false, onRetry: vi.fn() };

function openTab(name: string) {
  const tab = screen.getByRole("tab", { name });
  fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
  fireEvent.click(tab);
}

function addSample(data: ReturnType<typeof makeData>, at: number) {
  data.session.requests[0].buckets.push({ at, output: 9, reasoning: 0, summary: 0 });
  data.series.points.push({ ...data.series.points[1], at, outputTps: 9 });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(fetchSessionInsightSources).mockReset();
  vi.mocked(fetchSessionInsightTools).mockReset();
});

describe("SessionInsightPanel", () => {
  test("renders loading, empty, retry and retained partial snapshots", () => {
    const onRetry = vi.fn();
    const { rerender } = render(<SessionInsightPanel {...props} loading onRetry={onRetry} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading session insight");
    rerender(<SessionInsightPanel {...props} />);
    expect(screen.getByText(/No captured insight for this session/)).toBeInTheDocument();
    rerender(<SessionInsightPanel {...props} error="Network unavailable" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Network unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry insight" }));
    expect(onRetry).toHaveBeenCalledOnce();
    const data = makeData();
    data.session.interruptedCapture = true;
    rerender(<SessionInsightPanel {...props} data={data} loading error="Refresh failed" />);
    expect(screen.getByText(/data may be stale/)).toBeInTheDocument();
    expect(screen.getByText(/Refreshing insight/)).toBeInTheDocument();
    expect(screen.getByText("Partial capture")).toHaveAttribute(
      "title",
      expect.stringContaining("captured data only"),
    );
  });

  test("shows four metrics and one chart view at a time without a bottom range", () => {
    const { container } = render(<SessionInsightPanel {...props} data={makeData()} />);
    expect(container.querySelectorAll("dl").item(0).children).toHaveLength(4);
    expect(screen.getByRole("tab", { name: "Speed" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("region", { name: "Context sources" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Time accounting" })).not.toBeInTheDocument();
    expect(container.querySelector('input[type="range"]')).toBeNull();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("separates reported usage from estimates and collapses source IDs", async () => {
    const data = makeData();
    data.session.requests.unshift({
      ...data.session.requests[0],
      id: "request-0",
      usage: undefined,
      context: [
        { kind: "skill", id: "skill-a", label: "Debugging", tokens: 13, quality: "estimated" },
      ],
    });
    render(<SessionInsightPanel {...props} data={data} />);
    expect(screen.getByText("Reported input").parentElement).toHaveTextContent("100");
    expect(screen.getByText("Estimated context").parentElement).toHaveTextContent("10");
    openTab("Token");
    const sources = screen.getByRole("region", { name: "Context sources" });
    expect(
      within(sources).getByRole("img", { name: "current estimated context: 10 tokens" }),
    ).toBeInTheDocument();
    expect(
      within(sources).getByRole("img", { name: "Reported usage: 154 tokens" }),
    ).toBeInTheDocument();
    expect(within(sources).getByText("70.0%")).toBeInTheDocument();
    expect(fetchSessionInsightSources).not.toHaveBeenCalled();
    const details = within(sources).getByText("Source details").parentElement!;
    expect(details).not.toHaveAttribute("open");
    fireEvent.click(within(sources).getByText("Source details"));
    expect(details).toHaveAttribute("open");
    await within(details).findByText("shell");
    expect(details).toHaveTextContent("skill-a");
    expect(within(details).getByText("shell")).toBeInTheDocument();
    fireEvent.click(within(sources).getByRole("button", { name: "Cumulative" }));
    expect(within(sources).getByRole("button", { name: "Cumulative" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      within(sources).getByRole("img", { name: "cumulative estimated context: 23 tokens" }),
    ).toBeInTheDocument();
  });

  test("does not fabricate historical speed or report absent usage as zero", () => {
    const data = makeData();
    data.session.requests[0].buckets = [];
    data.session.requests[0].usage = undefined;
    render(<SessionInsightPanel {...props} data={data} />);
    expect(screen.getByText("No captured speed in this window.")).toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.getByText("Reported input").parentElement).toHaveTextContent("Unavailable");
    openTab("Token");
    expect(screen.queryByRole("img", { name: /Reported usage:/ })).not.toBeInTheDocument();
  });

  test("shows exclusive foreground phase totals and keeps background separate", () => {
    render(<SessionInsightPanel {...props} data={makeData()} />);
    openTab("Time");
    const timing = screen.getByRole("region", { name: "Time accounting" });
    expect(within(timing).getByText("5.00 s")).toBeInTheDocument();
    expect(within(timing).getByText("Background · 3.00 s")).toBeInTheDocument();
    const bar = within(timing).getByRole("group", { name: "Exclusive foreground phases" });
    const phases = within(bar).getAllByRole("button");
    const total = phases.reduce(
      (sum, phase) => sum + Number(phase.style.width.replace("%", "")),
      0,
    );
    expect(total).toBeCloseTo(100);
    expect(within(timing).queryByRole("status")).not.toBeInTheDocument();
    fireEvent.focus(phases[0]);
    expect(within(timing).getByRole("status")).toHaveTextContent(/activities/);
    fireEvent.pointerEnter(phases.at(-1)!);
    expect(phases.at(-1)).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(phases[0]);
    expect(phases[0]).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText(/thinking/i)).not.toBeInTheDocument();
  });

  test("shows rolling rates and reported means only on chart interaction", () => {
    render(<SessionInsightPanel {...props} data={makeData()} />);
    const slider = screen.getByRole("slider", { name: "Speed time cursor" });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.keyDown(slider, { key: "Home" });
    let tooltip = screen.getByRole("status");
    expect(within(tooltip).getByText("Output · 5s").parentElement).toHaveTextContent("2.00 tok/s");
    expect(within(tooltip).getByText("Request mean · reported").parentElement).toHaveTextContent(
      "5.00 tok/s",
    );
    expect(tooltip).toHaveTextContent("First response: 0.50 s");
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(slider).toHaveAttribute("aria-valuenow", "1");
    tooltip = screen.getByRole("status");
    expect(within(tooltip).getByText("Output · 5s").parentElement).toHaveTextContent("4.00 tok/s");
    expect(within(tooltip).getByText("Reasoning · 5s").parentElement).toHaveTextContent(
      "1.50 tok/s",
    );
    expect(tooltip).toHaveTextContent("completed · estimated");
    vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({ left: 0, width: 600 } as DOMRect);
    // jsdom lacks PointerEvent; MouseEvent preserves pointer coordinates.
    fireEvent(slider, new MouseEvent("pointermove", { bubbles: true, clientX: 35 }));
    expect(slider).toHaveAttribute("aria-valuenow", "0");
    fireEvent(slider, new MouseEvent("pointerdown", { bubbles: true, clientX: 565 }));
    expect(slider).toHaveAttribute("aria-valuenow", "1");
    fireEvent.keyDown(slider, { key: "Escape" });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("keeps repeated tool sources distinct without duplicate keys", async () => {
    const data = makeData();
    data.session.requests[0].context.push({
      kind: "tool",
      id: "tool-a",
      label: "shell",
      tokens: 11,
      quality: "estimated",
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<SessionInsightPanel {...props} data={data} />);
    openTab("Token");
    const details = screen.getByText("Source details").parentElement!;
    fireEvent.click(screen.getByText("Source details"));
    expect(await within(details).findAllByText("shell")).toHaveLength(2);
    expect(
      errors.mock.calls.filter(([message]) => String(message).includes("same key")),
    ).toHaveLength(0);
  });

  test("follows new samples until inspected and resumes after Escape", () => {
    const data = makeData();
    const { rerender } = render(<SessionInsightPanel {...props} data={data} />);
    const slider = screen.getByRole("slider", { name: "Speed time cursor" });
    expect(slider).toHaveAttribute("aria-valuenow", "1");
    const next = structuredClone(data);
    addSample(next, 3000);
    rerender(<SessionInsightPanel {...props} data={next} />);
    expect(slider).toHaveAttribute("aria-valuenow", "2");
    fireEvent.keyDown(slider, { key: "Home" });
    const later = structuredClone(next);
    addSample(later, 4000);
    rerender(<SessionInsightPanel {...props} data={later} />);
    expect(slider).toHaveAttribute("aria-valuenow", "0");
    fireEvent.keyDown(slider, { key: "Escape" });
    expect(slider).toHaveAttribute("aria-valuenow", "3");
  });

  test("splits speed paths at gaps and request boundaries and omits unobserved tracks", () => {
    const data = makeData();
    data.session.requests[0].buckets.forEach((bucket) => {
      bucket.reasoning = 0;
      bucket.summary = 0;
    });
    addSample(data, 4000);
    data.session.requests.push({
      ...data.session.requests[0],
      id: "request-2",
      buckets: [{ at: 5000, output: 3, reasoning: 0, summary: 0 }],
    });
    data.series.points.push({ ...data.series.points[0], at: 5000, requestID: "request-2" });
    const { container } = render(<SessionInsightPanel {...props} data={data} />);
    expect(container.querySelectorAll('[data-track="outputTps"] polyline')).toHaveLength(3);
    expect(screen.queryByText("Reasoning · 5s")).not.toBeInTheDocument();
    expect(screen.queryByText("Summary · 5s")).not.toBeInTheDocument();
  });

  test("keeps every parallel sample in the completed ten-minute window", () => {
    const data = makeData();
    const owner = data.session.requests[0];
    data.session.requests = ["request-1", "request-2"].map((id) => ({
      ...owner,
      id,
      endedAt: 601000,
      streamedAt: 601000,
      buckets: Array.from({ length: 601 }, (_, index) => ({
        at: 1000 + index * 1000,
        output: 1,
        reasoning: 0,
        summary: 0,
      })),
    }));
    data.series.points = data.session.requests.flatMap((request) =>
      request.buckets.map((bucket) => ({
        ...data.series.points[0],
        requestID: request.id,
        at: bucket.at,
      })),
    );
    const { container } = render(<SessionInsightPanel {...props} data={data} />);
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuemax", "1201");
    expect(container.querySelectorAll('[data-track="outputTps"] polyline')).toHaveLength(2);
    expect(screen.getByText("Final window · last 10 min")).toBeInTheDocument();
  });

  test("retains supplied rolling decay samples even when no new delta arrived in that bucket", () => {
    const data = makeData();
    data.series.points.push({ ...data.series.points[1], at: 3000, outputTps: 3 });
    render(<SessionInsightPanel {...props} data={data} />);
    const chart = screen.getByRole("slider");
    expect(chart).toHaveAttribute("aria-valuemax", "2");
    fireEvent.keyDown(chart, { key: "End" });
    expect(
      within(screen.getByRole("status")).getByText("Output · 5s").parentElement,
    ).toHaveTextContent("3.00 tok/s");
  });

  test("tiny tool phases stay proportional and can be inspected through their legend", () => {
    const data = makeData();
    data.session.tools = [{ ...data.session.tools[0], startedAt: 5000, endedAt: 5006 }];
    render(<SessionInsightPanel {...props} data={data} />);
    openTab("Time");
    const bar = screen.getByRole("group", { name: "Exclusive foreground phases" });
    const segment = within(bar).getByRole("button", { name: /Tool execution/ });
    expect(parseFloat(segment.style.width)).toBeLessThan(0.2);
    expect(segment).toHaveClass("min-w-0");
    fireEvent.focus(screen.getByRole("button", { name: "Tool execution phase details" }));
    expect(screen.getByRole("status")).toHaveTextContent("6 ms");
    fireEvent.keyDown(screen.getByRole("button", { name: "Tool execution phase details" }), {
      key: "Escape",
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("advances the live window even with an unchanged revision", () => {
    vi.useFakeTimers();
    vi.setSystemTime(2000);
    const data = makeData();
    Object.assign(data.session.requests[0], {
      status: "running",
      endedAt: undefined,
      streamedAt: undefined,
    });
    render(<SessionInsightPanel {...props} data={data} />);
    expect(screen.getByRole("slider")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(601000));
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.getByText("No captured speed in this window.")).toBeInTheDocument();
  });

  test("refreshes expanded sources on a new overview without resetting their page", async () => {
    const data = compact(makeData());
    const identity = {
      sessionID: "session-1",
      directory: "/project",
      revision: 1,
      scope: "current" as const,
      total: 100,
      reset: false,
    };
    const source = {
      kind: "skill" as const,
      id: "later-source",
      label: "Later source",
      tokens: 7,
      quality: "estimated" as const,
    };
    vi.mocked(fetchSessionInsightSources)
      .mockResolvedValueOnce({
        ...identity,
        entries: [{ ...source, id: "first-source", label: "First source" }],
        nextCursor: "source-page-2",
      })
      .mockResolvedValueOnce({ ...identity, entries: [source], previousCursor: "source-page-1" })
      .mockResolvedValue({
        ...identity,
        revision: 2,
        entries: [{ ...source, label: "Updated source" }],
        previousCursor: "source-page-1",
      });
    const { rerender } = render(<CompactPanel {...props} data={data} />);
    openTab("Token");
    fireEvent.click(screen.getByText("Source details"));
    await screen.findByText("First source");
    fireEvent.click(screen.getByRole("button", { name: "Next sources" }));
    await screen.findByText("Later source");
    const next = { ...data, overview: { ...data.overview, revision: 2 } };
    rerender(<CompactPanel {...props} data={next} />);
    await screen.findByText("Updated source");
    expect(fetchSessionInsightSources).toHaveBeenLastCalledWith("session-1", "current", {
      kind: undefined,
      cursor: "source-page-2",
    });
    expect(screen.getByText("Source details").parentElement).toHaveTextContent("later-source");
    rerender(<CompactPanel {...props} data={{ ...next, overview: { ...next.overview } }} />);
    await act(async () => {});
    expect(fetchSessionInsightSources).toHaveBeenCalledTimes(3);
  });

  test("pages tool disclosures without recalculating complete timing totals", async () => {
    const data = compact(makeData());
    const first = {
      id: "first",
      name: "execute",
      startedAt: 3000,
      endedAt: 6000,
      status: "completed" as const,
      background: false,
      reportedCalls: [{ name: "files.read", status: "completed" as const }],
    };
    const second = {
      ...first,
      id: "second",
      reportedCalls: [{ name: "files.write", status: "completed" as const }],
    };
    const identity = { sessionID: "session-1", directory: "/project", revision: 1 };
    vi.mocked(fetchSessionInsightTools)
      .mockResolvedValueOnce({
        ...identity,
        total: 100000,
        entries: [first],
        nextCursor: "next",
        reset: false,
      })
      .mockResolvedValueOnce({
        ...identity,
        total: 100000,
        entries: [second],
        cursor: "anchor-second",
        previousCursor: "previous",
        reset: false,
      });
    const { rerender } = render(<CompactPanel {...props} data={data} />);
    openTab("Time");
    expect(fetchSessionInsightTools).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText(/per-call timing unavailable/));
    await screen.findByText("files.read ×1 · completed");
    expect(screen.getByText("5.00 s")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next tools" }));
    await screen.findByText("files.write ×1 · completed");
    expect(screen.queryByText("files.read ×1 · completed")).not.toBeInTheDocument();
    expect(screen.getByText("5.00 s")).toBeInTheDocument();
    expect(fetchSessionInsightTools).toHaveBeenLastCalledWith("session-1", { cursor: "next" });
    expect(screen.getByRole("button", { name: "Previous tools" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next tools" })).toBeDisabled();
    vi.mocked(fetchSessionInsightTools).mockResolvedValue({
      ...identity,
      revision: 2,
      total: 100001,
      entries: [{ ...second, name: "Updated execute" }],
      cursor: "anchor-second",
      previousCursor: "previous",
      reset: false,
    });
    rerender(
      <CompactPanel {...props} data={{ ...data, overview: { ...data.overview, revision: 2 } }} />,
    );
    await screen.findByText("Updated execute");
    expect(fetchSessionInsightTools).toHaveBeenLastCalledWith("session-1", {
      cursor: "anchor-second",
    });
    expect(screen.getByText("5.00 s")).toBeInTheDocument();
  });

  test("shows Code Mode child counts in optional details without child durations", async () => {
    const data = makeData();
    data.session.tools[0].name = "execute";
    data.session.tools[0].reportedCalls = Array.from({ length: 3 }, () => ({
      name: "files.read_text_file",
      status: "completed" as const,
    }));
    render(<SessionInsightPanel {...props} data={data} />);
    openTab("Time");
    expect(fetchSessionInsightTools).not.toHaveBeenCalled();
    const details = screen.getByText(/per-call timing unavailable/).parentElement!;
    expect(details).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText(/per-call timing unavailable/));
    expect(details).toHaveAttribute("open");
    expect(
      await within(details).findByText("files.read_text_file ×3 · completed"),
    ).toBeInTheDocument();
    expect(details).not.toHaveTextContent(/\d+\.\d+ s/);
  });
});
