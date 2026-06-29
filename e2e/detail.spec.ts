import { test, expect } from "@playwright/test";
import { makeMockDayBreakdown, makeMockSessionDetailBreakdown } from "./fixtures";

test.beforeEach(async ({ page }) => {
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
    const date = match ? match[1] : new Date().toISOString().split("T")[0];

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

    // Wait for content to load
    await expect(page.getByText("Daily spend detail for 2026-05-10")).toBeVisible({
      timeout: 10_000,
    });

    // Find horizontal scroll containers (overflow-x-auto)
    const scrollContainers = page.locator("[class*='overflow-x-auto']");
    const count = await scrollContainers.count();

    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const container = scrollContainers.nth(i);
      const scrollLeft = await container.evaluate((el) => (el as HTMLElement).scrollLeft);
      expect(scrollLeft).toBe(0);
    }

    // Take screenshot for visual verification
    await page.screenshot({ path: "/tmp/opencode-detail-scroll-fix.png", fullPage: true });
  });

  test("session detail header should truncate long text without horizontal overflow", async ({
    page,
  }) => {
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
    await page.screenshot({
      path: "/tmp/opencode-session-detail-header-overflow.png",
      fullPage: true,
    });
  });
});
