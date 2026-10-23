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
  const value = element("strong");
  mean.append(value);
  const retrySlot = element("div");
  retrySlot.hidden = true;
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
  const chart = createSpeedChart(chartSlot, refresh, (left) => {
    root.style.setProperty("--speed-label-left", `${left}px`);
  });
  return {
    render(state: PanelState) {
      const key = `${state.directory}\0${state.sessionID}`;
      if (key !== target) {
        target = key;
        chart.update();
      }
      errorSlot.hidden = !state.error;
      retrySlot.hidden = !state.error;
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
      setText(
        value,
        tps === undefined
          ? "Unavailable"
          : `${state.speed?.generation?.estimated ? "≈" : ""}${number(tps)} tokens/s`,
      );
      if (state.speedCached && state.speedReceivedAt !== undefined)
        value.title = `Previous sample · measured ${new Date(state.speed?.measuredAt ?? state.speedReceivedAt).toLocaleString()}; awaiting live telemetry.`;
      else value.removeAttribute("title");
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
