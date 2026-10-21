import { element, setText, syncChildren } from "./dom";
import { number } from "./format";

interface Slice {
  id: string;
  label: string;
  color: string;
  tokens: number;
  share: number;
}

export function createComposition(root: HTMLElement, label: string) {
  const composition = element("div", "composition");
  const donut = element("div", "donut");
  donut.setAttribute("role", "img");
  const center = element("div");
  const total = element("strong");
  center.append(total, element("span", "muted", "tokens"));
  donut.append(center);
  const legend = element("div", "composition-legend");
  composition.append(donut, legend);
  root.append(composition);
  const rows = new Map<string, ReturnType<typeof createRow>>();
  function createRow() {
    const node = element("div", "legend-row");
    const dot = element("span", "dot");
    dot.setAttribute("aria-hidden", "true");
    const name = element("span");
    const value = element("strong");
    const share = element("span", "muted");
    node.append(dot, name, value, share);
    return { node, dot, name, value, share };
  }
  return {
    update(slices: Slice[]) {
      const tokens = slices.reduce((sum, slice) => sum + slice.tokens, 0);
      setText(total, number(tokens));
      donut.setAttribute("aria-label", `${label}: ${number(tokens)} tokens`);
      let offset = 0;
      const arcs = slices
        .filter((slice) => slice.share > 0)
        .map((slice) => {
          const start = offset;
          offset += slice.share * 100;
          return `${slice.color} ${start}% ${offset}%`;
        });
      donut.style.setProperty(
        "--slices",
        arcs.length ? arcs.join(",") : "var(--oc-subtle) 0% 100%",
      );
      const active = new Set(slices.map((slice) => slice.id));
      for (const key of rows.keys()) if (!active.has(key)) rows.delete(key);
      syncChildren(
        legend,
        slices.map((slice) => {
          const row = rows.get(slice.id) ?? createRow();
          rows.set(slice.id, row);
          row.dot.style.setProperty("--color", slice.color);
          setText(row.name, slice.label);
          setText(row.value, number(slice.tokens));
          setText(row.share, `${number(slice.share * 100)}%`);
          return row.node;
        }),
      );
    },
  };
}
