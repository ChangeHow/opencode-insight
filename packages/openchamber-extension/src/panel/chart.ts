import type { SeriesPoint, SessionInsight } from "@opencode-insight/telemetry/schema";
import { speedWindow } from "@opencode-insight/telemetry/summary";
import { number, time } from "./format";

const WIDTH = 640;
const HEIGHT = 230;
const LEFT = 48;
const TOP = 18;
const BOTTOM = 194;
export function chartGeometry(
  input: SeriesPoint[],
  width = WIDTH,
  requests: SessionInsight["requests"] = [],
  now = Date.now(),
) {
  const window = speedWindow(input, requests, now);
  const { start } = window;
  const end = Math.max(start + 1000, window.end);
  const samples = new Map<number, { at: number; tps: number }>();
  for (const point of window.points) {
    const sample = samples.get(point.at) ?? { at: point.at, tps: 0 };
    sample.tps += point.outputTps + point.reasoningTps + point.summaryTps;
    samples.set(point.at, sample);
  }
  if (samples.size && requests.length) {
    for (let at = Math.ceil(start / 1000) * 1000; at <= window.end; at += 1000) {
      const active = requests.some((request) => {
        const last = request.streamedAt ?? request.endedAt ?? now;
        return (
          at >= Math.floor(request.startedAt / 1000) * 1000 && at <= Math.floor(last / 1000) * 1000
        );
      });
      // Known idle seconds join requests; missing samples inside a request stay unknown.
      if (!samples.has(at) && !active) samples.set(at, { at, tps: 0 });
    }
  }
  const points = [...samples.values()].sort((a, b) => a.at - b.at);
  const max = Math.max(1, ...points.map((point) => point.tps));
  const right = width - 20;
  const x = (at: number) => LEFT + ((at - start) / (end - start)) * (right - LEFT);
  const y = (value: number) => BOTTOM - (value / max) * (BOTTOM - TOP);
  const path = points
    .map((point, index) => {
      const previous = points[index - 1];
      const move = !previous || point.at - previous.at > 1000;
      return `${move ? "M" : "L"}${x(point.at).toFixed(2)},${y(point.tps).toFixed(2)}`;
    })
    .join(" ");
  return { points, start, end, max, x, y, path, width, right };
}

export function createSpeedChart(container: HTMLElement): {
  update(input: SeriesPoint[], session?: SessionInsight): void;
  dispose(): void;
} {
  container.innerHTML = `<p class="muted chart-empty" title="Historical totals cannot reconstruct per-second output.">No speed samples in this window.</p>
    <div class="section-head chart-heading"><span class="muted">Latest 10 min</span><span class="muted">5 s rolling</span></div>
    <div class="chart"><svg viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="none" role="img" tabindex="0" aria-label="Rolling tokens per second over time" aria-description="Hover or tap to inspect. Use Left and Right arrows, Home or End to select samples; Escape dismisses.">
      ${[0, 0.5, 1].map(() => `<line class="grid"/><text class="value-label" text-anchor="end"/><text class="time-label" y="218"/>`).join("")}
      <text x="${LEFT}" y="12">tokens/s</text>
      <path class="line speed" style="stroke:var(--insight-speed-output)"/>
      <line class="cursor" y1="${TOP}" y2="${BOTTOM}" hidden/>
    </svg><div class="speed-inspection"><div class="tooltip" role="status" hidden></div></div></div>
    <span class="sr-only">Hover or tap to inspect. Use Left and Right arrows, Home or End to select samples; Escape dismisses.</span>`;
  const svg = container.querySelector("svg")!;
  const box = container.querySelector<HTMLElement>(".chart")!;
  const tip = container.querySelector<HTMLElement>(".tooltip")!;
  const cursor = container.querySelector<SVGLineElement>(".cursor")!;
  const empty = container.querySelector<HTMLElement>(".chart-empty")!;
  const heading = container.querySelector<HTMLElement>(".chart-heading")!;
  const grids = [...svg.querySelectorAll(".grid")];
  const values = [...svg.querySelectorAll(".value-label")];
  const times = [...svg.querySelectorAll(".time-label")];
  const path = svg.querySelector("path.speed")!;
  let input: SeriesPoint[] = [];
  let session: SessionInsight | undefined;
  let g = chartGeometry(input);
  let selected: number | undefined;
  let inspecting = false;
  let disposed = false;
  const attrs = (node: Element, attributes: Record<string, string | number>) => {
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  };
  const hide = () => {
    inspecting = false;
    tip.hidden = true;
    cursor.setAttribute("hidden", "");
    delete container.dataset.inspectedAt;
  };
  function show(index: number) {
    const p = g.points[index];
    if (!p) return;
    selected = p.at;
    inspecting = true;
    container.dataset.inspectedAt = String(p.at);
    tip.hidden = false;
    tip.innerHTML = `<time>${time(p.at)}</time><strong>${number(p.tps)} tokens/s</strong>`;
    cursor.removeAttribute("hidden");
    attrs(cursor, { x1: g.x(p.at), x2: g.x(p.at) });
  }
  const selectedIndex = () => g.points.findIndex((p) => p.at === selected);
  function render() {
    if (disposed) return;
    g = chartGeometry(input, Math.max(280, container.clientWidth || WIDTH), session?.requests);
    const populated = g.points.length > 0;
    empty.hidden = populated;
    heading.hidden = !populated;
    box.hidden = !populated;
    attrs(svg, { viewBox: `0 0 ${g.width} ${HEIGHT}` });
    [0, 0.5, 1].forEach((ratio, i) => {
      const y = g.y(g.max * ratio);
      attrs(grids[i], { x1: LEFT, x2: g.right, y1: y, y2: y });
      attrs(values[i], { x: LEFT - 6, y: y + 4 });
      values[i].textContent = number(g.max * ratio);
      const at = g.start + ratio * (g.end - g.start);
      attrs(times[i], {
        x: g.x(at),
        "text-anchor": i === 0 ? "start" : i === 2 ? "end" : "middle",
      });
      times[i].textContent = time(at);
    });
    path.setAttribute("d", g.path);
    const index = selectedIndex();
    if (inspecting && index >= 0) show(index);
    else if (inspecting) {
      hide();
      selected = undefined;
    }
  }
  const inspect = (event: PointerEvent) => {
    const bounds = svg.getBoundingClientRect();
    if (!g.points.length || !bounds.width) return;
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
  const focus = () => show(selectedIndex() < 0 ? g.points.length - 1 : selectedIndex());
  const keydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") hide();
    else if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const index = selectedIndex() < 0 ? g.points.length - 1 : selectedIndex();
      show(
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? g.points.length - 1
            : Math.max(
                0,
                Math.min(g.points.length - 1, index + (event.key === "ArrowRight" ? 1 : -1)),
              ),
      );
    }
  };
  svg.addEventListener("pointermove", inspect);
  svg.addEventListener("pointerdown", inspect);
  svg.addEventListener("focus", focus);
  svg.addEventListener("keydown", keydown);
  box.addEventListener("pointerleave", hide);
  const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(render);
  observer?.observe(container);
  render();
  return {
    update(nextInput, nextSession) {
      if (disposed) return;
      input = nextInput;
      session = nextSession;
      render();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      observer?.disconnect();
      svg.removeEventListener("pointermove", inspect);
      svg.removeEventListener("pointerdown", inspect);
      svg.removeEventListener("focus", focus);
      svg.removeEventListener("keydown", keydown);
      box.removeEventListener("pointerleave", hide);
      hide();
    },
  };
}
