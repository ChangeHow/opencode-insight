import { mountButton } from "@openchamber/sdk/ui";
import type { TraceInterval } from "./trace-model";
import { itemLabel, itemRange, itemValue } from "./trace-presentation";
import type { TraceItem } from "./trace-presentation";
import { element, setText } from "./dom";

export interface TraceRowState {
  item: TraceItem;
  depth: number;
  expandable: boolean;
  expanded: boolean;
}
export interface TraceDomain {
  start: number;
  end: number;
}

const NS = "http://www.w3.org/2000/svg";
function svgElement<K extends keyof SVGElementTagNameMap>(tag: K) {
  return document.createElementNS(NS, tag);
}

export function createTraceRow(
  inspect: (item: TraceItem, trigger: HTMLElement) => void,
  toggle: (item: TraceItem) => void,
) {
  let state: TraceRowState;
  const node = element("div", "trace-row");
  const label = element("div", "trace-row-label");
  const foldSlot = element("span", "trace-fold");
  const nameSlot = element("span", "trace-name");
  label.append(foldSlot, nameSlot);
  const fold = mountButton(foldSlot, {
    label: "▸",
    size: "xs",
    variant: "ghost",
    onClick: () => toggle(state.item),
  });
  const foldButton = foldSlot.querySelector("button")!;
  const name = mountButton(nameSlot, {
    label: "",
    size: "sm",
    variant: "ghost",
    onClick: () => inspect(state.item, nameButton),
  });
  const nameButton = nameSlot.querySelector("button")!;
  const graph = element("button", "trace-plot");
  graph.type = "button";
  const svg = svgElement("svg");
  svg.setAttribute("viewBox", "0 0 1000 30");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  const envelope = svgElement("rect");
  envelope.setAttribute("class", "trace-envelope");
  envelope.setAttribute("y", "7");
  envelope.setAttribute("height", "16");
  const paths = ["main", "error", "unknown"].map((kind) => {
    const path = svgElement("path");
    path.setAttribute("class", `trace-line trace-line-${kind}`);
    path.setAttribute("vector-effect", "non-scaling-stroke");
    return path;
  });
  svg.append(envelope, ...paths);
  graph.append(svg);
  const value = element("span", "trace-value");
  node.append(label, graph, value);
  nameButton.setAttribute("aria-haspopup", "dialog");
  graph.setAttribute("aria-haspopup", "dialog");
  const select = () => inspect(state.item, graph);
  graph.addEventListener("click", select);
  let lastLabel = "";
  return {
    node,
    update(next: TraceRowState, domain: TraceDomain, now: number, selected: string) {
      state = next;
      const { item } = state;
      node.dataset.traceKey = item.key;
      node.dataset.kind = item.kind;
      node.dataset.selected = String(item.key === selected);
      node.style.setProperty("--depth", String(state.depth));
      const caption = itemLabel(item);
      if (caption !== lastLabel) {
        name.update({ label: caption });
        lastLabel = caption;
      }
      nameButton.title = caption;
      nameButton.setAttribute("aria-label", `Inspect ${caption}`);
      foldSlot.style.visibility = state.expandable ? "visible" : "hidden";
      fold.update({ label: state.expanded ? "▾" : "▸", disabled: !state.expandable });
      foldButton.setAttribute("aria-label", `${state.expanded ? "Collapse" : "Expand"} ${caption}`);
      foldButton.setAttribute("aria-expanded", String(state.expanded));
      const valueText = itemValue(item, now);
      setText(value, valueText);
      graph.setAttribute("aria-label", `${caption}: ${valueText}`);
      const range = itemRange(item, now);
      const size = Math.max(1, domain.end - domain.start);
      const x = (at: number) => Math.max(0, Math.min(1000, ((at - domain.start) / size) * 1000));
      const visible = (interval: TraceInterval) =>
        interval.start <= domain.end && interval.end >= domain.start;
      const path = (intervals: TraceInterval[], marker = false) =>
        intervals
          .filter(visible)
          .map((interval) => {
            const a = x(interval.start),
              b = x(interval.end);
            if (
              marker ||
              ((interval.end - interval.start) / size) * (graph.clientWidth || 320) < 3
            ) {
              const center = (a + b) / 2;
              return `M${center},13 L${center},17`;
            }
            return `M${a},15 H${b}`;
          })
          .join(" ");
      const data = ["", "", ""];
      let color = "var(--oc-border)";
      if (item.kind === "group") {
        const group = item.entry;
        color = "var(--insight-chart-6)";
        data[0] = path([
          ...group.intervals,
          ...[...group.zeroStarts, ...group.runningStarts.filter((start) => start >= now)].map(
            (start) => ({ start, end: start }),
          ),
        ]);
        data[1] = path(group.errorIntervals);
        data[2] = path(
          group.unknownStarts.map((start) => ({ start, end: start })),
          true,
        );
      } else if (range) {
        color =
          item.kind === "session"
            ? "var(--oc-border)"
            : item.kind === "tool" && item.entry.status === "error"
              ? "var(--oc-error)"
              : item.kind === "tool" && item.entry.name === "execute"
                ? "var(--insight-chart-6)"
                : "var(--insight-chart-5)";
        data[0] = path([range]);
      } else {
        const start =
          item.kind === "tool"
            ? item.entry.startedAt
            : item.kind === "session"
              ? item.model.start
              : undefined;
        if (start !== undefined) data[2] = path([{ start, end: start }], true);
      }
      node.style.setProperty("--trace-color", color);
      paths.forEach((entry, index) => entry.setAttribute("d", data[index]));
      envelope.toggleAttribute("hidden", item.kind !== "group" || !range || !visible(range));
      if (range) {
        envelope.setAttribute("x", String(x(range.start)));
        envelope.setAttribute("width", String(Math.max(0, x(range.end) - x(range.start))));
      }
      graph.dataset.duration = range ? String(range.end - range.start) : "unknown";
    },
    dispose() {
      graph.removeEventListener("click", select);
      fold.dispose();
      name.dispose();
      node.remove();
    },
  };
}
