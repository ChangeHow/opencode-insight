import { mountBadge } from "@openchamber/sdk/ui";
import type { OverviewResponse } from "@opencode-insight/telemetry/queries";
import { element, setText } from "./dom";
import { duration, number } from "./format";
import { createTraceView } from "./trace-view";
import type { ToolPageReader } from "./trace-data";

export function createTimingView(root: HTMLElement, readTools: ToolPageReader) {
  const metadata = element("div", "timing-meta");
  const background = element("span");
  background.title =
    "Separate background-tool union; not added to foreground. Child-session usage is not merged.";
  const unknownSlot = element("span");
  unknownSlot.title =
    "Closed activity without captured endpoints is excluded from measured duration.";
  metadata.append(background, unknownSlot);
  const traceSlot = element("div");
  root.append(metadata, traceSlot);
  const trace = createTraceView(traceSlot, readTools);
  const unknown = mountBadge(unknownSlot, { label: "Duration unavailable", tone: "neutral" });
  let latest: OverviewResponse | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  function render(overview: OverviewResponse) {
    const now = Date.now();
    const result = overview.data!.phases;
    setText(background, `Background ${duration(result.backgroundMs)}`);
    unknownSlot.hidden = !result.unknownCount;
    unknown.update({ label: `Duration unavailable · ${number(result.unknownCount)}` });
    trace.update(overview, now);
  }
  return {
    update(overview: OverviewResponse) {
      latest = overview;
      render(overview);
      const running = overview.data!.running;
      if (running && !timer)
        timer = setInterval(() => {
          if (latest && !document.hidden) render(latest);
        }, 1000);
      else if (!running && timer) {
        clearInterval(timer);
        timer = undefined;
      }
    },
    reset() {
      latest = undefined;
      clearInterval(timer);
      timer = undefined;
      trace.reset();
    },
    dispose() {
      clearInterval(timer);
      unknown.dispose();
      trace.dispose();
      root.replaceChildren();
    },
  };
}
