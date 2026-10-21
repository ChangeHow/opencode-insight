import { mountBadge } from "@openchamber/sdk/ui";
import type { SessionInsight } from "@opencode-insight/telemetry/schema";
import { phaseBreakdown } from "@opencode-insight/telemetry/summary";
import { element, setText } from "./dom";
import { duration, number } from "./format";
import { createTraceView } from "./trace-view";

export function createTimingView(root: HTMLElement) {
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
  const trace = createTraceView(traceSlot);
  const unknown = mountBadge(unknownSlot, { label: "Duration unavailable", tone: "neutral" });
  let latest: SessionInsight | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  function render(session: SessionInsight) {
    const now = Date.now();
    const result = phaseBreakdown(session, now);
    setText(background, `Background ${duration(result.backgroundMs)}`);
    unknownSlot.hidden = !result.unknownCount;
    unknown.update({ label: `Duration unavailable · ${number(result.unknownCount)}` });
    trace.update(session, now);
  }
  return {
    update(session: SessionInsight) {
      latest = session;
      render(session);
      const running =
        session.requests.some((request) => request.status === "running") ||
        session.tools.some((tool) => tool.status === "running");
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
