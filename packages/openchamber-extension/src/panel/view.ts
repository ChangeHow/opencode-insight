import { summarizeSession } from "@opencode-insight/telemetry/summary";
import type { PanelState } from "./controller";
import { mountChart } from "./chart";
import { bindPhaseInspection, metric, timingMarkup, tokenMarkup } from "./breakdown-view";
import { duration, escape, number } from "./format";

type Tab = "speed" | "token" | "time";

export function createPanelView(root: HTMLElement, retry: () => void) {
  let tab: Tab = "speed";
  let cumulative = false;
  let latest: PanelState;
  let target = "";
  function render(state: PanelState) {
    latest = state;
    const key = `${state.directory}\0${state.sessionID}`;
    const changedTarget = target !== key;
    if (changedTarget) {
      target = key;
      cumulative = false;
    }
    const active = root.contains(document.activeElement)
      ? (document.activeElement as HTMLElement)
      : null;
    const focusLabel = active?.getAttribute("aria-label");
    const focusTab = active?.dataset.tab;
    const focusPhase = active?.dataset.phase;
    const focusPhaseSegment = active?.classList.contains("phase-segment");
    const focusID = active?.id;
    const focusSource = active?.closest<HTMLElement>("details")?.dataset.source;
    const openSources = changedTarget
      ? []
      : [...root.querySelectorAll<HTMLDetailsElement>("details[open]")].map(
          (el) => el.dataset.source,
        );
    const inspectedAt = changedTarget
      ? undefined
      : root.querySelector<HTMLElement>("#speed-chart")?.dataset.inspectedAt;
    const session = state.session;
    let content: string;
    if (!state.sessionID)
      content =
        '<p class="empty">Select an active OpenCode session to inspect local telemetry.</p>';
    else if (!state.directory)
      content =
        '<p class="empty">Session location unavailable. Select a local project directory.</p>';
    else if (!session)
      content = `<p class="empty">${state.loading ? "Loading local session telemetry…" : "Telemetry unavailable. The local service must verify this session location."}</p>`;
    else if (!session.requests.length && !session.tools.length)
      content =
        '<p class="empty">No telemetry captured for this session yet. Start a model request with the capture plugin enabled.</p>';
    else {
      const summary = summarizeSession(session);
      content = `<div class="metrics top-metrics">${metric("Current context", summary.currentContext.length ? number(summary.currentContext.reduce((sum, source) => sum + source.tokens, 0)) : "Unavailable", "Latest input snapshot · estimated/reported.")}${metric("Cumulative tokens", session.requests.some((request) => request.usage) ? number(Object.values(summary.usage).reduce((sum, tokens) => sum + tokens, 0)) : "Unavailable", "Reported repeated input + cache + output + reasoning.")}${metric("Request mean", summary.tps === undefined ? "Unavailable" : `${number(summary.tps)} tokens/s`, "Reported output + reasoning / whole request elapsed.")}${metric("Foreground", duration(summary.foregroundMs), "Union of model and blocking tools; background separate.")}</div>
        ${summary.capturePartial ? '<span class="badge" title="Totals and timing cover only observed activity.">Partial capture</span>' : ""}
        <div role="tablist" aria-label="Insight views">${(["speed", "token", "time"] as Tab[]).map((name) => `<button role="tab" id="tab-${name}" aria-controls="insight-content" aria-selected="${tab === name}" tabindex="${tab === name ? 0 : -1}" data-tab="${name}">${name[0].toUpperCase() + name.slice(1)}</button>`).join("")}</div>
        <section role="tabpanel" id="insight-content" aria-labelledby="tab-${tab}">${tab === "speed" ? '<div id="speed-chart"></div>' : tab === "token" ? tokenMarkup(session, cumulative) : timingMarkup(session)}</section>`;
    }
    root.innerHTML = `<header class="section-head"><h1>Session insight</h1><button id="retry" type="button">Retry</button></header>
      ${state.error ? `<div class="notice error" role="alert">${escape(state.error)}${session ? " Previous captured data is retained; it may be stale." : ""}</div>` : ""}
      ${content}`;
    root.querySelector("#retry")?.addEventListener("click", retry);
    root.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        tab = button.dataset.tab as Tab;
        render(latest);
      });
      button.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const tabs: Tab[] = ["speed", "token", "time"];
        tab = tabs[(tabs.indexOf(tab) + (event.key === "ArrowRight" ? 1 : 2)) % 3];
        render(latest);
        root.querySelector<HTMLButtonElement>(`[data-tab="${tab}"]`)?.focus();
      });
    });
    root.querySelector<HTMLSelectElement>("select")?.addEventListener("change", (event) => {
      cumulative = (event.target as HTMLSelectElement).value === "cumulative";
      render(latest);
    });
    const chart = root.querySelector<HTMLElement>("#speed-chart");
    if (chart)
      mountChart(
        chart,
        state.series?.points ?? [],
        session,
        inspectedAt === undefined ? undefined : Number(inspectedAt),
      );
    bindPhaseInspection(root);
    root.querySelectorAll<HTMLDetailsElement>("details").forEach((el) => {
      el.open = openSources.includes(el.dataset.source);
    });
    if (focusPhase) {
      root
        .querySelector<HTMLElement>(
          `${focusPhaseSegment ? ".phase-segment" : ".legend-row"}[data-phase="${focusPhase}"]`,
        )
        ?.focus();
    } else if (focusLabel) {
      [...root.querySelectorAll<HTMLElement>("[aria-label]")]
        .find((el) => el.getAttribute("aria-label") === focusLabel)
        ?.focus();
    } else if (focusTab) root.querySelector<HTMLElement>(`[data-tab="${focusTab}"]`)?.focus();
    else if (focusID === "retry") root.querySelector<HTMLElement>("#retry")?.focus();
    else if (focusSource)
      root.querySelector<HTMLElement>(`details[data-source="${focusSource}"] summary`)?.focus();
  }
  return { render };
}
