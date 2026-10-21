import type { ContextSource, SessionInsight } from "@opencode-insight/telemetry/schema";
import { summarizeSession } from "@opencode-insight/telemetry/summary";
import type { PanelState } from "./controller";
import { mountChart } from "./chart";
import { duration, escape, money, number, time } from "./format";

type Tab = "speed" | "token" | "time";
const metric = (label: string, value: string, note = "") =>
  `<div class="metric"><span class="muted">${label}</span><strong>${value}</strong>${note ? `<small class="muted">${note}</small>` : ""}</div>`;

export function sourceGroups(sources: ContextSource[]) {
  const groups = new Map<string, ContextSource[]>();
  for (const source of sources) {
    const group = groups.get(source.kind) ?? [];
    group.push(source);
    groups.set(source.kind, group);
  }
  return [...groups]
    .map(([kind, items]) => ({
      kind,
      items,
      tokens: items.reduce((total, source) => total + source.tokens, 0),
    }))
    .sort((a, b) => b.tokens - a.tokens);
}

function sourcesMarkup(sources: ContextSource[]) {
  const groups = sourceGroups(sources);
  if (!groups.length)
    return '<p class="muted">Input source attribution unavailable. No content was captured for this scope.</p>';
  const max = Math.max(1, ...groups.map((g) => g.tokens));
  return groups
    .map(
      (group) =>
        `<details class="source" data-source="${escape(group.kind)}"><summary><span>${escape(group.kind)}</span><span>${number(group.tokens)} tokens</span><span class="bar-track"><span class="bar" style="width:${(group.tokens / max) * 100}%"></span></span></summary><ul>${group.items
          .map((source) => {
            const label = source.label.trim();
            const name =
              source.kind === "skill" && (!label || /^skill$/i.test(label))
                ? "Unclassified Skill"
                : label || source.kind;
            return `<li><span>${escape(name)} <code>${escape(source.id)}</code></span><span>${number(source.tokens)} · ${escape(source.quality)}</span></li>`;
          })
          .join("")}</ul></details>`,
    )
    .join("");
}

function tokenMarkup(session: SessionInsight, cumulative: boolean) {
  const summary = summarizeSession(session);
  const sources = cumulative ? summary.cumulativeContext : summary.currentContext;
  return `<div class="section-head"><h2>Input composition</h2><label>Scope <select aria-label="Token scope"><option value="current"${!cumulative ? " selected" : ""}>Current context</option><option value="cumulative"${cumulative ? " selected" : ""}>Cumulative (repeated inputs)</option></select></label></div>
    <p class="muted">${cumulative ? "Every captured request input, including repeated context." : "Most recent request input snapshot."} Source attribution is estimated unless marked reported. Expand a source for skill IDs and tools. Source estimates need not equal provider usage.</p>
    ${sourcesMarkup(sources)}
    <h2>Reported cumulative usage</h2><p class="muted">Normalized disjoint input categories; cached tokens are not counted again as uncached input. Output and reasoning are separate from input composition.</p>
    ${session.requests.some((r) => r.usage) ? `<div class="metrics">${metric("Uncached input", number(summary.usage.input))}${metric("Cache read", number(summary.usage.cacheRead))}${metric("Cache write", number(summary.usage.cacheWrite))}${metric("Output", number(summary.usage.output))}${metric("Reasoning", number(summary.usage.reasoning), "Reported only; not a hidden speed estimate")}${metric("Cost", session.requests.some((r) => r.cost !== undefined) ? money(summary.cost) : "Unavailable", "Reported captured requests")}</div>` : '<p class="muted">Provider usage unavailable. Estimated input attribution is not reported output usage.</p>'}`;
}

function timingMarkup(session: SessionInsight) {
  const now = Date.now();
  const summary = summarizeSession(session, now);
  const lanes = [
    ...session.requests.map((request) => ({
      label: `Model request · ${request.model}`,
      id: request.id,
      start: request.startedAt,
      end:
        request.streamedAt ??
        request.endedAt ??
        (request.status === "running" ? now : request.startedAt),
      knownEnd:
        request.endedAt !== undefined ||
        request.streamedAt !== undefined ||
        request.status === "running",
      background: false,
      status: request.status,
    })),
    ...session.tools.map((tool) => ({
      label: `${tool.background ? "Background" : "Blocking"} tool · ${tool.name}`,
      id: tool.id,
      start: tool.startedAt,
      end: tool.endedAt ?? (tool.status === "running" ? now : tool.startedAt),
      knownEnd: tool.endedAt !== undefined || tool.status === "running",
      background: tool.background,
      status: tool.status,
    })),
  ]
    .sort((a, b) => a.start - b.start)
    .slice(-100);
  const start = Math.min(...lanes.map((lane) => lane.start));
  const end = Math.max(start + 1, ...lanes.map((lane) => lane.end));
  return `<h2>Elapsed activity</h2><div class="metrics">${metric("Foreground union", duration(summary.foregroundMs))}${metric("Model intervals", duration(summary.modelMs))}${metric("All tool interval union", duration(summary.toolMs), "Includes background; not additive")}${metric("Background tools", duration(summary.backgroundToolMs), "Separate; not added to foreground")}</div>
    <p class="muted">Foreground is the union of model and blocking-tool intervals, not their sum. Background work can overlap; child-session usage is not merged. Request lanes show elapsed time, including latency, not exclusive model compute.</p>
    ${lanes.length ? `<div class="timeline"><div class="section-head muted"><span>${time(start)}</span><span>${time(end)}</span></div><ol>${lanes.map((lane) => `<li><div class="section-head"><span>${escape(lane.label)}</span><span>${lane.knownEnd ? duration(Math.max(0, lane.end - lane.start)) : "Duration unavailable"} · ${escape(lane.status)}</span></div><code>${escape(lane.id)}</code>${lane.knownEnd ? `<div class="lane-track"><span class="lane ${lane.background ? "background" : ""}" style="margin-left:${((lane.start - start) / (end - start)) * 100}%;width:${Math.max(0.2, ((lane.end - lane.start) / (end - start)) * 100)}%"></span></div>` : ""}</li>`).join("")}</ol></div><p class="muted">Latest ${lanes.length} activity lanes. Parallel lanes are not additive.</p>` : '<p class="muted">No activity intervals captured.</p>'}`;
}

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
    const focusID = active?.id;
    const focusSource = active?.closest<HTMLElement>("details")?.dataset.source;
    const openSources = [...root.querySelectorAll<HTMLDetailsElement>("details[open]")].map(
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
      content = `<div class="metrics top-metrics">${metric("Current context", summary.currentContext.length ? number(summary.currentContext.reduce((sum, source) => sum + source.tokens, 0)) : "Unavailable", "Latest input snapshot · estimated/reported")}${metric("Cumulative tokens", session.requests.some((r) => r.usage) ? number(Object.values(summary.usage).reduce((sum, tokens) => sum + tokens, 0)) : "Unavailable", "Repeated input + cache + output + reasoning")}${metric("Whole-request mean", summary.tps === undefined ? "Unavailable" : `${number(summary.tps)} tokens/s`, "Reported output + reasoning / request elapsed")}${metric("Foreground elapsed", duration(summary.foregroundMs), "Union; background separate")}</div>
        ${summary.capturePartial ? '<p class="notice">Partial capture: totals and timing cover only observed activity.</p>' : ""}
        <div role="tablist" aria-label="Insight views">${(["speed", "token", "time"] as Tab[]).map((name) => `<button role="tab" id="tab-${name}" aria-controls="insight-content" aria-selected="${tab === name}" tabindex="${tab === name ? 0 : -1}" data-tab="${name}">${name[0].toUpperCase() + name.slice(1)}</button>`).join("")}</div>
        <section role="tabpanel" id="insight-content" aria-labelledby="tab-${tab}">${tab === "speed" ? '<div id="speed-chart"></div>' : tab === "token" ? tokenMarkup(session, cumulative) : timingMarkup(session)}</section>`;
    }
    root.innerHTML = `<header class="section-head"><div><h1>Session insight</h1><small class="muted">OpenCode V2 · active session only</small></div><button id="retry" type="button">Retry</button></header>
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
    root.querySelectorAll<HTMLDetailsElement>("details").forEach((el) => {
      el.open = openSources.includes(el.dataset.source);
    });
    if (focusLabel) {
      const element = [...root.querySelectorAll<HTMLElement>("[aria-label]")].find(
        (el) => el.getAttribute("aria-label") === focusLabel,
      );
      element?.focus();
    } else if (focusTab) root.querySelector<HTMLElement>(`[data-tab="${focusTab}"]`)?.focus();
    else if (focusID === "retry") root.querySelector<HTMLElement>("#retry")?.focus();
    else if (focusSource)
      root.querySelector<HTMLElement>(`details[data-source="${focusSource}"] summary`)?.focus();
  }
  return { render };
}
