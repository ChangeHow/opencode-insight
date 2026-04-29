const { chromium } = require("@playwright/test");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto("http://localhost:8787/overview");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  // Full page screenshot
  await page.screenshot({ path: "/tmp/calendar-check.png", fullPage: true });

  // Check if the 25th day is fully visible (not clipped)
  const isClipped = await page.evaluate(() => {
    const day25 = Array.from(document.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("25"),
    );
    if (!day25) return false;
    const rect = day25.getBoundingClientRect();
    const parent = day25.closest('[class*="rounded-[24px]"]');
    if (!parent) return false;
    const parentRect = parent.getBoundingClientRect();
    return rect.right > parentRect.right + 1;
  });

  console.log("25th day clipped:", isClipped);

  await browser.close();
  process.exit(isClipped ? 1 : 0);
})();
