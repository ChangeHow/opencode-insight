import { useState } from "react";
import { type SeriesWindow, type SeriesPoint } from "@opencode-dashboard/shared";
import { useInsightClock } from "./session-insight-clock";

const tracks = [
  { label: "Output · 5s", color: "var(--accent)", key: "outputTps" },
  { label: "Reasoning · 5s", color: "var(--metric-green)", key: "reasoningTps" },
  { label: "Summary · 5s", color: "var(--metric-violet)", key: "summaryTps" },
  { label: "Request mean · reported", color: "var(--muted-foreground)", key: "requestTps" },
] as const;
type Track = (typeof tracks)[number];
const rate = (value: number | undefined) =>
  value === undefined ? "Unavailable" : `${value.toFixed(2)} tok/s`;
const time = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

// Missing buckets, request boundaries, and capture gaps must not become continuous lines.
function segments(points: SeriesPoint[]) {
  const groups: SeriesPoint[][] = [];
  const tails = new Map<string, SeriesPoint[]>();
  for (const point of points) {
    const last = tails.get(point.requestID);
    const previous = last?.at(-1);
    if (!previous || point.at - previous.at > 1000) {
      const group = [point];
      groups.push(group);
      tails.set(point.requestID, group);
    } else last!.push(point);
  }
  return groups;
}

export function SessionInsightChart({ series }: { series: SeriesWindow }) {
  const { requests, running } = series;
  const now = useInsightClock(running);
  const [selected, setSelected] = useState<Pick<SeriesPoint, "requestID" | "at">>();
  const byId = new Map(requests.map((request) => [request.id, request]));
  const captured = new Set(
    requests.filter((request) => request.captured).map((request) => request.id),
  );
  const end = running ? Math.max(series.end, now) : series.end;
  const start = running ? Math.max(series.start, end - 600000) : series.start;
  const points = series.points.filter(
    (point) => captured.has(point.requestID) && point.at >= start && point.at <= end,
  );
  if (!points.length)
    return (
      <section
        aria-label="Generation speed"
        className="py-10 text-center text-sm text-[var(--muted-foreground)]"
      >
        No captured speed in this window.
      </section>
    );
  const visibleTracks = tracks.filter(
    (track) =>
      (track.key !== "reasoningTps" && track.key !== "summaryTps") ||
      (track.key === "reasoningTps" ? series.channels.reasoning : series.channels.summary),
  );
  const value = (point: SeriesPoint, track: Track) => point[track.key];
  const max = Math.max(
    1,
    ...points.flatMap((point) => visibleTracks.map((track) => value(point, track) ?? 0)),
  );
  const span = Math.max(1000, end - start);
  const x = (at: number) => 35 + ((at - start) / span) * 530;
  const y = (amount: number) => 180 - (amount / max) * 150;
  const inspected = selected
    ? points.findIndex(
        (point) => point.requestID === selected.requestID && point.at === selected.at,
      )
    : -1;
  const cursor = inspected < 0 ? points.length - 1 : inspected;
  const point = points[cursor];
  const request = byId.get(point.requestID)!;
  const selectAt = (clientX: number, bounds: DOMRect) => {
    const at = start + ((((clientX - bounds.left) / bounds.width) * 600 - 35) / 530) * span;
    let nearest = 0;
    for (let i = 1; i < points.length; i++)
      if (Math.abs(points[i].at - at) < Math.abs(points[nearest].at - at)) nearest = i;
    setSelected(points[nearest]);
  };
  return (
    <section aria-label="Generation speed" className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <h3 className="font-semibold">
          Generation speed{" "}
          <span className="font-normal text-[var(--muted-foreground)]">· estimated</span>
        </h3>
        <span className="text-[var(--muted-foreground)]">
          {running ? "Live" : "Final window"} · last 10 min
        </span>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--muted-foreground)]">
        {visibleTracks.map((track) => (
          <li key={track.key} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              style={{
                borderColor: track.color,
                borderTopStyle: track.key === "requestTps" ? "dashed" : "solid",
              }}
              className="w-4 border-t-2"
            />
            {track.label}
          </li>
        ))}
      </ul>
      <div className="relative">
        <div
          role="slider"
          tabIndex={0}
          aria-label="Speed time cursor"
          aria-valuemin={0}
          aria-valuemax={points.length - 1}
          aria-valuenow={cursor}
          aria-valuetext={`${new Date(point.at).toISOString()}, ${point.model}, ${point.requestID}`}
          className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          onFocus={() => setSelected(points[cursor])}
          onBlur={() => setSelected(undefined)}
          onPointerLeave={() => setSelected(undefined)}
          onKeyDown={(event) => {
            if (
              ![
                "ArrowLeft",
                "ArrowRight",
                "ArrowUp",
                "ArrowDown",
                "Home",
                "End",
                "Escape",
              ].includes(event.key)
            )
              return;
            event.preventDefault();
            if (event.key === "Escape") {
              setSelected(undefined);
              return;
            }
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? points.length - 1
                  : Math.max(
                      0,
                      Math.min(
                        points.length - 1,
                        cursor + (["ArrowRight", "ArrowUp"].includes(event.key) ? 1 : -1),
                      ),
                    );
            setSelected(points[next]);
          }}
          onPointerMove={(event) =>
            selectAt(event.clientX, event.currentTarget.getBoundingClientRect())
          }
          onPointerDown={(event) =>
            selectAt(event.clientX, event.currentTarget.getBoundingClientRect())
          }
        >
          <svg
            viewBox="0 0 600 215"
            preserveAspectRatio="none"
            className="block h-60 w-full"
            role="img"
            aria-label="Estimated 5-second rolling generation speed"
          >
            {[0, 0.5, 1].map((fraction) => (
              <g key={fraction}>
                <path
                  d={`M35 ${y(max * fraction)}H565`}
                  stroke="var(--border)"
                  strokeDasharray="3 4"
                />
                <text
                  x="30"
                  y={y(max * fraction) - 5}
                  textAnchor="end"
                  fontSize="10"
                  fill="var(--muted-foreground)"
                >
                  {(max * fraction).toFixed(1)}
                </text>
              </g>
            ))}
            <text x="35" y="15" fontSize="10" fill="var(--muted-foreground)">
              tok/s
            </text>
            {visibleTracks.flatMap((track) =>
              segments(points.filter((item) => value(item, track) !== undefined)).map(
                (group, index) => (
                  <g
                    key={`${track.key}:${index}`}
                    data-track={track.key}
                    stroke={track.color}
                    fill={track.color}
                  >
                    <polyline
                      points={group
                        .map((item) => `${x(item.at)},${y(value(item, track)!)}`)
                        .join(" ")}
                      fill="none"
                      strokeWidth={track.key === "requestTps" ? "1.5" : "2"}
                      strokeDasharray={track.key === "requestTps" ? "5 4" : undefined}
                    />
                    {group.length === 1 && (
                      <circle cx={x(group[0].at)} cy={y(value(group[0], track)!)} r="2.5" />
                    )}
                  </g>
                ),
              ),
            )}
            {selected && (
              <path
                d={`M${x(point.at)} 25V180`}
                stroke="var(--muted-foreground)"
                strokeDasharray="3 3"
              />
            )}
            <text x="35" y="205" fontSize="11" fill="var(--muted-foreground)">
              {time(start)}
            </text>
            <text x="565" y="205" textAnchor="end" fontSize="11" fill="var(--muted-foreground)">
              {time(end)}
            </text>
          </svg>
        </div>
        {selected && (
          <div
            role="status"
            aria-atomic="true"
            className="pointer-events-none absolute inset-x-8 top-5 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-3 text-xs shadow-sm [overflow-wrap:anywhere]"
          >
            <div className="flex flex-wrap justify-between gap-1 font-semibold">
              <span>
                {point.model} · {time(point.at)}
              </span>
              <span>
                {request.status} · {point.quality}
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
              {visibleTracks.map((track) => (
                <div key={track.key}>
                  <dt className="text-[var(--muted-foreground)]">{track.label}</dt>
                  <dd className="tabular-nums">{rate(value(point, track))}</dd>
                </div>
              ))}
            </dl>
            <span className="mt-2 block text-[var(--muted-foreground)]">
              {point.requestID} · {request.capture} · First response:{" "}
              {request.firstDeltaAt === undefined
                ? "Unavailable"
                : `${((request.firstDeltaAt - request.startedAt) / 1000).toFixed(2)} s`}{" "}
              · Reasoning: {request.reasoningMode}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
