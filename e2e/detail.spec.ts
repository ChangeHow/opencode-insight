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
    const match = url.match(/\/api\/day\/([^?]+)/);
    const date = match ? match[1] : "2026-07-11";

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(makeMockDayBreakdown(date)),
    });
  });
  await page.route("**/api/session/**", async (route) => {
    const url = route.request().url();
    const sessionMatch = url.match(/\/api\/session\/([^/?]+)/);
    const sessionId = decodeURIComponent(sessionMatch?.[1] ?? "session");

    if (url.includes("/message/analytics")) {
      await route.fulfill({
        json: {
          overview: { timeline: [], toolUsage: [], totalMessages: 0 },
          distribution: { points: [], totalMessages: 0 },
        },
      });
      return;
    }
    if (/\/message(?:\?|$)/.test(url)) {
      await route.fulfill({ json: makeMockMessageList() });
      return;
    }
    await route.fulfill({
      json: makeMockSessionDetailBreakdown(sessionId, {
        title:
          "Session with an intentionally long title that should truncate in the sticky header instead of overflowing the viewport",
        directory:
          "/data/users/opencode/worktree/very-long-directory-name-without-natural-breaks/feature-detail-header-overflow-regression-check",
      }),
    });
  });
});

test.describe("Detail Page", () => {
  test("uses a legible home icon on day and session headers", async ({ page }) => {
    for (const path of ["/detail/2026-05-10", "/sessions/home-icon-session"]) {
      await page.goto(path);

      const homeIcon = page.getByTestId("dashboard-home-icon");
      await expect(homeIcon).toBeVisible();
      await expect(homeIcon).toHaveCSS("width", "20px");
      await expect(homeIcon).toHaveCSS("height", "20px");
    }
  });

  test("day detail panels should align with the summary card on large screens", async ({
    page,
  }) => {
    await page.goto("/detail/2026-05-10");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByText("Sun, May 10, 2026")).toBeVisible({
      timeout: 10_000,
    });

    const rail = page.locator("[data-horizontal-panel-rail]");
    const firstPanel = rail.locator(":scope > div > div").first();
    const summary = page.locator("[data-detail-summary-card]");
    const [railPosition, firstPanelBox, summaryBox] = await Promise.all([
      rail.evaluate((element) => element.scrollLeft),
      firstPanel.boundingBox(),
      summary.boundingBox(),
    ]);

    expect(railPosition).toBe(0);
    expect(firstPanelBox?.x).toBeCloseTo(summaryBox?.x ?? 0, 0);
  });

  test("session detail should not overflow horizontally with long text", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "Mobile regression runs in the mobile project");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sessions/overflow-session");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByText(/Session with an intentionally long title/).first()).toBeVisible({
      timeout: 10_000,
    });

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });

  test("renders the conversation as the primary session workspace", async ({ page }) => {
    await page.goto("/sessions/conversation-session");

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

  test("session detail returns to its source day", async ({ page }) => {
    await page.goto("/sessions/conversation-session?from=2026-05-10");

    await expect(page.getByRole("link", { name: /back/i }).first()).toHaveAttribute(
      "href",
      "/detail/2026-05-10",
    );
  });
});
