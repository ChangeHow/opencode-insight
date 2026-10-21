import { mountBadge, mountButton, mountEmpty } from "@openchamber/sdk/ui";
import type { SessionInsight } from "@opencode-insight/telemetry/schema";
import { phaseBreakdown } from "@opencode-insight/telemetry/summary";
import { element, setText } from "./dom";
import { duration, number } from "./format";
import { phaseColors } from "./theme";
import { createReportedCalls } from "./reported-calls";

type Phase = ReturnType<typeof phaseBreakdown>["phases"][number];
const percent = (share: number) => `${number(share * 100)}%`;

export function createTimingView(root: HTMLElement) {
  const header = element("div", "section-head");
  const total = element("strong");
  total.title = "Union of model and blocking-tool intervals; phases are mutually exclusive.";
  header.append(element("h2", "", "Foreground phases"), total);
  const stack = element("div", "phase-stack");
  stack.setAttribute("aria-label", "Foreground phase distribution");
  const legend = element("div", "phase-legend");
  const emptySlot = element("div");
  const metadata = element("div", "timing-meta");
  const background = element("span");
  background.title =
    "Separate background-tool union; not added to foreground. Child-session usage is not merged.";
  const unknownSlot = element("span");
  unknownSlot.title =
    "Closed activity without captured endpoints is excluded from measured duration.";
  metadata.append(background, unknownSlot);
  const callsSlot = element("div");
  root.append(header, stack, legend, emptySlot, metadata, callsSlot);
  const calls = createReportedCalls(callsSlot);
  const unknown = mountBadge(unknownSlot, { label: "Duration unavailable", tone: "neutral" });
  const empty = mountEmpty(emptySlot, { title: "No measured foreground intervals." });
  let selected: Phase["id"] | undefined;
  const rows = new Map<Phase["id"], ReturnType<typeof createRow>>();
  function inspect(id?: Phase["id"]) {
    selected = id;
    for (const row of rows.values())
      row.tip.hidden = row.phase.id !== selected || row.phase.ms <= 0;
  }
  function createRow(initial: Phase) {
    let phase = initial;
    const segment = element("button", "phase-segment");
    segment.type = "button";
    segment.dataset.phase = phase.id;
    segment.style.setProperty("--color", phaseColors[phase.id]);
    const item = element("div", "phase-item");
    const labelRow = element("div", "phase-label-row");
    const dot = element("span", "dot");
    dot.style.setProperty("--color", phaseColors[phase.id]);
    dot.setAttribute("aria-hidden", "true");
    const slot = element("div");
    const elapsed = element("strong");
    const share = element("span", "muted");
    labelRow.append(dot, slot, elapsed, share);
    const control = mountButton(slot, {
      label: phase.label,
      variant: "ghost",
      size: "sm",
      onClick: () => inspect(phase.id),
    });
    const button = slot.querySelector("button")!;
    button.dataset.phase = phase.id;
    const tip = element("div", "phase-tip");
    tip.id = `phase-${phase.id}`;
    tip.setAttribute("role", "tooltip");
    tip.hidden = true;
    const tipValue = element("strong");
    const definition = element("div");
    tip.append(tipValue, definition);
    item.append(labelRow, tip);
    stack.append(segment);
    legend.append(item);
    const listeners: Array<() => void> = [];
    for (const node of [segment, button]) {
      node.setAttribute("aria-describedby", tip.id);
      const show = () => inspect(phase.id);
      const hide = () => inspect();
      const keydown = (event: KeyboardEvent) => {
        if (event.key === "Escape") inspect();
      };
      node.addEventListener("pointerenter", show);
      node.addEventListener("pointerleave", hide);
      node.addEventListener("focus", show);
      node.addEventListener("blur", hide);
      node.addEventListener("keydown", keydown);
      listeners.push(() => {
        node.removeEventListener("pointerenter", show);
        node.removeEventListener("pointerleave", hide);
        node.removeEventListener("focus", show);
        node.removeEventListener("blur", hide);
        node.removeEventListener("keydown", keydown);
      });
    }
    const click = () => inspect(phase.id);
    segment.addEventListener("click", click);
    return {
      get phase() {
        return phase;
      },
      segment,
      tip,
      update(next: Phase) {
        phase = next;
        segment.hidden = item.hidden = phase.ms <= 0;
        segment.style.flexGrow = String(phase.share);
        segment.setAttribute(
          "aria-label",
          `${phase.label}: ${duration(phase.ms)}, ${percent(phase.share)}`,
        );
        setText(elapsed, duration(phase.ms));
        setText(share, percent(phase.share));
        setText(
          tipValue,
          `${phase.label} · ${duration(phase.ms)} · ${percent(phase.share)} · ${number(phase.count)} activities`,
        );
        setText(definition, phase.description);
      },
      dispose() {
        for (const remove of listeners) remove();
        segment.removeEventListener("click", click);
        control.dispose();
      },
    };
  }
  return {
    update(session: SessionInsight) {
      const result = phaseBreakdown(session);
      setText(total, duration(result.totalMs));
      stack.hidden = legend.hidden = !result.totalMs;
      emptySlot.hidden = !!result.totalMs;
      result.phases.forEach((phase) => {
        const row = rows.get(phase.id) ?? createRow(phase);
        rows.set(phase.id, row);
        row.update(phase);
      });
      inspect(selected);
      setText(background, `Background ${duration(result.backgroundMs)}`);
      unknownSlot.hidden = !result.unknownCount;
      unknown.update({ label: `Duration unavailable · ${result.unknownCount}` });
      calls.update(session.tools);
    },
    reset() {
      inspect();
      calls.reset();
    },
    dispose() {
      rows.forEach((row) => row.dispose());
      unknown.dispose();
      empty.dispose();
      root.replaceChildren();
    },
  };
}
