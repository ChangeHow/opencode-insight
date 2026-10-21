import type { SeriesPoint, SessionInsight } from "@opencode-insight/telemetry/schema";
import { duration, escape, number, time } from "./format";

const WIDTH = 640;
const HEIGHT = 230;
const LEFT = 48;
const TOP = 18;
const BOTTOM = 194;
export const MAX_POINTS = 600;

export function chartGeometry(input: SeriesPoint[], width = WIDTH) {
  const points = [...input].sort((a, b) => a.at - b.at).slice(-MAX_POINTS);
  const start = points[0]?.at ?? 0;
  const end = Math.max(start + 1000, points.at(-1)?.at ?? 0);
  const max = Math.max(
    1,
    ...points.flatMap((p) => [p.outputTps, p.reasoningTps, p.summaryTps, p.requestTps ?? 0]),
  );
  const right = width - 20;
  const x = (at: number) => LEFT + ((at - start) / (end - start)) * (right - LEFT);
  const y = (value: number) => BOTTOM - (value / max) * (BOTTOM - TOP);
  function path(key: "outputTps" | "reasoningTps" | "summaryTps") {
    const groups = new Map<string, SeriesPoint[]>();
    points.forEach((p) => {
      const group = groups.get(p.requestID) ?? [];
      group.push(p);
      groups.set(p.requestID, group);
    });
    return [...groups.values()]
      .map((group) =>
        group
          .map((p, i) => {
            const prev = group[i - 1];
            const move = !prev || p.at - prev.at > 1000;
            return `${move ? "M" : "L"}${x(p.at).toFixed(2)},${y(p[key]).toFixed(2)}`;
          })
          .join(" "),
      )
      .join(" ");
  }
  return { points, start, end, max, x, y, path, width, right };
}

export function mountChart(
  container: HTMLElement,
  input: SeriesPoint[],
  session?: SessionInsight,
  inspectedAt?: number,
) {
  if (!input.length) {
    container.innerHTML =
      '<p class="muted">No live speed samples captured. Historical totals cannot reconstruct per-second output.</p>';
    return;
  }
  const g = chartGeometry(input, Math.max(280, container.clientWidth || WIDTH));
  const hasReasoning = g.points.some((p) => p.reasoningTps > 0);
  const hasSummary = g.points.some((p) => p.summaryTps > 0);
  const averages = new Map<string, SeriesPoint[]>();
  for (const p of g.points) {
    if (
      p.requestTps === undefined ||
      !session?.requests.some((r) => r.id === p.requestID && r.status === "completed")
    )
      continue;
    const group = averages.get(p.requestID) ?? [];
    group.push(p);
    averages.set(p.requestID, group);
  }
  container.innerHTML = `<p class="muted">1 s buckets · 5 s rolling output · up to ${MAX_POINTS} samples</p>
    <div class="legend"><span class="output">Output</span>${hasReasoning ? '<span class="reasoning">Visible reasoning</span>' : ""}${hasSummary ? '<span class="summary">Reasoning summary (not hidden reasoning)</span>' : ""}<span>┄ Final whole-request mean (output + reasoning)</span></div>
    <div class="chart"><svg viewBox="0 0 ${g.width} ${HEIGHT}" preserveAspectRatio="none" role="img" aria-label="Rolling tokens per second over time">
      ${[0, 0.5, 1].map((ratio) => `<line class="grid" x1="${LEFT}" x2="${g.right}" y1="${g.y(g.max * ratio)}" y2="${g.y(g.max * ratio)}"/><text x="${LEFT - 6}" y="${g.y(g.max * ratio) + 4}" text-anchor="end">${number(g.max * ratio)}</text>`).join("")}
      ${[0, 0.5, 1]
        .map((ratio) => {
          const at = g.start + ratio * (g.end - g.start);
          return `<text x="${g.x(at)}" y="218" text-anchor="${ratio === 0 ? "start" : ratio === 1 ? "end" : "middle"}">${time(at)}</text>`;
        })
        .join("")}
      <text x="${LEFT}" y="12">tokens/s</text>
      <path class="line output" d="${g.path("outputTps")}"/>
      ${hasReasoning ? `<path class="line reasoning" d="${g.path("reasoningTps")}"/>` : ""}
      ${hasSummary ? `<path class="line summary" d="${g.path("summaryTps")}"/>` : ""}
      ${[...averages.values()]
        .map((group) => {
          const p = group.at(-1)!;
          return `<path class="line mean" d="M${g.x(group[0].at)},${g.y(p.requestTps!)} L${g.x(Math.min(g.end, p.at + 1000))},${g.y(p.requestTps!)}"/>`;
        })
        .join("")}
      <line class="cursor" y1="${TOP}" y2="${BOTTOM}" hidden/>
    </svg><div class="tooltip" role="status" hidden></div></div>
    <label class="scrubber">Inspect time <input aria-label="Inspect chart time" type="range" min="0" max="${g.points.length - 1}" value="${g.points.length - 1}" step="1"></label>
    <p class="muted">Gaps mean no captured sample, not zero. Hidden reasoning has no fabricated speed trace. Means use reported output + reasoning over whole request elapsed time.</p>`;
  const svg = container.querySelector("svg")!;
  const box = container.querySelector<HTMLElement>(".chart")!;
  const tip = container.querySelector<HTMLElement>(".tooltip")!;
  const cursor = container.querySelector<SVGLineElement>(".cursor")!;
  const slider = container.querySelector<HTMLInputElement>("input")!;
  function show(index: number) {
    const p = g.points[index];
    container.dataset.inspectedAt = String(p.at);
    const request = session?.requests.find((r) => r.id === p.requestID);
    const bucket = request?.buckets.find((b) => b.at === p.at);
    tip.hidden = false;
    tip.innerHTML = `<strong>${escape(p.model)}</strong><br>Request ${escape(p.requestID)} · ${escape(request?.status ?? "unknown")}<br>First response: ${request?.firstDeltaAt === undefined ? "unavailable" : duration(Math.max(0, request.firstDeltaAt - request.startedAt))}<br>${time(p.at)} · 1 s bucket<br>Output bucket: ${bucket ? number(bucket.output) : "unavailable"}<br>Rolling output: ${number(p.outputTps)} tokens/s<br>Visible reasoning: ${request?.reasoningMode === "visible" ? `${number(p.reasoningTps)} tokens/s` : "not captured"}<br>Summary: ${request?.reasoningMode === "summary" || p.summaryTps > 0 ? `${number(p.summaryTps)} tokens/s` : "not captured"}<br>Whole-request mean (output + reasoning): ${p.requestTps === undefined ? "unavailable" : `${number(p.requestTps)} tokens/s${request?.status === "completed" ? " (final)" : " (in progress)"}`}<br>Quality: ${escape(p.quality)}${request?.capture === "partial" ? " · partial capture" : ""}`;
    const position = (g.x(p.at) / g.width) * box.clientWidth;
    tip.style.left = `${Math.max(0, Math.min(position + 8, box.clientWidth - tip.offsetWidth))}px`;
    cursor.removeAttribute("hidden");
    cursor.setAttribute("x1", String(g.x(p.at)));
    cursor.setAttribute("x2", String(g.x(p.at)));
    slider.value = String(index);
  }
  const inspect = (event: PointerEvent) => {
    const bounds = svg.getBoundingClientRect();
    const at =
      g.start +
      ((((event.clientX - bounds.left) / bounds.width) * g.width - LEFT) / (g.right - LEFT)) *
        (g.end - g.start);
    let index = 0;
    g.points.forEach((point, i) => {
      if (Math.abs(point.at - at) < Math.abs(g.points[index].at - at)) index = i;
    });
    show(index);
  };
  svg.addEventListener("pointermove", inspect);
  svg.addEventListener("pointerdown", inspect);
  box.addEventListener("pointerleave", () => {
    if (!container.contains(box)) return;
    tip.hidden = true;
    cursor.setAttribute("hidden", "");
    delete container.dataset.inspectedAt;
  });
  slider.addEventListener("input", () => show(Number(slider.value)));
  slider.addEventListener("focus", () => show(Number(slider.value)));
  slider.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      tip.hidden = true;
      cursor.setAttribute("hidden", "");
      delete container.dataset.inspectedAt;
    }
  });
  if (inspectedAt !== undefined) {
    let index = 0;
    g.points.forEach((p, i) => {
      if (Math.abs(p.at - inspectedAt) < Math.abs(g.points[index].at - inspectedAt)) index = i;
    });
    show(index);
  }
}
