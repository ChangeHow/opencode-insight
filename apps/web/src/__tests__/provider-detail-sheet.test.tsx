import { describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
      provider: makeProviderInsight({
        providerId: "moonshotai",
        totalCost: 71.0012,
        topModel: {
          modelId: "moonshot/kimi-k2-0905-preview",
          tokens: 50000,
          cost: 1.2,
        },
      }),
    });

    render(
      <ProviderDetailSheet
        open
        onOpenChange={() => {}}
        providerId="moonshotai"
        detail={detail}
        loading={false}
        error={null}
        customRange={{ start: "2026-03-01", end: "2026-03-31" }}
        onRetry={() => {}}
      />,
    );

    expect(screen.getByRole("heading", { name: "moonshotai" })).toBeTruthy();
    expect(screen.getByText("Which models drive the bill")).toBeTruthy();
    expect(screen.getByText("Top model Kimi K2.5")).toBeTruthy();
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

  test("filters providers without tokens from the provider ledger", () => {
    render(
      <ProviderInsightsPage
        providers={[
          makeProviderInsight({
            providerId: "moonshotai",
            totalTokens: 50000,
            totalCost: 1.2,
            totalMessages: 30,
          }),
          makeProviderInsight({
            providerId: "idle-provider",
            totalTokens: 0,
            pricedTokens: 0,
            totalCost: 0,
            totalMessages: 12,
            activeDays: 3,
            modelCount: 1,
            topModel: null,
          }),
        ]}
      />,
    );

    const table = screen.getByRole("table");
    const [, body] = within(table).getAllByRole("rowgroup");
    expect(within(body).getAllByRole("row")).toHaveLength(1);
    within(body).getByRole("row", { name: /moonshotai/i });
    expect(screen.queryByText(/idle-provider/i)).toBeNull();
  });
});
