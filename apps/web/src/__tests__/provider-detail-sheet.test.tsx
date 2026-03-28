import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
vi.mock("../components/dashboard/provider-icon.js", () => ({
  ProviderIcon: ({ providerId }: { providerId: string }) => <span>{providerId}</span>,
}));

import { ProviderDetailSheet } from "../components/dashboard/provider-detail-sheet";
import { ProviderInsightsPage } from "../components/dashboard/provider-insights-page";
import { makeProviderDashboardPayload, makeProviderInsight } from "./factories";

describe("Provider detail surfaces", () => {
  test("renders provider detail content inside the sheet", () => {
    const detail = makeProviderDashboardPayload({
      provider: makeProviderInsight({ providerId: "zai-coding-plan", totalCost: 71.0012 }),
    });

    render(
      <ProviderDetailSheet
        open
        onOpenChange={() => {}}
        providerId="zai-coding-plan"
        detail={detail}
        loading={false}
        error={null}
        customRange={{ start: "2026-03-01", end: "2026-03-31" }}
        onRetry={() => {}}
      />,
    );

    expect(screen.getByRole("heading", { name: "zai-coding-plan" })).toBeTruthy();
    expect(screen.getByText("Which models drive the bill")).toBeTruthy();
  });

  test("calls onSelectProvider when a provider row is activated", async () => {
    const onSelectProvider = vi.fn();
    const user = userEvent.setup();

    render(
      <ProviderInsightsPage
        providers={[makeProviderInsight({ providerId: "zai-coding-plan" })]}
        onSelectProvider={onSelectProvider}
      />,
    );

    await user.click(screen.getByRole("button", { name: /zai-coding-plan/i }));

    expect(onSelectProvider).toHaveBeenCalledWith("zai-coding-plan");
  });
});
