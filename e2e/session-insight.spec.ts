import { expect, test } from "@playwright/test";
import { makeMockSessionInsight } from "./fixtures";

test("opens native insight without legacy usage and inspects context and speed", async ({
  page,
}) => {
  const data = makeMockSessionInsight();
  await page.route("**/api/session/**", async (route) => {
    if (new URL(route.request().url()).pathname.endsWith("/insight")) {
      await route.fulfill({ json: data });
    } else {
      await route.fulfill({ status: 404, json: { error: "No session found." } });
    }
  });
  await page.goto("/sessions/ses_native");
  await expect(page.getByRole("heading", { name: "Session insight" })).toBeVisible();
  await expect(page.getByText("Reported input").locator("..")).toContainText("100");
  await expect(page.getByText("No session found.")).toHaveCount(0);
  await page.getByRole("tab", { name: "Token", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "current estimated context: 100 tokens" }),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: "Reported usage: 182 tokens" })).toBeVisible();
  await page.locator("summary", { hasText: "Source details" }).click();
  await expect(page.getByText("Debugging", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Speed", exact: true }).click();
  const cursor = page.getByRole("slider", { name: "Speed time cursor" });
  await cursor.focus();
  await cursor.press("End");
  await expect(cursor).toHaveAttribute("aria-valuenow", "1");
  await expect(page.getByRole("status").getByText("Output · 5s").locator("..")).toContainText(
    "6.00 tok/s",
  );
  await expect(
    page.getByRole("status").getByText("Request mean · reported").locator(".."),
  ).toContainText("8.00 tok/s");
  await expect(page.getByRole("status")).toContainText("First response: 0.50 s");
  await expect(page.locator('input[type="range"]')).toHaveCount(0);
  await page.getByRole("tab", { name: "Time", exact: true }).click();
  await expect(page.getByRole("group", { name: "Exclusive foreground phases" })).toBeVisible();
  await page.getByRole("button", { name: "Tool execution phase details" }).hover();
  await expect(page.getByRole("status")).toContainText("1.00 s");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
});

test("shows a recoverable connection error instead of fabricated metrics", async ({ page }) => {
  await page.route("**/api/session/**", async (route) => {
    await route.fulfill({
      status: new URL(route.request().url()).pathname.endsWith("/insight") ? 503 : 404,
      json: { error: "No running OpenCode V2 service found." },
    });
  });
  await page.goto("/sessions/ses_native");
  await expect(page.getByRole("alert")).toContainText("No running OpenCode V2 service found.");
  await expect(page.getByRole("button", { name: "Retry insight" })).toBeVisible();
  await expect(page.getByRole("slider")).toHaveCount(0);
});
