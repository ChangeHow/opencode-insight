import type { HostReadyContext } from "@openchamber/sdk";
import { applyHostReady } from "@openchamber/sdk/ui";
import type { ContextSource, TokenUsage } from "@opencode-insight/telemetry/schema";

export const sourceColors: Record<ContextSource["kind"], string> = {
  system: "var(--insight-chart-1)",
  definitions: "var(--insight-chart-2)",
  user: "var(--insight-chart-3)",
  skill: "var(--insight-chart-4)",
  assistant: "var(--insight-chart-5)",
  tool: "var(--insight-chart-6)",
  injected: "var(--insight-chart-7)",
};

export const usageColors: Record<keyof TokenUsage, string> = {
  input: "var(--insight-chart-4)",
  output: "var(--insight-chart-3)",
  reasoning: "var(--insight-chart-1)",
  cacheRead: "var(--insight-chart-2)",
  cacheWrite: "var(--insight-chart-6)",
};

export function applyPanelTheme(
  ready: HostReadyContext,
  root: HTMLElement = document.documentElement,
) {
  applyHostReady(ready, root);
  // Syntax hues identify categories, never statuses. Older hosts use neutral/primary mixes.
  const palette = [
    ["syntaxKeyword", 85],
    ["syntaxNumber", 25],
    ["syntaxString", 65],
    ["syntaxFunction", 40],
    ["syntaxType", 100],
    ["syntaxVariable", 10],
    ["syntaxOperator", 55],
  ] as const;
  palette.forEach(([token, primaryShare], index) => {
    root.style.setProperty(
      `--insight-chart-${index + 1}`,
      ready.theme.tokens[token] ??
        `color-mix(in srgb, var(--oc-primary) ${primaryShare}%, var(--oc-fg))`,
    );
  });
  root.style.setProperty("--insight-speed-output", usageColors.output);
}
