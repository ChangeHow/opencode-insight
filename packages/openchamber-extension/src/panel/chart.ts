import type { SeriesPoint, SessionInsight } from "@opencode-insight/telemetry/schema";
import { speedWindow } from "@opencode-insight/telemetry/summary";
import { duration, escape, number, time } from "./format";

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
  const { points, start } = window;
  const end = Math.max(start + 1000, window.end);
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

export function createSpeedChart(container: HTMLElement): {
  update(input: SeriesPoint[], session?: SessionInsight): void;
  dispose(): void;
} {
  container.innerHTML = `<p class="muted chart-empty" title="Historical totals cannot reconstruct per-second output.">No speed samples in this window.</p>
    <div class="section-head chart-heading"><span class="muted" title="Automatically follows the latest 10 minutes. Completed sessions freeze at their last captured activity.">Latest 10 min</span><span class="muted" title="1 s buckets · 5 s rolling output. Gaps mean no captured sample, not zero. Hidden reasoning has no fabricated speed trace.">5 s rolling</span></div>
    <div class="legend"><span class="output">Output</span><span class="reasoning">Visible reasoning</span><span class="summary" title="Reasoning summary, not hidden reasoning.">Reasoning summary</span><span class="mean" title="Reported output + reasoning over whole request elapsed time; completed requests only.">Request mean</span></div>
    <div class="chart"><svg viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="none" role="img" tabindex="0" aria-label="Rolling tokens per second over time" aria-description="Hover or tap to inspect. Use Left and Right arrows, Home or End to select samples; Escape dismisses.">
      ${[0, 0.5, 1].map(() => `<line class="grid"/><text class="value-label" text-anchor="end"/><text class="time-label" y="218"/>`).join("")}
      <text x="${LEFT}" y="12">tokens/s</text>
      <path class="line output"/><path class="line reasoning"/><path class="line summary"/><path class="line mean"/>
      <line class="cursor" y1="${TOP}" y2="${BOTTOM}" hidden/>
    </svg><div class="tooltip" role="status" hidden></div></div>
    <span class="sr-only">Hover or tap to inspect. Use Left and Right arrows, Home or End to select samples; Escape dismisses.</span>`;
  const svg = container.querySelector("svg")!;
  const box = container.querySelector<HTMLElement>(".chart")!;
  const tip = container.querySelector<HTMLElement>(".tooltip")!;
  const cursor = container.querySelector<SVGLineElement>(".cursor")!;
  const empty = container.querySelector<HTMLElement>(".chart-empty")!;
  const heading = container.querySelector<HTMLElement>(".chart-heading")!;
  const legend = container.querySelector<HTMLElement>(".legend")!;
  const grids = [...svg.querySelectorAll(".grid")];
  const values = [...svg.querySelectorAll(".value-label")];
  const times = [...svg.querySelectorAll(".time-label")];
  const paths = {
    output: svg.querySelector("path.output")!,
    reasoning: svg.querySelector("path.reasoning")!,
    summary: svg.querySelector("path.summary")!,
    mean: svg.querySelector("path.mean")!,
  };
  for (const name of ["output", "reasoning", "summary", "mean"] as const) {
    paths[name].setAttribute("style", `stroke:var(--insight-speed-${name})`);
    const sample = document.createElement("i");
    sample.setAttribute("aria-hidden", "true");
    sample.style.borderTop = `2px ${name === "mean" ? "dashed" : "solid"} var(--insight-speed-${name})`;
    legend.querySelector<HTMLElement>(`.${name}`)!.prepend(sample);
  }
  let input: SeriesPoint[] = [];
  let session: SessionInsight | undefined;
  let g = chartGeometry(input);
  let selected: { requestID: string; at: number } | undefined;
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
    delete container.dataset.inspectedRequestId;
  };
  function show(index: number) {
    const p = g.points[index];
    if (!p) return;
    selected = { requestID: p.requestID, at: p.at };
    inspecting = true;
    container.dataset.inspectedAt = String(p.at);
    container.dataset.inspectedRequestId = p.requestID;
    const request = session?.requests.find((r) => r.id === p.requestID);
    const bucket = request?.buckets.find((b) => b.at === p.at);
    tip.hidden = false;
    tip.innerHTML = `<strong>${escape(p.model)}</strong><br>Request ${escape(p.requestID)} · ${escape(request?.status ?? "unknown")}<br>First response: ${request?.firstDeltaAt === undefined ? "unavailable" : duration(Math.max(0, request.firstDeltaAt - request.startedAt))}<br>${time(p.at)} · 1 s bucket<br>Output bucket: ${bucket ? number(bucket.output) : "unavailable"}<br>Rolling output: ${number(p.outputTps)} tokens/s<br>Visible reasoning: ${request?.reasoningMode === "visible" ? `${number(p.reasoningTps)} tokens/s` : "not captured"}<br>Summary: ${request?.reasoningMode === "summary" || p.summaryTps > 0 ? `${number(p.summaryTps)} tokens/s` : "not captured"}<br>Whole-request mean (output + reasoning): ${p.requestTps === undefined || request?.status !== "completed" ? "unavailable" : `${number(p.requestTps)} tokens/s (final)`}<br>Quality: ${escape(p.quality)}${request?.capture === "partial" ? " · partial capture" : ""}`;
    const position = (g.x(p.at) / g.width) * box.clientWidth;
    tip.style.left = `${Math.max(0, Math.min(position + 8, box.clientWidth - tip.offsetWidth))}px`;
    cursor.removeAttribute("hidden");
    attrs(cursor, { x1: g.x(p.at), x2: g.x(p.at) });
  }
  const selectedIndex = () =>
    g.points.findIndex((p) => p.requestID === selected?.requestID && p.at === selected.at);
  function render() {
    if (disposed) return;
    g = chartGeometry(input, Math.max(280, container.clientWidth || WIDTH), session?.requests);
    const populated = g.points.length > 0;
    empty.hidden = populated;
    heading.hidden = !populated;
    legend.hidden = !populated;
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
    paths.output.setAttribute("d", g.path("outputTps"));
    paths.reasoning.setAttribute("d", g.path("reasoningTps"));
    paths.summary.setAttribute("d", g.path("summaryTps"));
    for (const name of ["reasoning", "summary"] as const) {
      const visible = g.points.some(
        (p) => p[name === "reasoning" ? "reasoningTps" : "summaryTps"] > 0,
      );
      paths[name].toggleAttribute("hidden", !visible);
      legend.querySelector<HTMLElement>(`.${name}`)!.hidden = !visible;
    }
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
    paths.mean.setAttribute(
      "d",
      [...averages.values()]
        .map((group) => {
          const mean = group.at(-1)!.requestTps!;
          return group
            .map(
              (p) =>
                `M${g.x(p.at)},${g.y(mean)} L${g.x(Math.min(g.end, p.at + 1000))},${g.y(mean)}`,
            )
            .join(" ");
        })
        .join(" "),
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
