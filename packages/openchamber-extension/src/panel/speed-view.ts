import { mountBanner, mountButton, mountEmpty } from "@openchamber/sdk/ui";
import type { PanelState } from "./controller";
import { createSpeedChart } from "./chart";
import { element, setText } from "./dom";
import { number } from "./format";

export function createSpeedView(root: HTMLElement, retry: () => void, refresh: () => void) {
  let target = "";
  root.classList.add("speed-status");
  root.setAttribute("aria-label", "Session speed");
  const summary = element("div", "section-head speed-summary");
  const mean = element("div");
  mean.title =
    "Shown requests: reported output + reasoning / total request-to-stream-end time. Includes in-request latency and stalls; excludes inter-request tools and idle time.";
  const value = element("strong");
  mean.append(element("span", "muted", "Generation mean "), value);
  const retrySlot = element("div");
  summary.append(mean, retrySlot);
  const errorSlot = element("div");
  const emptySlot = element("div");
  const chartSlot = element("section");
  root.append(summary, errorSlot, emptySlot, chartSlot);
  const button = mountButton(retrySlot, {
    label: "Retry",
    variant: "ghost",
    size: "sm",
    onClick: retry,
  });
  const banner = mountBanner(errorSlot, { tone: "error", title: "Telemetry unavailable" });
  const empty = mountEmpty(emptySlot, { title: "Select an active OpenCode session" });
  const chart = createSpeedChart(chartSlot, refresh);
  return {
    render(state: PanelState) {
      const key = `${state.directory}\0${state.sessionID}`;
      if (key !== target) {
        target = key;
        chart.update();
      }
      errorSlot.hidden = !state.error;
      if (state.error)
        banner.update({
          title: `${state.error}${state.speed ? " Previous captured data is retained; it may be stale." : ""}`,
        });
      let message = "";
      if (!state.sessionID) message = "Select an active OpenCode session to inspect speed.";
      else if (!state.directory) message = "Session location unavailable.";
      else if (!state.speed)
        message = state.loading ? "Loading session speed…" : "Speed telemetry unavailable.";
      emptySlot.hidden = !message;
      mean.hidden = !!message;
      chartSlot.hidden = !!message;
      if (message) empty.update({ title: message });
      const tps = state.speed?.generation?.tps;
      setText(value, tps === undefined ? "Unavailable" : `${number(tps)} tokens/s`);
      chart.update(state.speed);
    },
    dispose() {
      chart.dispose();
      button.dispose();
      banner.dispose();
      empty.dispose();
      root.replaceChildren();
    },
  };
}
