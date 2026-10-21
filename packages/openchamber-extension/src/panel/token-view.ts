import { mountBadge, mountEmpty, mountSelect } from "@openchamber/sdk/ui";
import type { SessionInsight } from "@opencode-insight/telemetry/schema";
import { summarizeSession, tokenBreakdown } from "@opencode-insight/telemetry/summary";
import { createComposition } from "./composition";
import { element, setText } from "./dom";
import { money } from "./format";
import { sourceColors, usageColors } from "./theme";
import { createSourceDetails } from "./source-details";

export function createTokenView(root: HTMLElement) {
  let cumulative = false;
  let latest: SessionInsight | undefined;
  const header = element("div", "section-head");
  header.append(element("h2", "", "Input composition"));
  const scopeSlot = element("div", "scope-slot");
  header.append(scopeSlot);
  const inputSlot = element("div");
  const emptySlot = element("div");
  const qualitySlot = element("div", "quality-slot");
  const detailsSlot = element("div");
  const usageHeader = element("div", "section-head");
  const usageTitle = element("h2", "", "Reported cumulative usage");
  usageTitle.title =
    "Normalized disjoint input categories. Output and reasoning are separate from input composition.";
  const cost = element("span", "muted");
  cost.title = "Reported cost for captured requests";
  usageHeader.append(usageTitle, cost);
  const usageSlot = element("div");
  const unavailableSlot = element("div");
  root.append(
    header,
    inputSlot,
    qualitySlot,
    emptySlot,
    detailsSlot,
    usageHeader,
    usageSlot,
    unavailableSlot,
  );
  const input = createComposition(inputSlot, "Input composition");
  const usage = createComposition(usageSlot, "Reported usage");
  const details = createSourceDetails(detailsSlot);
  const quality = mountBadge(qualitySlot, { label: "Estimated attribution", tone: "neutral" });
  qualitySlot.title =
    "Source attribution estimates need not equal provider usage. Individual source quality is in Source details.";
  const empty = mountEmpty(emptySlot, { title: "Input source attribution unavailable." });
  const unavailable = mountEmpty(unavailableSlot, { title: "Provider usage unavailable." });
  const scope = mountSelect(scopeSlot, {
    label: "Token scope",
    value: "current",
    options: [
      { id: "current", label: "Current context" },
      { id: "cumulative", label: "Cumulative inputs" },
    ],
    onChange(value) {
      cumulative = value === "cumulative";
      scope.update({ value });
      if (latest) update(latest);
    },
  });
  scopeSlot.title =
    "Current: latest input snapshot. Cumulative: every captured input, including repeated context.";
  // The SDK retains its accessible label while the compact toolbar displays only the value.
  scopeSlot.querySelector(".oc-sdk-field-label")?.classList.add("sr-only");
  function update(session: SessionInsight) {
    latest = session;
    const summary = summarizeSession(session);
    const sources = cumulative ? summary.cumulativeContext : summary.currentContext;
    const groups = tokenBreakdown(sources);
    inputSlot.hidden = qualitySlot.hidden = !groups.length;
    emptySlot.hidden = !!groups.length;
    input.update(
      groups.map((group) => ({ ...group, id: group.kind, color: sourceColors[group.kind] })),
    );
    quality.update({
      label: sources.every((source) => source.quality === "reported")
        ? "Reported"
        : "Estimated attribution",
    });
    details.update(groups);
    const hasUsage = session.requests.some((request) => request.usage);
    usageSlot.hidden = !hasUsage;
    unavailableSlot.hidden = hasUsage;
    const total = Object.values(summary.usage).reduce((sum, tokens) => sum + tokens, 0);
    const fields = [
      ["input", "Uncached input"],
      ["cacheRead", "Cache read"],
      ["cacheWrite", "Cache write"],
      ["output", "Output"],
      ["reasoning", "Reasoning"],
    ] as const;
    usage.update(
      fields.map(([id, label]) => ({
        id,
        label,
        color: usageColors[id],
        tokens: summary.usage[id],
        share: total ? summary.usage[id] / total : 0,
      })),
    );
    cost.hidden = !session.requests.some((request) => request.cost !== undefined);
    setText(cost, money(summary.cost));
  }
  return {
    update,
    reset() {
      latest = undefined;
      if (cumulative) {
        cumulative = false;
        scope.update({ value: "current" });
      }
      details.reset();
    },
    dispose() {
      scope.dispose();
      quality.dispose();
      empty.dispose();
      unavailable.dispose();
      root.replaceChildren();
    },
  };
}
