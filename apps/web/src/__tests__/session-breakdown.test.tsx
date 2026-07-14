import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@lobehub/icons/es/OpenAI", () => ({
  default: (props: Record<string, unknown>) => <svg data-icon="codex" {...props} />,
}));
vi.mock("@lobehub/icons/es/OpenCode", () => ({
  default: (props: Record<string, unknown>) => <svg data-icon="opencode" {...props} />,
}));
vi.mock("../components/dashboard/provider-icon.js", () => ({
  ProviderIcon: ({ providerId }: { providerId: string }) => <span>{providerId}</span>,
}));

import { SessionBreakdownPanel } from "../components/dashboard/session-breakdown";
import { makeSessionBreakdown } from "./factories";

describe("SessionBreakdownPanel", () => {
  test("labels the Codex CLI agent runtime with its icon", () => {
    render(
      <SessionBreakdownPanel
        session={{
          ...makeSessionBreakdown("codex:session-abc", { runtime: "codex" }),
          longestTaskDurationMs: 0,
        }}
      />,
    );

    const runtime = screen.getByLabelText("Agent runtime: Codex CLI");
    expect(runtime).toHaveTextContent("Codex CLI");
    expect(runtime.querySelector('[data-icon="codex"]')).toBeInTheDocument();
  });

  test("labels the OpenCode agent runtime with its icon", () => {
    render(
      <SessionBreakdownPanel
        session={{
          ...makeSessionBreakdown("session-opencode", { runtime: "opencode" }),
          longestTaskDurationMs: 1_000,
        }}
      />,
    );

    const runtime = screen.getByLabelText("Agent runtime: OpenCode");
    expect(runtime).toHaveTextContent("OpenCode");
    expect(runtime.querySelector('[data-icon="opencode"]')).toBeInTheDocument();
  });
});
