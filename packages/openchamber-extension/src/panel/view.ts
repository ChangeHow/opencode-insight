import { mountBadge, mountBanner, mountButton, mountEmpty } from "@openchamber/sdk/ui";
import { summarizeSession } from "@opencode-insight/telemetry/summary";
import type { PanelState } from "./controller";
import { createSpeedChart } from "./chart";
import { element, setText } from "./dom";
import { duration, number } from "./format";
import { createTokenView } from "./token-view";
import { createTimingView } from "./timing-view";

export function createPanelView(root: HTMLElement, retry: () => void) {
  let target = "";
  let disposed = false;
  let lastError = "";
  let lastEmpty = "";
  root.setAttribute("aria-label", "Session insight");
  const header = element("header", "section-head panel-header");
  header.append(element("h1", "", "Session insight"));
  const retrySlot = element("div");
  header.append(retrySlot);
  const errorSlot = element("div");
  const emptySlot = element("div");
  const content = element("div", "insight-data");
  const metrics = element("div", "metrics top-metrics");
  const qualitySlot = element("div", "capture-quality");
  const panels = { speed: element("section"), token: element("section"), time: element("section") };
  for (const [id, panel] of Object.entries(panels)) {
    panel.id = `insight-${id}`;
    panel.className = "insight-section";
    panel.setAttribute("aria-labelledby", `insight-${id}-heading`);
  }
  content.append(metrics, qualitySlot, ...Object.values(panels));
  root.append(header, errorSlot, emptySlot, content);
  const retryButton = mountButton(retrySlot, {
    label: "Retry",
    variant: "ghost",
    size: "sm",
    onClick: retry,
  });
  retrySlot.querySelector("button")!.id = "retry";
  const banner = mountBanner(errorSlot, { tone: "error", title: "Telemetry unavailable" });
  const empty = mountEmpty(emptySlot, { title: "Select an active OpenCode session" });
  const quality = mountBadge(qualitySlot, { label: "Partial capture", tone: "neutral" });
  qualitySlot.title = "Totals and timing cover only observed activity.";
  const metricLabels = ["Current context", "Cumulative tokens", "Request mean", "Foreground"];
  const descriptions = [
    "Latest input snapshot · estimated/reported.",
    "Reported repeated input + cache + output + reasoning.",
    "Reported output + reasoning / whole request elapsed.",
    "Union of model and blocking tools; background separate.",
  ];
  const values = metricLabels.map((label, index) => {
    const metric = element("div", "metric");
    metric.title = descriptions[index];
    const value = element("strong");
    metric.append(element("span", "muted", label), value);
    metrics.append(metric);
    return value;
  });
  const speed = createSpeedChart(panels.speed);
  const token = createTokenView(panels.token);
  const timing = createTimingView(panels.time);
  for (const [id, label] of [
    ["speed", "Speed"],
    ["token", "Tokens"],
    ["time", "Times"],
  ] as const) {
    const heading = element("h2", "", label);
    heading.id = `insight-${id}-heading`;
    panels[id].prepend(heading);
  }
  function render(state: PanelState) {
    if (disposed) return;
    const key = `${state.directory}\0${state.sessionID}`;
    if (key !== target) {
      target = key;
      token.reset();
      timing.reset();
      speed.update();
    }
    errorSlot.hidden = !state.error;
    const error = state.error
      ? `${state.error}${state.session ? " Previous captured data is retained; it may be stale." : ""}`
      : "";
    if (error !== lastError) {
      banner.update({ title: error });
      lastError = error;
    }
    let message = "";
    if (!state.sessionID) message = "Select an active OpenCode session to inspect local telemetry.";
    else if (!state.directory)
      message = "Session location unavailable. Select a local project directory.";
    else if (!state.session)
      message = state.loading
        ? "Loading local session telemetry…"
        : "Telemetry unavailable. The local service must verify this session location.";
    else if (!state.session.requests.length && !state.session.tools.length)
      message =
        "No telemetry captured for this session yet. Start a model request with the capture plugin enabled.";
    emptySlot.hidden = !message;
    content.hidden = !!message;
    if (message !== lastEmpty) {
      empty.update({ title: message });
      lastEmpty = message;
    }
    if (message || !state.session) return;
    const session = state.session;
    const summary = summarizeSession(session);
    const metricsNext = [
      summary.currentContext.length
        ? number(summary.currentContext.reduce((sum, source) => sum + source.tokens, 0))
        : "Unavailable",
      session.requests.some((request) => request.usage)
        ? number(Object.values(summary.usage).reduce((sum, value) => sum + value, 0))
        : "Unavailable",
      summary.tps === undefined ? "Unavailable" : `${number(summary.tps)} tokens/s`,
      duration(summary.foregroundMs),
    ];
    metricsNext.forEach((value, index) => setText(values[index], value));
    qualitySlot.hidden = !summary.capturePartial;
    speed.update(session);
    token.update(session);
    timing.update(session);
  }
  return {
    render,
    dispose() {
      if (disposed) return;
      disposed = true;
      speed.dispose();
      token.dispose();
      timing.dispose();
      retryButton.dispose();
      banner.dispose();
      empty.dispose();
      quality.dispose();
      root.replaceChildren();
    },
  };
}
