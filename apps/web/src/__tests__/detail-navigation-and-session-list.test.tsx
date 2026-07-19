import { describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionListPanel } from "../components/dashboard/session-list";
import { DetailStickyHeader } from "../routes/layout";
import { makeSessionBreakdown } from "./factories";

vi.mock("@tanstack/react-router", () => ({
  Link: (props: {
    children: unknown;
    className?: string;
    to: string;
    search?: { from?: string };
    "aria-label"?: string;
    title?: string;
  }) => {
    const { children, className, to, search, "aria-label": ariaLabel, title } = props;
    const href = search?.from ? `${to}?from=${search.from}` : to;
    return (
      <a href={href} className={className} aria-label={ariaLabel} title={title}>
        {children}
      </a>
    );
  },
}));

vi.mock("../components/dashboard/provider-icon.js", () => ({
  ProviderIcon: ({ providerId }: { providerId: string }) => <span>{providerId}</span>,
}));
vi.mock("@lobehub/icons/es/Codex", () => ({
  default: (props: Record<string, unknown>) => <svg data-icon="codex" {...props} />,
}));
vi.mock("@lobehub/icons/es/OpenCode", () => ({
  default: (props: Record<string, unknown>) => <svg data-icon="opencode" {...props} />,
}));

describe("detail navigation and session list", () => {
  test("shows filtered-out sessions only after manual expansion", async () => {
    const user = userEvent.setup();
    const highTokenSession = makeSessionBreakdown("high-token", {
      title: "High token session",
      tokens: 1_500_000,
    });
    const filteredSession = makeSessionBreakdown("filtered", {
      title: "Filtered session",
      tokens: 500_000,
    });

    render(
      <SessionListPanel
        date="2026-04-10"
        sessions={[highTokenSession]}
        hiddenSessions={[filteredSession]}
        totalSessions={2}
        filteredCount={1}
      />,
    );

    expect(screen.getByText("High token session")).toBeInTheDocument();
    expect(screen.getByLabelText("Agent runtime: OpenCode")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /high token session/i })).toHaveAttribute(
      "href",
      "/sessions/$session?from=2026-04-10",
    );
    expect(screen.queryByText("Filtered session")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /show 1 session below 1m tokens/i }));

    expect(screen.getByText("Filtered session")).toBeInTheDocument();
  });

  test("renders a dashboard-home shortcut beside the back button", () => {
    render(
      <DetailStickyHeader
        backTo="/overview"
        backLabel="Back to overview"
        theme="system"
        onThemeChange={() => {}}
      />,
    );

    expect(screen.getByRole("link", { name: /back to overview/i })).toBeInTheDocument();
    const homeLink = screen.getByRole("link", { name: /dashboard home/i });
    expect(homeLink).not.toHaveTextContent("Dashboard home");
    expect(within(homeLink).getByTestId("dashboard-home-icon")).toBeInTheDocument();
  });
});
