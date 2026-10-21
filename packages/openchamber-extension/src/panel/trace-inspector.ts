import { mountBadge, mountButton } from "@openchamber/sdk/ui";
import { summarizeReportedCalls } from "@opencode-insight/telemetry/summary";
import type { ToolInsight } from "@opencode-insight/telemetry/schema";
import type { TraceModel } from "./trace-model";
import { describeItem } from "./trace-presentation";
import type { TraceItem } from "./trace-presentation";
import { element, setText, syncChildren } from "./dom";
import { createTracePager, clampTracePage, TRACE_PAGE_SIZE as PAGE_SIZE } from "./trace-pager";

export function createTraceInspector(root: HTMLElement) {
  const panel = element("section", "trace-inspector");
  panel.setAttribute("aria-label", "Selected trace span");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("popover", "auto");
  panel.dataset.open = "false";
  const header = element("div", "section-head");
  const title = element("h3");
  const statusSlot = element("span");
  const status = mountBadge(statusSlot, { label: "Captured", tone: "neutral" });
  const closeSlot = element("span");
  header.append(title, statusSlot, closeSlot);
  let trigger: HTMLElement | undefined;
  const hide = () => {
    panel.hidePopover();
    panel.dataset.open = "false";
  };
  const close = () => {
    hide();
    trigger?.focus({ preventScroll: true });
  };
  const dismiss = mountButton(closeSlot, {
    label: "×",
    size: "xs",
    variant: "ghost",
    onClick: close,
  });
  const closeButton = closeSlot.querySelector("button")!;
  closeButton.setAttribute("aria-label", "Close span details");
  const onToggle = (event: Event) => {
    panel.dataset.open = String((event as ToggleEvent).newState === "open");
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };
  panel.addEventListener("toggle", onToggle);
  panel.addEventListener("keydown", onKey);
  const onViewportChange = (event: Event) => {
    if (!(event.target instanceof Node) || !panel.contains(event.target)) hide();
  };
  window.addEventListener("scroll", onViewportChange, true);
  window.addEventListener("resize", onViewportChange);
  function position() {
    if (panel.dataset.open !== "true") return;
    if (!trigger?.isConnected) {
      hide();
      return;
    }
    const anchor = (
      trigger.closest(".trace-row")?.querySelector(".trace-plot") ?? trigger
    ).getBoundingClientRect();
    const { width, height } = panel.getBoundingClientRect();
    const below = innerHeight - anchor.bottom - 20;
    const above = anchor.top - 20;
    const top = below >= height || below >= above ? anchor.bottom + 8 : anchor.top - height - 8;
    panel.style.left = `${Math.max(12, Math.min(anchor.left, innerWidth - width - 12))}px`;
    panel.style.top = `${Math.max(12, Math.min(top, innerHeight - height - 12))}px`;
  }
  const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(position);
  observer?.observe(panel);
  const id = element("div", "trace-id muted");
  const fields = element("dl", "trace-fields");
  const reported = element("section", "source trace-reported");
  reported.dataset.source = "reported-calls";
  reported.setAttribute("aria-label", "Reported tool calls");
  reported.append(element("div", "muted", "Reported tool calls"));
  const list = element("ul");
  const truncated = element("small", "muted", "Details truncated");
  panel.append(header, id, fields, reported);
  root.append(panel);
  let key = "";
  let page = 0;
  let tool: ToolInsight | undefined;
  const values = new Map<string, { node: HTMLElement; value: HTMLElement }>();
  const records = new Map<string, HTMLElement>();
  const pager = createTracePager("summaries", (next) => {
    page = next;
    renderReported();
  });
  reported.append(list, truncated, pager.node);
  function renderReported() {
    const groups = summarizeReportedCalls(tool?.reportedCalls);
    reported.hidden = !groups.length;
    page = clampTracePage(page, groups.length);
    const visible = groups.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const active = new Set<string>();
    syncChildren(
      list,
      visible.map((group) => {
        const id = `${group.name}\0${group.status}`;
        active.add(id);
        const row = records.get(id) ?? element("li");
        records.set(id, row);
        setText(row, `${group.name} ×${group.count} · ${group.status}`);
        return row;
      }),
    );
    for (const id of records.keys()) if (!active.has(id)) records.delete(id);
    truncated.hidden = !tool?.reportedCallsTruncated;
    pager.update(page, groups.length);
  }
  return {
    update(item: TraceItem, model: TraceModel, now: number) {
      if (key !== item.key) {
        key = item.key;
        page = 0;
      }
      const info = describeItem(item, model, now);
      setText(title, info.label);
      setText(id, info.id);
      id.title = info.id;
      const tone =
        info.status === "error"
          ? "error"
          : info.status === "running" || info.status === "Live"
            ? "info"
            : "neutral";
      status.update({ label: info.status, tone });
      const active = new Set<string>();
      syncChildren(
        fields,
        info.fields.map(([label, value]) => {
          active.add(label);
          let field = values.get(label);
          if (!field) {
            const node = element("div");
            const output = element("dd");
            node.append(element("dt", "muted", label), output);
            field = { node, value: output };
            values.set(label, field);
          }
          setText(field.value, value);
          field.value.title = value;
          return field.node;
        }),
      );
      for (const label of values.keys()) if (!active.has(label)) values.delete(label);
      tool = info.reported;
      renderReported();
    },
    show(source: HTMLElement) {
      trigger = source;
      panel.togglePopover(true);
      panel.dataset.open = "true";
      position();
      closeButton.focus({ preventScroll: true });
    },
    refresh: position,
    reset() {
      hide();
      trigger = undefined;
      key = "";
      page = 0;
    },
    dispose() {
      panel.removeEventListener("toggle", onToggle);
      panel.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
      observer?.disconnect();
      dismiss.dispose();
      status.dispose();
      pager.dispose();
      panel.remove();
    },
  };
}
