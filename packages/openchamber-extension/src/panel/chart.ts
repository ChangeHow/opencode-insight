import type { SessionInsight } from "@opencode-insight/telemetry/schema";
import { number, time } from "./format";
import { SPEED_BUCKET_MS, speedModel, type SpeedState } from "./speed-model";

const WIDTH = 640;
const HEIGHT = 230;
const LEFT = 48;
const TOP = 18;
const BOTTOM = 194;
export function chartGeometry(session?: SessionInsight, width = WIDTH, now = Date.now()) {
  const model = speedModel(session, now);
  const { start, buckets: points } = model;
  const end = Math.max(start + SPEED_BUCKET_MS, model.end);
  const max = Math.max(1, ...points.map((point) => point.tps ?? 0));
  const right = width - 20;
  const x = (at: number) => LEFT + ((at - start) / (end - start)) * (right - LEFT);
  const y = (value: number) => BOTTOM - (value / max) * (BOTTOM - TOP);
  const shades: Array<{ start: number; end: number; state: SpeedState }> = [];
  for (const point of points) {
    if (point.tps !== undefined) continue;
    const previous = shades.at(-1);
    if (previous?.state === point.state && previous.end === point.start) previous.end = point.end;
    else shades.push({ start: point.start, end: point.end, state: point.state });
  }
  const path = points
    .map((point, index) => {
      if (point.tps === undefined) return "";
      const previous = points[index - 1];
      const position = `${x(point.at).toFixed(2)},${y(point.tps).toFixed(2)}`;
      if (previous?.tps === undefined) return `M${position}`;
      const middle = ((x(previous.at) + x(point.at)) / 2).toFixed(2);
      // Controls stay between the endpoints: smooth joins cannot invent peaks.
      return `C${middle},${y(previous.tps).toFixed(2)} ${middle},${y(point.tps).toFixed(2)} ${position}`;
    })
    .join(" ");
  return { points, shades, start, end, max, x, y, path, width, right, nextAt: model.nextAt };
}

const labels: Record<SpeedState, string> = {
  output: "Output",
  waiting: "Waiting",
  tools: "Tools",
  unobserved: "Unobserved",
};

export function createSpeedChart(container: HTMLElement): {
  update(session?: SessionInsight): void;
  dispose(): void;
} {
  container.innerHTML = `<p class="muted chart-empty" title="Historical totals cannot reconstruct per-second output.">No speed samples in this window.</p>
    <div class="section-head chart-heading"><span class="muted">Latest 10 min</span><span class="muted">15 s buckets</span></div>
    <div class="chart"><svg viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="none" role="img" tabindex="0" aria-label="Output TPS in completed 15 second buckets" aria-description="Hover or tap to inspect. Use Left and Right arrows, Home or End to select buckets; Escape dismisses.">
      <g class="speed-shades" aria-hidden="true"/>
      ${[0, 0.5, 1].map(() => `<line class="grid"/><text class="value-label" text-anchor="end"/><text class="time-label" y="218"/>`).join("")}
      <text x="${LEFT}" y="12">tokens/s</text>
      <path class="line speed" style="stroke:var(--insight-speed-output)"/>
      <g class="speed-points" aria-hidden="true"/>
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
  const shades = svg.querySelector(".speed-shades")!;
  const markers = svg.querySelector(".speed-points")!;
  let session: SessionInsight | undefined;
  let g = chartGeometry();
  let selected: number | undefined;
  let inspecting = false;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
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
    tip.innerHTML = `<time>${time(p.start)}–${time(p.end)}</time><strong>${p.tps === undefined ? labels[p.state] : `${number(p.tps)} tokens/s`}</strong>`;
    cursor.removeAttribute("hidden");
    attrs(cursor, { x1: g.x(p.at), x2: g.x(p.at) });
  }
  const selectedIndex = () => g.points.findIndex((p) => p.at === selected);
  function render() {
    clearTimeout(timer);
    if (disposed) return;
    if (document.hidden) return;
    g = chartGeometry(session, Math.max(280, container.clientWidth || WIDTH));
    if (g.nextAt !== undefined) timer = setTimeout(render, Math.max(0, g.nextAt - Date.now()));
    const populated = g.points.length > 0;
    empty.hidden = populated;
    heading.hidden = !populated;
    box.hidden = !populated;
    empty.textContent = session
      ? "Waiting for a completed 15 s bucket."
      : "No speed samples in this window.";
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
    const node = (
      tag: "rect" | "text" | "circle",
      attributes: Record<string, string | number>,
      text?: string,
    ) => {
      const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
      attrs(element, attributes);
      if (text) element.textContent = text;
      return element;
    };
    shades.replaceChildren(
      ...g.shades.flatMap((shade) => {
        const left = g.x(shade.start),
          width = g.x(shade.end) - left;
        const rectangle = node("rect", {
          x: left,
          y: TOP,
          width,
          height: BOTTOM - TOP,
          class: "speed-shade",
        });
        return width < 65
          ? [rectangle]
          : [
              rectangle,
              node(
                "text",
                {
                  x: left + width / 2,
                  y: BOTTOM - 8,
                  "text-anchor": "middle",
                  class: "speed-state",
                },
                labels[shade.state],
              ),
            ];
      }),
    );
    markers.replaceChildren(
      ...g.points.flatMap((point) =>
        point.tps === undefined
          ? []
          : [
              node("circle", {
                cx: g.x(point.at),
                cy: g.y(point.tps),
                r: 2.2,
                fill: "var(--insight-speed-output)",
              }),
            ],
      ),
    );
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
    show(Math.max(0, Math.min(g.points.length - 1, Math.floor((at - g.start) / SPEED_BUCKET_MS))));
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
  document.addEventListener("visibilitychange", render);
  const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(render);
  observer?.observe(container);
  render();
  return {
    update(nextSession) {
      if (disposed) return;
      session = nextSession;
      render();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(timer);
      observer?.disconnect();
      svg.removeEventListener("pointermove", inspect);
      svg.removeEventListener("pointerdown", inspect);
      svg.removeEventListener("focus", focus);
      svg.removeEventListener("keydown", keydown);
      box.removeEventListener("pointerleave", hide);
      document.removeEventListener("visibilitychange", render);
      hide();
    },
  };
}
