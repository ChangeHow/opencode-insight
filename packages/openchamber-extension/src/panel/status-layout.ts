import type { HostClient } from "@openchamber/sdk";
import type { PanelState } from "./controller";

export function createStatusLayout(
  root: HTMLElement,
  host: Pick<HostClient, "setHeight">,
  captured: (height: number) => void,
) {
  let frame: number | undefined;
  let height: number | undefined;
  let disposed = false;
  let state: PanelState | undefined;
  let savedSample = "";
  let savedHeight: number | undefined;
  const schedule = () => {
    if (disposed || frame !== undefined) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      if (disposed || document.hidden || !state || (!state.speed && state.loading)) return;
      const next = Math.max(24, Math.min(320, Math.ceil(root.offsetHeight)));
      const sample = `${state.speedReceivedAt}\0${state.speed?.scope}\0${state.speed?.revision}\0${state.speed?.measuredAt}`;
      if (next !== height) {
        height = next;
        void host.setHeight(next).catch(() => {});
      }
      if (
        state.speed &&
        !state.speedCached &&
        !state.error &&
        (sample !== savedSample || next !== savedHeight)
      ) {
        savedSample = sample;
        savedHeight = next;
        captured(next);
      }
    });
  };
  const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(schedule);
  observer?.observe(root);
  return {
    update(next: PanelState) {
      state = next;
      // Loading keeps the host's allocated height; never replace its remembered size.
      root.style.minHeight =
        next.speedCached && next.speedHeight !== undefined ? `${next.speedHeight}px` : "";
      schedule();
    },
    dispose() {
      disposed = true;
      if (frame !== undefined) cancelAnimationFrame(frame);
      observer?.disconnect();
    },
  };
}
