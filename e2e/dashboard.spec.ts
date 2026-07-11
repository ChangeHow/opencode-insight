import { expect, test } from "@playwright/test";
import {
  makeMockDashboard,
  makeMockDayBreakdown,
  makeMockProviderDashboard,
  makeMockProviders,
  makeMockRemoteUsage,
} from "./fixtures";

const FIXED_NOW = "2026-07-11T12:00:00.000Z";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date(FIXED_NOW) });

  await page.route("**/api/dashboard**", async (route) => {
    await route.fulfill({ json: makeMockDashboard() });
  });
  await page.route("**/api/providers**", async (route) => {
    await route.fulfill({ json: makeMockProviders() });
  });
  await page.route("**/api/provider/**", async (route) => {
    const providerId = new URL(route.request().url()).pathname.split("/").at(-1) ?? "anthropic";
    await route.fulfill({ json: makeMockProviderDashboard(decodeURIComponent(providerId)) });
  });
  await page.route("**/api/sync/remote**", async (route) => {
    await route.fulfill({ json: makeMockRemoteUsage() });
  });
  await page.route("**/api/sync/force**", async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        scannedAt: FIXED_NOW,
        push: { pushed: true, days: 7 },
        remote: makeMockRemoteUsage(),
      },
    });
  });
  await page.route("**/api/refresh", async (route) => {
    await route.fulfill({ json: { ok: true, scannedAt: FIXED_NOW } });
  });
  await page.route("**/api/day/**", async (route) => {
    const date = new URL(route.request().url()).pathname.split("/").at(-1) ?? "2026-07-11";
    await route.fulfill({ json: makeMockDayBreakdown(date) });
  });
});

test.describe("Dashboard user flows", () => {
  test("shows richer local and Cloudflare Remote telemetry", async ({ page, isMobile }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/overview/);
    await expect(page.getByRole("heading", { name: "Usage overview" })).toBeVisible();
    await expect(page.getByText("Estimated spend", { exact: true })).toBeVisible();
    await expect(page.getByText("Total tokens", { exact: true })).toBeVisible();
    if (isMobile) {
      await page.getByText("Token details", { exact: true }).click();
    }
    await expect(page.getByRole("heading", { name: "How tokens are used" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cross-device usage" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Combined token composition" })).toBeVisible();
  });

  test("keeps the balanced dark visual contract", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("opencode-telescope-theme", JSON.stringify("dark"));
    });
    await page.goto("/overview");
    await expect(page.getByRole("heading", { name: "Usage overview" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator('[data-surface="card"]').first()).toHaveCSS("border-radius", "12px");
    await expect(page.getByRole("heading", { name: "Usage overview" })).toHaveCSS(
      "font-weight",
      "600",
    );
  });

  test("changes range and theme through semantic controls", async ({ page }) => {
    await page.goto("/overview");

    const rangeButton = page.getByRole("button", { name: "3mo" });
    await expect(rangeButton).toHaveAttribute("aria-pressed", "false");
    await rangeButton.click();
    await expect(rangeButton).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: /Theme mode/ }).click();
    await page.getByRole("button", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("aligns toolbar controls and progressively discloses metrics on compact screens", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 700, height: 900 });
    await page.goto("/overview");

    const navigation = page.getByRole("navigation", { name: "Dashboard views" });
    const themeButton = page.getByRole("button", { name: /Theme mode/ });
    const [navigationBox, themeBox] = await Promise.all([
      navigation.boundingBox(),
      themeButton.boundingBox(),
    ]);

    expect(navigationBox?.height).toBe(themeBox?.height);
    await expect(page.getByRole("button", { name: /Choose date range/ })).toHaveCount(0);
    const moreMetrics = page.getByText("More metrics", { exact: true });
    await expect(moreMetrics).toBeVisible();
    await expect(moreMetrics).toHaveCSS("border-top-width", "0px");
    await expect(moreMetrics).toHaveCSS("border-bottom-width", "0px");
    await expect(page.getByText("Spend / 1M tokens", { exact: true })).toBeHidden();

    const allButton = page.getByRole("button", { name: "All", exact: true });
    await allButton.click();
    await expect(allButton).toHaveAttribute("aria-pressed", "true");
  });

  test("uses an iPad-friendly two-column activity layout with internal remote borders", async ({
    page,
  }) => {
    const dashboard = makeMockDashboard();
    dashboard.heatmap.at(-1)!.cost = 150.74;
    await page.unroute("**/api/dashboard**");
    await page.route("**/api/dashboard**", async (route) => {
      await route.fulfill({ json: dashboard });
    });
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/overview");

    const [calendarBox, trendBox] = await Promise.all([
      page.getByTestId("activity-calendar-panel").boundingBox(),
      page.getByTestId("activity-trend-panel").boundingBox(),
    ]);

    expect(calendarBox?.y).toBe(trendBox?.y);
    expect(calendarBox?.x ?? 0).toBeLessThan(trendBox?.x ?? 0);
    await expect(page.getByTestId("remote-token-stat")).toHaveCSS("border-right-width", "0px");
    await expect(page.getByTestId("secondary-metrics")).toHaveCSS("border-right-width", "0px");
    const metricButtons = page.getByRole("group", { name: "Chart metric" }).getByRole("button");
    await expect(metricButtons).toHaveCount(3);
    expect(
      await metricButtons.evaluateAll((buttons) =>
        buttons.every(
          (button) =>
            button.scrollWidth <= button.clientWidth &&
            getComputedStyle(button).whiteSpace === "nowrap",
        ),
      ),
    ).toBe(true);
    await expect(page.getByText("Quiet", { exact: true })).toBeHidden();
    await expect(page.getByText("Select", { exact: true })).toHaveCSS("white-space", "nowrap");
    const largeSpend = page.getByText("$150.74", { exact: true });
    await expect(largeSpend).toHaveCSS("white-space", "nowrap");
    expect(await largeSpend.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
  });

  test("forces a Cloudflare Remote sync and reports completion", async ({ page }) => {
    await page.goto("/overview");

    const remoteButton = page.getByRole("button", { name: /Sync Cloudflare Remote/ });
    await remoteButton.click();
    await expect(remoteButton).toHaveAccessibleName(/Uploaded 7 days; remote pulled/);
  });

  test("opens provider detail from the responsive provider ledger", async ({ page }) => {
    await page.goto("/overview");
    await page.getByRole("link", { name: "providers" }).click();

    await expect(page).toHaveURL(/\/providers/);
    await expect(page.getByRole("heading", { name: "Provider usage summary" })).toBeVisible();
    await page
      .getByRole("button", { name: /anthropic/i })
      .first()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "anthropic" })).toBeVisible();
  });

  test("fits overview and preset controls at 320px", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile regression runs in the mobile project");
    await page.setViewportSize({ width: 320, height: 780 });
    await page.goto("/overview");

    await expect(page.getByRole("heading", { name: "Usage overview" })).toBeVisible();
    await expect(page.getByText("Activity calendar", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);

    const calendar = page.locator("table").first();
    const box = await calendar.boundingBox();
    const calendarCard = page
      .getByText("Activity calendar", { exact: true })
      .locator('xpath=ancestor::*[@data-surface="card"][1]');
    const cardBox = await calendarCard.boundingBox();
    expect(box).not.toBeNull();
    expect(cardBox).not.toBeNull();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
    expect((box?.width ?? 0) / (cardBox?.width ?? 1)).toBeGreaterThan(0.8);

    await expect(page.getByRole("button", { name: /Choose date range/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "All", exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });

  test("switches the activity chart between spend, tokens, and messages", async ({ page }) => {
    await page.goto("/overview");
    const tokenMetric = page.getByRole("button", { name: "Tokens" });

    await tokenMetric.click();
    await expect(tokenMetric).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("img", { name: /Daily token lines/ })).toBeVisible();
  });
});
