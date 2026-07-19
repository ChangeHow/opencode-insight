import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@lobehub/icons/es/Codex", () => ({
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
    expect(screen.getByTestId("session-title-row")).toContainElement(runtime);
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

  test("keeps long session titles compact", () => {
    const title = "A very long session title that should remain a compact reference";
    render(
      <SessionBreakdownPanel
        session={{
          ...makeSessionBreakdown("session-long-title", { title }),
          longestTaskDurationMs: 1_000,
        }}
      />,
    );

    const heading = screen.getByRole("heading", { name: title });
    expect(heading).toHaveClass("max-w-[34rem]", "truncate", "text-xl");
    expect(heading).toHaveAttribute("title", title);
    expect(screen.getByText("1 model")).toHaveClass("whitespace-nowrap");
  });
});
