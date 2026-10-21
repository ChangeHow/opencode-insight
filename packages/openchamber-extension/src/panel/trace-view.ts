import { mountBadge, mountButton } from "@openchamber/sdk/ui";
import type { SessionInsight } from "@opencode-insight/telemetry/schema";
import { advanceTraceClock, createTraceModel } from "./trace-model";
import type { TraceModel, TraceRequest } from "./trace-model";
import { createTraceInspector } from "./trace-inspector";
import {
  createTracePager,
  clampTracePage,
  lastTracePage,
  TRACE_PAGE_SIZE as PAGE_SIZE,
} from "./trace-pager";
import { axisOffset, itemRange } from "./trace-presentation";
import type { TraceItem } from "./trace-presentation";
import { createTraceRow } from "./trace-row";
import type { TraceRowState } from "./trace-row";
import { element, setText, syncChildren } from "./dom";
import { duration, money, number } from "./format";

const requestKey = (id: string) => `request:${id}`;
const groupKey = (owner: TraceRequest, name: string) => `group:${owner.id}:${name}`;

export function createTraceView(root: HTMLElement) {
  const container = element("section", "trace-view");
  container.setAttribute("aria-label", "Request and tool waterfall");
  const heading = element("div", "section-head");
  const liveSlot = element("span");
  heading.append(element("h3", "", "Request & tool trace"), liveSlot);
  const live = mountBadge(liveSlot, { label: "Captured", tone: "neutral" });
  const stats = element("div", "trace-stats");
  const labels = [
    "Captured span",
    "Reported cost",
    "Reported tokens",
    "Model requests",
    "Native tools",
    "Error spans",
  ];
  const metrics = labels.map((label) => {
    const node = element("div");
    const value = element("strong");
    node.append(element("span", "muted", label), value);
    stats.append(node);
    return { node, value };
  });
  metrics[5].node.title =
    "Captured request/tool spans marked error; not deduplicated incidents. Reported Code Mode child calls are excluded.";
  const toolbar = element("div", "trace-toolbar");
  const controls = element("div", "trace-controls");
  const windowLabel = element("span", "muted trace-window");
  toolbar.append(controls, windowLabel);
  const scroll = element("div", "trace-scroll");
  scroll.setAttribute("aria-label", "Trace rows");
  const axis = element("div", "trace-axis");
  const ticks = element("div", "trace-ticks");
  const tickLabels = Array.from({ length: 4 }, () => element("span"));
  ticks.append(...tickLabels);
  axis.append(element("span", "", "SPAN"), ticks, element("span", "", "Duration / U"));
  const rowsSlot = element("div", "trace-rows");
  scroll.append(axis, rowsSlot);
  const footer = element("div", "trace-footer");
  const rowCount = element("span", "muted");
  footer.append(rowCount);
  const note = element(
    "p",
    "trace-note muted",
    "U = execution union. Click a span for details. Overlapping row durations must not be added together.",
  );
  container.append(heading, stats, toolbar, scroll, footer, note);
  root.append(container);
  let session: SessionInsight | undefined;
  let cached: TraceModel | undefined;
  let revision = -1;
  let now = Date.now();
  let model: TraceModel;
  let selected = "session";
  let zoomed: string | undefined;
  let sessionOpen = true;
  let openRequest: string | undefined;
  let openGroup: string | undefined;
  let requestPage = 0;
  let groupPage = 0;
  let callPage = 0;
  let disposed = false;
  const items = new Map<string, TraceItem>();
  const rows = new Map<string, ReturnType<typeof createTraceRow>>();
  const inspector = createTraceInspector(container);
  function button(label: string, onClick: () => void) {
    const slot = element("span");
    controls.append(slot);
    return mountButton(slot, { label, size: "xs", variant: "ghost", onClick });
  }
  const expand = button("Show tools", () => {
    const item = items.get(selected);
    const owner =
      item?.kind === "request"
        ? item.entry
        : item?.kind === "tool" || item?.kind === "group"
          ? item.owner
          : model.requests.find((entry) => entry.groups.length);
    if (!owner) return;
    sessionOpen = true;
    requestPage = Math.floor(model.requests.indexOf(owner) / PAGE_SIZE);
    openRequest = owner.id;
    groupPage = callPage = 0;
    if (item?.kind === "group") openGroup = item.entry.name;
    render();
  });
  const collapse = button("Collapse requests", () => {
    openRequest = openGroup = undefined;
    render();
  });
  const zoom = button("Zoom selected", () => {
    zoomed = selected;
    render();
  });
  const resetZoom = button("Full session", () => {
    zoomed = undefined;
    render();
  });
  function pager(label: string, changed: (page: number) => void) {
    return createTracePager(label, (page) => {
      changed(page);
      render();
    });
  }
  const showRequests = (page: number) => {
    requestPage = page;
    openRequest = openGroup = undefined;
    scroll.scrollTop = 0;
  };
  const requestsPager = pager("requests", showRequests);
  const groupsPager = pager("tool groups", (page) => {
    groupPage = page;
    openGroup = undefined;
  });
  const callsPager = pager("calls", (page) => {
    callPage = page;
  });
  footer.append(requestsPager.node);
  const latestSlot = element("span");
  footer.append(latestSlot);
  const latest = mountButton(latestSlot, {
    label: "Latest requests",
    size: "xs",
    variant: "ghost",
    onClick: () => {
      showRequests(lastTracePage(model.requests.length));
      render();
    },
  });
  function select(item: TraceItem, trigger: HTMLElement) {
    selected = item.key;
    render();
    inspector.show(trigger);
  }
  function toggle(item: TraceItem) {
    if (item.kind === "session") sessionOpen = !sessionOpen;
    else if (item.kind === "request") {
      openRequest = openRequest === item.entry.id ? undefined : item.entry.id;
      openGroup = undefined;
      groupPage = callPage = 0;
    } else if (item.kind === "group") {
      openGroup = openGroup === item.entry.name ? undefined : item.entry.name;
      callPage = 0;
    }
    render();
  }
  const pageOf = <T>(list: T[], page: number) =>
    list.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  function render() {
    if (disposed || !cached || !session) return;
    model = advanceTraceClock(cached, now);
    items.clear();
    const rootItem: TraceItem = {
      key: "session",
      kind: "session",
      model,
      sessionID: session.sessionID,
    };
    items.set(rootItem.key, rootItem);
    for (const entry of model.requests) {
      items.set(requestKey(entry.id), { key: requestKey(entry.id), kind: "request", entry });
      for (const group of entry.groups) {
        const key = groupKey(entry, group.name);
        items.set(key, { key, kind: "group", entry: group, owner: entry });
        for (const tool of group.tools)
          items.set(`tool:${tool.id}`, {
            key: `tool:${tool.id}`,
            kind: "tool",
            entry: tool,
            owner: entry,
          });
      }
    }
    const active = items.get(selected) ?? rootItem;
    selected = active.key;
    inspector.update(active, model, now);
    const target = zoomed ? items.get(zoomed) : undefined;
    const range = target ? itemRange(target, now) : undefined;
    if (zoomed && !range) zoomed = undefined;
    const padding = range
      ? Math.max(
          target?.kind === "tool" ? 50 : 200,
          (range.end - range.start) * (target?.kind === "tool" ? 2 : 0.08),
        )
      : 0;
    const start = range ? Math.max(model.start, range.start - padding) : model.start;
    const end = Math.max(
      start + 1,
      range ? Math.min(model.end, range.end + padding) : Math.max(model.end, start + 1000),
    );
    const domain = { start, end };
    tickLabels.forEach((tick, index) =>
      setText(
        tick,
        `+${axisOffset(start - model.start + ((end - start) * index) / 3, end - start)}`,
      ),
    );
    setText(
      windowLabel,
      `${zoomed ? "Zoom · " : ""}+${axisOffset(start - model.start, end - start)}–${axisOffset(end - model.start, end - start)}`,
    );
    resetZoom.update({ disabled: !zoomed });
    zoom.update({ disabled: !itemRange(active, now) });
    const summary = model.summary;
    const totals = [
      model.elapsedMs === undefined ? "Unavailable" : duration(model.elapsedMs),
      summary.cost === undefined ? "Unavailable" : money(summary.cost),
      summary.tokens === undefined ? "Unavailable" : number(summary.tokens),
      number(summary.requestCount),
      number(summary.toolCount),
      number(summary.errorCount),
    ];
    totals.forEach((value, index) => setText(metrics[index].value, value));
    metrics[1].node.title = summary.partialCost
      ? "Only some captured requests report cost; not a complete session bill."
      : "Reported request cost only; tool and child-session costs are not inferred.";
    metrics[2].node.title = summary.partialUsage
      ? "Only some captured requests report usage."
      : "Normalized reported request input, cache, output and reasoning; no estimated result tokens added.";
    live.update({
      label: model.running ? "Live" : "Captured",
      tone: model.running ? "info" : "neutral",
    });
    requestPage = clampTracePage(requestPage, model.requests.length);
    requestsPager.update(requestPage, model.requests.length);
    latest.update({ disabled: requestPage === lastTracePage(model.requests.length) });
    const visible: Array<TraceRowState | HTMLElement> = [
      { item: rootItem, depth: 0, expandable: true, expanded: sessionOpen },
    ];
    if (sessionOpen)
      for (const owner of pageOf(model.requests, requestPage)) {
        const item = items.get(requestKey(owner.id))!;
        visible.push({
          item,
          depth: 1,
          expandable: !!owner.groups.length,
          expanded: openRequest === owner.id,
        });
        if (openRequest !== owner.id) continue;
        groupPage = clampTracePage(groupPage, owner.groups.length);
        groupsPager.update(groupPage, owner.groups.length);
        for (const group of pageOf(owner.groups, groupPage)) {
          if (group.tools.length === 1) {
            const tool = group.tools[0];
            visible.push({
              item: items.get(`tool:${tool.id}`)!,
              depth: 2,
              expandable: false,
              expanded: false,
            });
          } else {
            visible.push({
              item: items.get(groupKey(owner, group.name))!,
              depth: 2,
              expandable: true,
              expanded: openGroup === group.name,
            });
            if (openGroup !== group.name) continue;
            callPage = clampTracePage(callPage, group.tools.length);
            callsPager.update(callPage, group.tools.length);
            for (const tool of pageOf(group.tools, callPage))
              visible.push({
                item: items.get(`tool:${tool.id}`)!,
                depth: 3,
                expandable: false,
                expanded: false,
              });
            visible.push(callsPager.node);
          }
        }
        visible.push(groupsPager.node);
      }
    const activeKeys = new Set<string>();
    const nodes = visible.map((state) => {
      if (state instanceof HTMLElement) return state;
      activeKeys.add(state.item.key);
      const row = rows.get(state.item.key) ?? createTraceRow(select, toggle);
      rows.set(state.item.key, row);
      row.update(state, domain, now, selected);
      return row.node;
    });
    for (const [key, row] of rows)
      if (!activeKeys.has(key)) {
        row.dispose();
        rows.delete(key);
      }
    syncChildren(rowsSlot, nodes);
    setText(
      rowCount,
      `${activeKeys.size} visible rows · ${number(summary.toolCount)} native calls`,
    );
    container.dataset.visibleRows = String(activeKeys.size);
    container.dataset.zoomed = zoomed ?? "";
    inspector.refresh();
    expand.update({ disabled: !model.requests.some((entry) => entry.groups.length) });
  }
  const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(render);
  observer?.observe(scroll);
  return {
    update(next: SessionInsight, at = Date.now()) {
      now = at;
      if (
        !session ||
        session.sessionID !== next.sessionID ||
        session.directory !== next.directory
      ) {
        cached = undefined;
        revision = -1;
      }
      session = next;
      if (!cached || revision !== next.revision) {
        cached = createTraceModel(next, now);
        if (revision === -1) requestPage = lastTracePage(cached.requests.length);
        revision = next.revision;
      }
      render();
    },
    reset() {
      session = undefined;
      cached = undefined;
      revision = -1;
      selected = "session";
      zoomed = openRequest = openGroup = undefined;
      sessionOpen = true;
      requestPage = groupPage = callPage = 0;
      inspector.reset();
    },
    dispose() {
      disposed = true;
      observer?.disconnect();
      rows.forEach((row) => row.dispose());
      inspector.dispose();
      live.dispose();
      [expand, collapse, zoom, resetZoom, latest].forEach((control) => control.dispose());
      [requestsPager, groupsPager, callsPager].forEach((control) => control.dispose());
      container.remove();
    },
  };
}
