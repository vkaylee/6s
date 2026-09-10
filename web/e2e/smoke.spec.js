// @ts-check
import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";
import {
  createDeterministicIssue,
  ensureLocationsViaAPI,
  getE2EConfig,
  loginViaAPI,
  loginViaUI,
} from "./helpers.js";

test.describe("Smoke & Critical User Flows", () => {
  test("actual browser login via UI form", async ({ page }) => {
    const { username, password } = getE2EConfig();

    await loginViaUI(page, username, password);

    // Confirm navigation out of /login and landing on the authenticated surface
    await expect(page).not.toHaveURL(/\/login/);
    await expect(
      page.locator("main, header, nav, [data-testid='status-bar']").first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("reports CSV export asserting filter query and CSV data", async ({
    page,
    request,
  }) => {
    const { username, password, baseURL } = getE2EConfig();

    // 1. Pre-seed two deterministic issues in distinct locations via API
    const session = await loginViaAPI(request, username, password);
    const { targetLoc, otherLoc } = await ensureLocationsViaAPI(
      request,
      session.access_token,
    );

    const targetDesc = `TargetAreaIssue_${Date.now()}`;
    const excludedDesc = `ExcludedAreaIssue_${Date.now()}`;

    const issueTarget = await createDeterministicIssue(
      request,
      session.access_token,
      {
        locationCode: targetLoc,
        description: targetDesc,
        category: "1S",
      },
    );

    await createDeterministicIssue(request, session.access_token, {
      locationCode: otherLoc,
      description: excludedDesc,
      category: "2S",
    });

    // 2. Open Reports page in UI
    await loginViaUI(page, username, password);
    await page.goto(`${baseURL}/reports`);

    const exportBtn = page.locator('[data-testid="btn-export-csv"]');
    await expect(exportBtn).toBeVisible({ timeout: 10000 });

    // 3. Explicitly filter by target location (non-optional)
    const locationSelect = page.locator("#reports-location-filter");
    await expect(locationSelect).toBeVisible();
    await locationSelect.selectOption(targetLoc);

    // 4. Click export; download event and HTTP 200 response are both strictly required
    const [download, exportResponse] = await Promise.all([
      page.waitForEvent("download", { timeout: 15000 }),
      page.waitForResponse(
        (res) =>
          res.url().includes("/api/issues/export") && res.status() === 200,
        { timeout: 15000 },
      ),
      exportBtn.click(),
    ]);

    expect(exportResponse.status()).toBe(200);

    const contentType = exportResponse.headers()["content-type"] || "";
    expect(contentType).toContain("text/csv");
    expect(exportResponse.url()).toContain(
      `location_code=${encodeURIComponent(targetLoc)}`,
    );

    // Read the completed download; browser fetch responses may not expose blob bytes to Playwright.
    const csvPath = await download.path();
    expect(csvPath).toBeTruthy();
    const csvText = await readFile(csvPath, "utf8");
    expect(csvText).toContain("ID");
    expect(csvText).toContain("Category");
    expect(csvText).toContain("Location Code");
    expect(csvText).toContain("Status");

    // Must include the target location issue and exclude the other location issue
    expect(csvText).toContain(String(issueTarget.id));
    expect(csvText).toContain(targetDesc);
    expect(csvText).not.toContain(excludedDesc);

    // Download file verification
    expect(download.suggestedFilename()).toMatch(/\.csv$/i);
  });

  test("expired access token refresh recovers transparently during CSV export", async ({
    page,
  }) => {
    // Note: simulates access token expiry specifically during CSV export via constrained routing.
    // Client must catch 401, execute POST /api/auth/refresh, retry export with new token, and deliver download.
    const { username, password, baseURL } = getE2EConfig();

    await loginViaUI(page, username, password);
    await page.goto(`${baseURL}/reports`);

    const exportBtn = page.locator('[data-testid="btn-export-csv"]');
    await expect(exportBtn).toBeVisible({ timeout: 10000 });

    let return401Once = true;
    await page.route("**/api/issues/export*", async (route) => {
      if (return401Once) {
        return401Once = false;
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "UNAUTHORIZED",
              message: "Access token expired",
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Both token refresh, retried export response, and download are strictly required.
    const refreshPromise = page.waitForResponse(
      (res) => res.url().includes("/api/auth/refresh") && res.status() === 200,
      { timeout: 15000 },
    );
    const retriedExportPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/issues/export") && res.status() === 200,
      { timeout: 15000 },
    );
    const downloadPromise = page.waitForEvent("download", { timeout: 15000 });
    await exportBtn.click();
    const [refreshResponse, retriedExportResponse, download] = await Promise.all([
      refreshPromise,
      retriedExportPromise,
      downloadPromise,
    ]);

    expect(refreshResponse.status()).toBe(200);
    expect(retriedExportResponse.status()).toBe(200);
    expect(download.suggestedFilename()).toMatch(/\.csv$/i);

    // Verify user remained authenticated on reports page
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("403 forbidden prevents download and surfaces user alert", async ({
    page,
  }) => {
    // Client error handling only: constrained route returns 403 for export.
    // No forbidden account is needed because production middleware is not bypassed.
    const { username, password, baseURL } = getE2EConfig();

    await loginViaUI(page, username, password);
    await page.goto(`${baseURL}/reports`);

    const exportBtn = page.locator('[data-testid="btn-export-csv"]');
    await expect(exportBtn).toBeVisible({ timeout: 10000 });

    let downloadTriggered = false;
    page.on("download", () => {
      downloadTriggered = true;
    });

    await page.route("**/api/issues/export*", async (route) => {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "FORBIDDEN",
            message: "You do not have permission to export reports",
          },
        }),
      });
    });

    await exportBtn.click();

    // Verify modal alert dialog appears with the export error message
    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog).toContainText(
      /Không thể xuất báo cáo|Unable to export the report|Lỗi/i,
    );

    // Verify no download was triggered
    expect(downloadTriggered).toBe(false);
  });
});
