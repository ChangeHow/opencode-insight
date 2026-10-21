import type { ContextSource } from "@opencode-insight/telemetry/schema";
import { element, setText, syncChildren } from "./dom";
import { number } from "./format";

type Group = { kind: ContextSource["kind"]; label: string; items: ContextSource[] };

export function createSourceDetails(root: HTMLElement) {
  const details = element("details", "source");
  details.dataset.source = "attribution";
  details.append(element("summary", "", "Source details"));
  const content = element("div");
  details.append(content);
  root.append(details);
  const groups = new Map<
    ContextSource["kind"],
    {
      node: HTMLElement;
      title: HTMLElement;
      list: HTMLElement;
      rows: Map<string, ReturnType<typeof createRow>>;
    }
  >();
  function createRow() {
    const node = element("li");
    const identity = element("span");
    const name = element("span");
    const id = element("code");
    identity.append(name, document.createTextNode(" "), id);
    const value = element("span");
    node.append(identity, value);
    return { node, name, id, value };
  }
  return {
    reset() {
      details.open = false;
    },
    update(input: Group[]) {
      details.hidden = !input.length;
      const active = new Set(input.map((group) => group.kind));
      for (const key of groups.keys()) if (!active.has(key)) groups.delete(key);
      syncChildren(
        content,
        input.map((group) => {
          let current = groups.get(group.kind);
          if (!current) {
            const node = element("section");
            const title = element("h3");
            const list = element("ul");
            node.append(title, list);
            current = { node, title, list, rows: new Map() };
            groups.set(group.kind, current);
          }
          setText(current.title, group.label);
          const seen = new Map<string, number>();
          const keys = new Set<string>();
          const nodes = group.items.map((source) => {
            const count = seen.get(source.id) ?? 0;
            seen.set(source.id, count + 1);
            const key = `${source.id}\0${count}`;
            keys.add(key);
            const row = current.rows.get(key) ?? createRow();
            current.rows.set(key, row);
            const label = source.label.trim();
            setText(
              row.name,
              source.kind === "skill" && (!label || /^skill$/i.test(label))
                ? "Unclassified Skill"
                : label || group.label,
            );
            setText(row.id, source.id);
            setText(row.value, `${number(source.tokens)} · ${source.quality}`);
            return row.node;
          });
          for (const key of current.rows.keys()) if (!keys.has(key)) current.rows.delete(key);
          syncChildren(current.list, nodes);
          return current.node;
        }),
      );
    },
  };
}
