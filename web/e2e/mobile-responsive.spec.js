// @ts-check
import { expect, test } from "@playwright/test";
import { getE2EConfig } from "./helpers.js";

test.describe("Mobile Responsive Layout & Anti-Clipping Guard", () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test("login surface has no horizontal overflow on 360px viewport", async ({ page }) => {
    const { baseURL } = getE2EConfig();
    await page.goto(`${baseURL}/login`);

    // Ensure page loaded
    await expect(page.locator("form")).toBeVisible({ timeout: 10000 });

    // Assert no unintended horizontal overflow beyond viewport width
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
