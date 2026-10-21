import type { SessionInsight } from "@opencode-insight/telemetry/schema";
import {
  phaseBreakdown,
  summarizeReportedCalls,
  summarizeSession,
  tokenBreakdown,
} from "@opencode-insight/telemetry/summary";
import { duration, escape, money, number } from "./format";

export const metric = (label: string, value: string, description = "") =>
  `<div class="metric"${description ? ` title="${escape(description)}"` : ""}><span class="muted">${label}</span><strong>${value}</strong></div>`;
const percent = (share: number) => `${number(share * 100)}%`;

function compositionMarkup(
  entries: { label: string; color: string; tokens: number; share: number }[],
  label: string,
  badge = "",
) {
  const total = entries.reduce((sum, entry) => sum + entry.tokens, 0);
  let offset = 0;
  const arcs = entries.map((entry) => {
    const start = offset;
    offset += entry.share * 100;
    return `${entry.color} ${start}% ${offset}%`;
  });
  return `<div class="composition"><div class="donut" role="img" aria-label="${escape(label)}: ${number(total)} tokens" style="--slices:${total ? arcs.join(",") : "var(--oc-muted-surface, ButtonFace) 0% 100%"}"><div><strong>${number(total)}</strong><span class="muted">tokens</span></div></div><div class="composition-legend">${entries.map((entry) => `<div class="legend-row"><span class="dot" style="--color:${entry.color}"></span><span>${escape(entry.label)}</span><strong>${number(entry.tokens)}</strong><span class="muted">${percent(entry.share)}</span></div>`).join("")}${badge}</div></div>`;
}

export function tokenMarkup(session: SessionInsight, cumulative: boolean) {
  const summary = summarizeSession(session);
  const sources = cumulative ? summary.cumulativeContext : summary.currentContext;
  const groups = tokenBreakdown(sources);
  const reportedTotal = Object.values(summary.usage).reduce((sum, tokens) => sum + tokens, 0);
  const reported = [
    ["Uncached input", summary.usage.input, "#f97316"],
    ["Cache read", summary.usage.cacheRead, "#f59e0b"],
    ["Cache write", summary.usage.cacheWrite, "#64748b"],
    ["Output", summary.usage.output, "#22c55e"],
    ["Reasoning", summary.usage.reasoning, "#a855f7"],
  ] as const;
  return `<div class="section-head"><h2>Input composition</h2><label><select aria-label="Token scope" title="Current: latest input snapshot. Cumulative: every captured input, including repeated context."><option value="current"${!cumulative ? " selected" : ""}>Current context</option><option value="cumulative"${cumulative ? " selected" : ""}>Cumulative inputs</option></select></label></div>
    ${
      groups.length
        ? `${compositionMarkup(groups, "Input composition", `<span class="badge" title="Source attribution estimates need not equal provider usage. Individual source quality is in Source details.">${sources.every((source) => source.quality === "reported") ? "Reported" : "Estimated attribution"}</span>`)}
    <details class="source" data-source="attribution"><summary>Source details</summary>${groups
      .map(
        (group) =>
          `<h3>${escape(group.label)}</h3><ul>${group.items
            .map((source) => {
              const label = source.label.trim();
              const name =
                source.kind === "skill" && (!label || /^skill$/i.test(label))
                  ? "Unclassified Skill"
                  : label || group.label;
              return `<li><span>${escape(name)} <code>${escape(source.id)}</code></span><span>${number(source.tokens)} · ${escape(source.quality)}</span></li>`;
            })
            .join("")}</ul>`,
      )
      .join("")}</details>`
        : '<p class="muted">Input source attribution unavailable.</p>'
    }
    <div class="section-head"><h2 title="Reported normalized disjoint input categories. Output and reasoning are separate from input composition.">Reported cumulative usage</h2>${session.requests.some((request) => request.cost !== undefined) ? `<span class="muted" title="Reported cost for captured requests">${money(summary.cost)}</span>` : ""}</div>
    ${
      session.requests.some((request) => request.usage)
        ? compositionMarkup(
            reported.map(([label, tokens, color]) => ({
              label,
              tokens,
              color,
              share: reportedTotal ? tokens / reportedTotal : 0,
            })),
            "Reported usage",
          )
        : '<p class="muted">Provider usage unavailable.</p>'
    }`;
}

export function timingMarkup(session: SessionInsight) {
  const result = phaseBreakdown(session);
  const phases = result.phases.filter((phase) => phase.ms > 0);
  const calls = session.tools.filter((tool) => tool.reportedCalls?.length);
  return `<div class="section-head"><h2>Foreground phases</h2><strong title="Union of model and blocking-tool intervals; phases are mutually exclusive.">${duration(result.totalMs)}</strong></div>
    ${phases.length ? `<div class="phase-stack" aria-label="Foreground phase distribution">${phases.map((phase) => `<button type="button" class="phase-segment" style="--color:${phase.color};flex-grow:${phase.share}" aria-label="${escape(phase.label)}: ${duration(phase.ms)}, ${percent(phase.share)}" aria-describedby="phase-${phase.id}" data-phase="${phase.id}"></button>`).join("")}</div><div class="phase-legend">${phases.map((phase) => `<div class="phase-item"><button type="button" class="legend-row" aria-describedby="phase-${phase.id}" data-phase="${phase.id}"><span class="dot" style="--color:${phase.color}"></span><span>${escape(phase.label)}</span><strong>${duration(phase.ms)}</strong><span class="muted">${percent(phase.share)}</span></button><div class="phase-tip" role="tooltip" id="phase-${phase.id}" hidden><strong>${escape(phase.label)} · ${duration(phase.ms)} · ${percent(phase.share)} · ${number(phase.count)} activities</strong><br>${escape(phase.description)}</div></div>`).join("")}</div>` : '<p class="muted">No measured foreground intervals.</p>'}
    <div class="timing-meta"><span title="Separate background-tool union; not added to foreground. Child-session usage is not merged.">Background ${duration(result.backgroundMs)}</span>${result.unknownCount ? `<span class="badge" title="Nonrunning activity without captured endpoints is excluded from measured duration.">Duration unavailable · ${result.unknownCount}</span>` : ""}</div>
    ${
      calls.length
        ? `<details class="source" data-source="reported-calls"><summary>Reported tool calls</summary><p class="muted">Per-call timing unavailable</p>${calls
            .map(
              (tool) =>
                `<h3>${escape(tool.name)}</h3><ul>${summarizeReportedCalls(tool.reportedCalls)
                  .map(
                    (call) =>
                      `<li>${escape(call.name)} ×${call.count} · ${escape(call.status)}</li>`,
                  )
                  .join(
                    "",
                  )}</ul>${tool.reportedCallsTruncated ? '<span class="badge">Details truncated</span>' : ""}`,
            )
            .join("")}</details>`
        : ""
    }`;
}

export function bindPhaseInspection(root: HTMLElement) {
  const show = (id?: string) => {
    root.querySelectorAll<HTMLElement>(".phase-tip").forEach((tip) => {
      tip.hidden = tip.id !== `phase-${id}`;
    });
  };
  root.querySelectorAll<HTMLButtonElement>("[data-phase]").forEach((button) => {
    button.addEventListener("pointerenter", () => show(button.dataset.phase));
    button.addEventListener("pointerleave", () => show());
    button.addEventListener("focus", () => show(button.dataset.phase));
    button.addEventListener("blur", () => show());
    button.addEventListener("click", () => show(button.dataset.phase));
    button.addEventListener("keydown", (event) => {
      if (event.key === "Escape") show();
    });
  });
}
