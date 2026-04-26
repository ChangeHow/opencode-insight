import { test, expect } from "@playwright/test";
import {
  makeMockDashboard,
  makeMockSummary,
  makeMockHeatmap,
  makeMockTrend,
  makeMockSeries,
  makeMockProviders,
  makeMockDayBreakdown,
} from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/dashboard**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(makeMockDashboard()),
    });
  });

  await page.route("**/api/summary**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(makeMockSummary()),
    });
  });

  await page.route("**/api/heatmap**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(makeMockHeatmap()),
    });
  });

  await page.route("**/api/trend**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(makeMockTrend()),
    });
  });

  await page.route("**/api/series**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(makeMockSeries()),
    });
  });

  await page.route("**/api/providers**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(makeMockProviders()),
    });
  });

  await page.route("**/api/day/**", async (route) => {
    const url = route.request().url();
    const match = url.match(/\/api\/day\/([^?]+)/);
    const date = match ? match[1] : new Date().toISOString().split("T")[0];

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(makeMockDayBreakdown(date)),
    });
  });

  await page.route("**/api/refresh", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, scannedAt: new Date().toISOString() }),
    });
  });
});

test.describe("Dashboard User Flows", () => {
  test("User views the overview dashboard", async ({ page }) => {
    await page.goto("/");

    // Should redirect to /overview
    await expect(page).toHaveURL(/\/overview/);

    // Should see metric cards with correct labels
    await expect(page.getByText("Estimated spend")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Total tokens")).toBeVisible();

    // Should see the activity SVG chart rendered by recharts
    await expect(page.locator("svg").first()).toBeVisible({ timeout: 10_000 });
  });

  test("User switches to 3-month range", async ({ page }) => {
    await page.goto("/overview");
    await page.waitForLoadState("domcontentloaded");

    const threeMonthButton = page.getByRole("button", { name: "3mo" });
    await expect(threeMonthButton).toBeVisible({ timeout: 5_000 });
    await threeMonthButton.click();

    await expect(threeMonthButton).toHaveClass(/bg-\[var\(--accent\)\]/);
  });

  test("Range pills and calendar cards match updated visuals", async ({ page }) => {
    await page.goto("/overview");
    await page.waitForLoadState("domcontentloaded");

    const rangePicker = page.getByRole("button", { name: "7d" }).locator("xpath=..");
    const headerPills = ["7d", "1mo", "3mo", "1yr"] as const;

    for (const label of headerPills) {
      await expect(page.getByRole("button", { name: label })).toBeVisible({ timeout: 5_000 });
    }

    for (const label of ["1mo", "3mo"] as const) {
      const metrics = await page.getByRole("button", { name: label }).evaluate((element) => {
        const buttonRect = element.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(element);
        const textRect = range.getBoundingClientRect();
        return {
          topGap: textRect.top - buttonRect.top,
          bottomGap: buttonRect.bottom - textRect.bottom,
        };
      });

      expect(Math.abs(metrics.topGap - metrics.bottomGap)).toBeLessThanOrEqual(1.5);
    }

    await rangePicker.screenshot({ path: "/tmp/opencode-dashboard-header-range.png" });

    const calendarCard = page
      .locator("button")
      .filter({ has: page.locator("span", { hasText: /^\d{2}$/ }) })
      .first();
    await expect(calendarCard).toBeVisible({ timeout: 5_000 });

    const calendarRadius = await calendarCard.evaluate(
      (element) => window.getComputedStyle(element).borderRadius,
    );
    expect(calendarRadius).toBe("8px");

    await page
      .locator("table")
      .first()
      .screenshot({ path: "/tmp/opencode-dashboard-calendar.png" });
  });

  test("User navigates to providers view", async ({ page }) => {
    await page.goto("/overview");
    await page.waitForLoadState("domcontentloaded");

    // "Providers" navigation link is visible
    const providersLink = page.getByRole("link", { name: "Providers" });
    await expect(providersLink).toBeVisible({ timeout: 5_000 });
    await providersLink.click();

    // Should land on providers page
    await expect(page).toHaveURL(/\/providers/);
  });

  test("User triggers a data refresh", async ({ page }) => {
    await page.goto("/overview");
    await page.waitForLoadState("domcontentloaded");

    // The refresh button contains the text "Refresh"
    const refreshButton = page.getByRole("button", { name: /^Refresh$/i });
    await expect(refreshButton).toBeVisible({ timeout: 5_000 });
    await refreshButton.click();

    // Page should still show metric cards after refresh
    await expect(page.getByText("Estimated spend")).toBeVisible({ timeout: 5_000 });
  });
});
