import { expect, test } from "@playwright/test";
import {
  summarizeSession,
  tokenBreakdown,
  phaseBreakdown,
  type SessionInsightQueryPayload,
  type SourcePage,
  type ToolPage,
} from "@opencode-dashboard/shared";
import { makeMockSessionInsight } from "./fixtures";

test("opens native insight without legacy usage and inspects context and speed", async ({
  page,
}) => {
  const { session, series } = makeMockSessionInsight();
  const { currentContext, cumulativeContext, ...summary } = summarizeSession(session);
  const composition = (sources: typeof currentContext) => ({
    total: sources.reduce((sum, source) => sum + source.tokens, 0),
    reported: sources.every((source) => source.quality === "reported"),
    groups: tokenBreakdown(sources).map(({ kind, label, tokens, share }) => ({
      kind,
      label,
      tokens,
      share,
    })),
  });
  const identity = {
    sessionID: session.sessionID,
    directory: session.directory,
    revision: session.revision,
  };
  const start = session.requests[0].startedAt;
  const end = session.updatedAt;
  const data: SessionInsightQueryPayload = {
    overview: {
      ...identity,
      unchanged: false,
      data: {
        updatedAt: end,
        measuredAt: end,
        hasActivity: true,
        running: false,
        summary: { ...summary, hasUsage: true, hasCost: false },
        tokens: {
          current: composition(currentContext),
          cumulative: composition(cumulativeContext),
        },
        phases: phaseBreakdown(session),
        trace: {
          start,
          end,
          measuredAt: end,
          running: false,
          summary: {
            requestCount: 1,
            toolCount: 1,
            errorCount: 0,
            unknownCount: 0,
            partialUsage: false,
            partialCost: true,
          },
          groups: [],
        },
      },
    },
    series: {
      ...identity,
      start,
      end,
      running: false,
      points: series.points,
      requests: session.requests.map(({ context: _context, buckets, ...request }) => ({
        ...request,
        captured: buckets.length > 0,
      })),
      channels: { reasoning: true, summary: false },
    },
  };
  let sourceRequests = 0;
  await page.route("**/api/session/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/insight/overview")) {
      await route.fulfill({
        json: url.searchParams.has("after") ? { ...identity, unchanged: true } : data.overview,
      });
    } else if (url.pathname.endsWith("/insight/series-window")) {
      await route.fulfill({ json: data.series });
    } else if (url.pathname.endsWith("/insight/sources")) {
      sourceRequests++;
      const scope = url.searchParams.get("scope") === "cumulative" ? "cumulative" : "current";
      const entries = scope === "current" ? currentContext : cumulativeContext;
      const sourcePage: SourcePage = {
        ...identity,
        scope,
        entries,
        total: entries.length,
        reset: false,
      };
      await route.fulfill({ json: sourcePage });
    } else if (url.pathname.endsWith("/insight/tools")) {
      const toolPage: ToolPage = {
        ...identity,
        entries: session.tools,
        total: session.tools.length,
        reset: false,
      };
      await route.fulfill({ json: toolPage });
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
  expect(sourceRequests).toBe(0);
  await page.locator("summary", { hasText: "Source details" }).click();
  await expect(page.getByText("Debugging", { exact: true })).toBeVisible();
  expect(sourceRequests).toBe(1);
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
      status: new URL(route.request().url()).pathname.includes("/insight/") ? 503 : 404,
      json: { error: "No running OpenCode V2 service found." },
    });
  });
  await page.goto("/sessions/ses_native");
  await expect(page.getByRole("alert")).toContainText("No running OpenCode V2 service found.");
  await expect(page.getByRole("button", { name: "Retry insight" })).toBeVisible();
  await expect(page.getByRole("slider")).toHaveCount(0);
});
