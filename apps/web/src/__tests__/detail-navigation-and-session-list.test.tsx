import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionListPanel } from "../components/dashboard/session-list";
import { DetailStickyHeader } from "../routes/layout";
import { makeSessionBreakdown } from "./factories";

vi.mock("@tanstack/react-router", () => ({
  Link: (props: { children: unknown; className?: string; to: string }) => {
    const { children, className, to } = props;
    return (
      <a href={to} className={className}>
        {children}
      </a>
    );
  },
}));

vi.mock("../components/dashboard/provider-icon.js", () => ({
  ProviderIcon: ({ providerId }: { providerId: string }) => <span>{providerId}</span>,
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
    expect(screen.queryByText("Filtered session")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /show 1 session below 1m tokens/i }));

    expect(screen.getByText("Filtered session")).toBeInTheDocument();
  });

  test("renders a dashboard-home shortcut beside the back button", () => {
    globalThis.IntersectionObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    } as typeof IntersectionObserver;

    render(
      <DetailStickyHeader
        backTo="/overview"
        backLabel="Back to overview"
        title="Daily spend detail"
        theme="system"
        onThemeChange={() => {}}
        canRefresh
        onRefresh={async () => {}}
      />,
    );

    expect(screen.getByRole("link", { name: /back to overview/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /dashboard home/i })).toBeInTheDocument();
  });
});
