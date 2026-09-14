// @ts-check
import { expect, test } from "@playwright/test";
import { getE2EConfig, loginViaUI } from "./helpers.js";

test("keeps selected language after browser rerender", async ({ page }) => {
  const { baseURL, username, password } = getE2EConfig();
  await page.goto(`${baseURL}/login`);
  await page.evaluate(() => localStorage.setItem("app_locale", "vi"));
  await page.reload();
  await loginViaUI(page, username, password);
  await page.goto(`${baseURL}/`);
  const languageToggle = page.getByTestId("lang-toggle");
  await expect(languageToggle).toBeVisible();
  await expect(languageToggle).toContainText("vi");

  await languageToggle.click();
  await expect(languageToggle).toContainText("en");
  await expect(page.locator("body")).toContainText("Open");
  await page.reload();
  await expect(page.getByTestId("lang-toggle")).toContainText("en");
  await expect(page.locator("body")).toContainText("Open");
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("lang-toggle")).toContainText("en");
  expect(await page.evaluate(() => localStorage.getItem("app_locale"))).toBe("en");
});
