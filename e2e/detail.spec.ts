import { test, expect } from "@playwright/test";
import {
  makeMockDayBreakdown,
  makeMockMessageList,
  makeMockSessionDetailBreakdown,
} from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-07-11T12:00:00.000Z") });
  await page.route("**/api/day/**", async (route) => {
    const url = route.request().url();
    const sessionMatch = url.match(/\/api\/day\/([^/]+)\/session\/([^/?]+)/);

    if (url.includes("/message/analytics")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          overview: { timeline: [], toolUsage: [], totalMessages: 0 },
          distribution: { points: [], totalMessages: 0 },
        }),
      });
      return;
    }

    if (/\/message(?:\?|$)/.test(url)) {
      await route.fulfill({ json: makeMockMessageList() });
      return;
    }

    if (sessionMatch) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          makeMockSessionDetailBreakdown(decodeURIComponent(sessionMatch[2] ?? "session"), {
            title:
              "Session with an intentionally long title that should truncate in the sticky header instead of overflowing the viewport",
            directory:
              "/data/users/opencode/worktree/very-long-directory-name-without-natural-breaks/feature-detail-header-overflow-regression-check",
          }),
        ),
      });
      return;
    }

    const match = url.match(/\/api\/day\/([^?]+)/);
    const date = match ? match[1] : "2026-07-11";

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(makeMockDayBreakdown(date)),
    });
  });
});

test.describe("Detail Page", () => {
  test("scroll panels should start at the first panel (scrollLeft === 0)", async ({ page }) => {
    await page.goto("/detail/2026-05-10");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByText("Daily spend detail for 2026-05-10")).toBeVisible({
      timeout: 10_000,
    });

    const scrollContainers = page.locator("[class*='overflow-x-auto']");
    const count = await scrollContainers.count();

    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const container = scrollContainers.nth(i);
      const scrollLeft = await container.evaluate((el) => (el as HTMLElement).scrollLeft);
      expect(scrollLeft).toBe(0);
    }
  });

  test("session detail header should truncate long text without horizontal overflow", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "Mobile regression runs in the mobile project");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/detail/2026-05-10/overflow-session");
    await page.waitForLoadState("domcontentloaded");

    const stickyTitle = page.getByText(/Session with an intentionally long title/).first();
    await expect(stickyTitle).toBeVisible({ timeout: 10_000 });

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);

    await expect(stickyTitle).toHaveCSS("text-overflow", "ellipsis");
  });

  test("renders the conversation as the primary session workspace", async ({ page }) => {
    await page.goto("/detail/2026-05-10/conversation-session");

    await expect(page.getByTestId("conversation-workspace")).toBeVisible();
    await expect(page.getByTestId("session-overview")).toHaveCSS("border-bottom-width", "0px");
    await expect(page.getByTestId("session-metrics")).toHaveCSS("border-left-width", "0px");
    await expect(page.getByTestId("session-metrics")).toHaveCSS("border-right-width", "0px");
    await expect(page.getByTestId("conversation-workspace")).toHaveCSS("border-top-width", "1px");
    await expect(page.getByRole("tab", { name: /Transcript/ })).toHaveAttribute(
      "data-state",
      "active",
    );
    await expect(page.locator('[data-message-role="user"]')).toContainText("Review the dashboard");
    await expect(page.locator('[data-message-role="assistant"]')).toContainText("Finding");
    await page.getByRole("button", { name: /Read provider dashboard/ }).click();
    await expect(page.getByText("Provider dashboard source loaded.")).toBeVisible();
  });
});
