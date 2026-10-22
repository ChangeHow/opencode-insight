import { GENERATION_WINDOW_MS, type SpeedWindow } from "@opencode-insight/telemetry/queries";
import { number, time } from "./format";

const WIDTH = 640;
const HEIGHT = 230;
const LEFT = 48;
const TOP = 18;
const BOTTOM = 194;
export function chartGeometry(window?: SpeedWindow, width = WIDTH) {
  const end = window?.generation?.end ?? window?.measuredAt ?? Date.now();
  const start = window?.generation?.start ?? end - GENERATION_WINDOW_MS;
  const points = (window?.generation?.stages ?? [])
    .filter((stage) => stage.end > start && stage.start < end)
    .map((stage) => {
      const from = Math.max(start, stage.start);
      const to = Math.min(end, stage.end);
      return {
        ...stage,
        from,
        to,
        // Position the full request average in its visible interval, not an invented sample.
        at: (from + to) / 2,
      };
    })
    .sort((a, b) => a.at - b.at);
  const max = Math.max(1, ...points.map((point) => point.tps ?? 0));
  const right = width - 20;
  const x = (at: number) => LEFT + ((at - start) / Math.max(1, end - start)) * (right - LEFT);
  const y = (value: number) => BOTTOM - (value / max) * (BOTTOM - TOP);
  const shades = points.filter((point) => point.tps === undefined);
  const path = points
    .map((point, index) => {
      if (point.tps === undefined) return "";
      const previous = points[index - 1];
      const position = `${x(point.at).toFixed(2)},${y(point.tps).toFixed(2)}`;
      if (point.breakBefore || previous?.tps === undefined) return `M${position}`;
      // Interpolate request means over real elapsed time, not instantaneous generation speed.
      const midpoint = ((x(previous.at) + x(point.at)) / 2).toFixed(2);
      return `C${midpoint},${y(previous.tps).toFixed(2)} ${midpoint},${y(point.tps).toFixed(2)} ${position}`;
    })
    .join(" ");
  return { points, shades, start, end, max, x, y, path, width, right, nextAt: window?.nextAt };
}

export function createSpeedChart(
  container: HTMLElement,
  refresh: () => void = () => {},
  onLabelLayout?: (left: number) => void,
): {
  update(window?: SpeedWindow): void;
  dispose(): void;
} {
  container.innerHTML = `<p class="muted chart-empty" title="Missing usage or timing cannot reconstruct generation speed.">No measured model requests.</p>
    <div class="section-head chart-heading"><span class="muted">Recent model requests</span><span class="muted">Output + reasoning</span></div>
    <div class="chart"><svg viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="none" role="img" tabindex="0" aria-label="Output plus reasoning request mean TPS over the last fifteen wall-clock minutes" aria-description="Each point shows a request average, not instantaneous speed. The smooth curve interpolates between known request means over real elapsed time; it does not indicate observed generation during idle time. Unknown rates break the curve. Approximate rates use observed output and reasoning until reported usage arrives. Tools and idle time retain their real spacing. Vertical dividers mark request starts. Hover or tap to inspect; use Left, Right, Home or End; Escape dismisses.">
      <g class="speed-shades" aria-hidden="true"/>
      <g class="speed-boundaries" aria-hidden="true"/>
      ${[0, 0.5, 1].map(() => `<line class="grid"/><text class="value-label" text-anchor="end"/><text class="time-label" y="218"/>`).join("")}
      <text x="${LEFT}" y="12">tokens/s</text>
      <path class="line speed" style="stroke:var(--insight-speed-output)"/>
      <g class="speed-points" aria-hidden="true"/>
      <line class="cursor" y1="${TOP}" y2="${BOTTOM}" hidden/>
    </svg><div class="speed-inspection"><div class="tooltip" role="status" hidden></div></div></div>`;
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
  const boundaries = svg.querySelector(".speed-boundaries")!;
  let window: SpeedWindow | undefined;
  let refreshedAt: number | undefined;
  let g = chartGeometry();
  let selected: string | undefined;
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
    delete container.dataset.inspectedRequest;
  };
  function show(index: number) {
    const p = g.points[index];
    if (!p) return;
    selected = p.requestID;
    inspecting = true;
    container.dataset.inspectedAt = String(p.at);
    container.dataset.inspectedRequest = p.requestID;
    tip.hidden = false;
    tip.innerHTML = `<time>${time(p.start)}–${time(p.end)}</time><strong>${p.tps === undefined ? (p.status === "running" ? "Pending final usage" : "Rate unavailable") : `${p.estimated ? "≈" : ""}${number(p.tps)} tokens/s`}</strong>`;
    cursor.removeAttribute("hidden");
    attrs(cursor, { x1: g.x(p.at), x2: g.x(p.at) });
  }
  const selectedIndex = () => g.points.findIndex((p) => p.requestID === selected);
  function render() {
    clearTimeout(timer);
    if (disposed) return;
    if (document.hidden) return;
    g = chartGeometry(window, Math.max(280, container.clientWidth || WIDTH));
    const nextAt = g.nextAt;
    if (nextAt !== undefined && nextAt !== refreshedAt) {
      timer = setTimeout(
        () => {
          if (disposed || document.hidden) return;
          refreshedAt = nextAt;
          refresh();
        },
        Math.max(0, nextAt - Date.now()),
      );
    }
    const populated = g.points.length > 0;
    empty.hidden = populated;
    heading.hidden = !window;
    box.hidden = !window;
    const label = heading.querySelector("span")!;
    label.textContent = window?.generation?.partial
      ? "Recent model requests · captured history only"
      : "Recent model requests";
    label.title = window?.generation?.partial
      ? "Only retained captured requests are shown (up to 40); earlier activity may be missing."
      : "Last fifteen wall-clock minutes";
    empty.textContent = window
      ? "Generation speed unavailable: no measured model request duration."
      : "No measured model requests.";
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
    if (onLabelLayout)
      onLabelLayout(
        Math.min(...values.map((value) => value.getBoundingClientRect().left)) -
          svg.getBoundingClientRect().left,
      );
    path.setAttribute("d", g.path);
    const node = (
      tag: "rect" | "text" | "circle" | "line",
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
        const left = g.x(shade.from),
          width = g.x(shade.to) - left;
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
                shade.status === "running" ? "Pending" : "Unavailable",
              ),
            ];
      }),
    );
    boundaries.replaceChildren(
      ...g.points
        .filter((point) => point.start >= g.start)
        .map((point) =>
          node("line", {
            x1: g.x(point.start),
            x2: g.x(point.start),
            y1: TOP,
            y2: BOTTOM,
            class: "speed-boundary",
          }),
        ),
    );
    markers.replaceChildren(
      ...g.points.flatMap((point) =>
        point.tps === undefined
          ? []
          : [
              node("circle", {
                cx: g.x(point.at),
                cy: g.y(point.tps),
                r: 3,
                fill: "var(--insight-speed-output)",
              }),
            ],
      ),
    );
    const index = selectedIndex();
    if (inspecting && index >= 0) show(index);
    else if (index < 0) {
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
    // Prefer a containing interval; parallel requests and idle gaps use nearest midpoint.
    const containing = g.points.filter((point) => at >= point.from && at <= point.to);
    const candidates = containing.length ? containing : g.points;
    const nearest = candidates.reduce((best, point) =>
      Math.abs(point.at - at) < Math.abs(best.at - at) ? point : best,
    );
    show(g.points.indexOf(nearest));
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
    update(nextWindow) {
      if (disposed) return;
      window = nextWindow;
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
