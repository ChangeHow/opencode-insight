import type { ToolInsight } from "@opencode-insight/telemetry/schema";
import { summarizeReportedCalls } from "@opencode-insight/telemetry/summary";
import { element, setText, syncChildren } from "./dom";

export function createReportedCalls(root: HTMLElement) {
  const details = element("details", "source");
  details.dataset.source = "reported-calls";
  details.append(element("summary", "", "Reported tool calls"));
  const note = element("p", "muted", "Per-call timing unavailable");
  const content = element("div");
  details.append(note, content);
  root.append(details);
  const parents = new Map<string, ReturnType<typeof createParent>>();
  function createParent() {
    const node = element("section");
    const title = element("h3");
    const list = element("ul");
    const truncated = element("small", "muted", "Details truncated");
    node.append(title, list, truncated);
    return { node, title, list, truncated, rows: new Map<string, HTMLElement>() };
  }
  return {
    reset() {
      details.open = false;
    },
    update(tools: ToolInsight[]) {
      const reported = tools.filter((tool) => tool.reportedCalls?.length);
      details.hidden = !reported.length;
      const ids = new Set(reported.map((tool) => tool.id));
      for (const id of parents.keys()) if (!ids.has(id)) parents.delete(id);
      syncChildren(
        content,
        reported.map((tool) => {
          const parent = parents.get(tool.id) ?? createParent();
          parents.set(tool.id, parent);
          setText(parent.title, tool.name);
          parent.truncated.hidden = !tool.reportedCallsTruncated;
          const keys = new Set<string>();
          const nodes = summarizeReportedCalls(tool.reportedCalls).map((call) => {
            const key = `${call.name}\0${call.status}`;
            keys.add(key);
            const row = parent.rows.get(key) ?? element("li");
            parent.rows.set(key, row);
            setText(row, `${call.name} ×${call.count} · ${call.status}`);
            return row;
          });
          for (const key of parent.rows.keys()) if (!keys.has(key)) parent.rows.delete(key);
          syncChildren(parent.list, nodes);
          return parent.node;
        }),
      );
    },
  };
}
