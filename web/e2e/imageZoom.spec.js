// @ts-check
import { expect, test } from "@playwright/test";
import {
  createDeterministicIssue,
  ensureLocationsViaAPI,
  getE2EConfig,
  loginViaAPI,
  loginViaUI,
} from "./helpers.js";

test("real issue image opens, zooms and closes on React surface", async ({
  page,
  request,
}) => {
  const { username, password, baseURL } = getE2EConfig();

  // API setup uses the real application contract, not synthetic HTML.
  const session = await loginViaAPI(request, username, password);
  const { targetLoc } = await ensureLocationsViaAPI(
    request,
    session.access_token,
  );
  const issue = await createDeterministicIssue(request, session.access_token, {
    locationCode: targetLoc,
    description: `E2E image zoom issue ${Date.now()}`,
    category: "1S",
  });
  expect(issue?.id).toBeTruthy();
  expect(issue?.photo_before).toBeTruthy();

  await loginViaUI(page, username, password);
  const issuesResponse = page.waitForResponse(
    (response) => response.url().includes("/api/issues?") && response.status() === 200,
  );
  await page.goto(`${baseURL}/`);
  await expect(page.locator("main")).toBeVisible({ timeout: 15000 });
  await issuesResponse;
  const issueDescription = page.getByText(issue.description, { exact: true });
  if (!(await issueDescription.isVisible().catch(() => false))) {
    const refreshButton = page.getByRole("button", { name: /refresh|làm mới|刷新/i }).first();
    await expect(refreshButton).toBeVisible({ timeout: 15000 });
    const refreshedIssues = page.waitForResponse(
      (response) => response.url().includes("/api/issues?") && response.status() === 200,
    );
    await refreshButton.click();
    await refreshedIssues;
  }
  await expect(issueDescription).toBeVisible({ timeout: 15000 });
  await issueDescription.locator("xpath=ancestor::button[1]").click();

  const issueModal = page
    .locator("div.fixed.inset-0.z-50")
    .filter({ hasText: issue.description })
    .last();
  await expect(issueModal).toBeVisible({ timeout: 15000 });
  const beforeImage = issueModal.getByRole("img", {
    name: /Trước khắc phục|Before resolution|改善前/i,
  });
  await expect(beforeImage).toBeVisible({ timeout: 15000 });
  const beforeImageButton = beforeImage.locator("xpath=ancestor::button[1]");
  await expect(beforeImageButton).toBeVisible({ timeout: 15000 });

  // Click the actual image card. IssueDetailModal opens the fullscreen preview dialog.
  await beforeImageButton.click();

  const preview = page.locator('div[role="dialog"][aria-modal="true"]').last();
  await expect(preview).toBeVisible();
  await expect(preview.locator('[role="application"]')).toBeVisible();

  const previewImage = preview.locator("img").first();
  await expect(previewImage).toBeVisible();

  // Zoom in via visible consumer control; button has localized text.
  const zoomIn = preview.getByRole("button", {
    name: /Phóng to|Zoom in|放大/i,
  });
  await zoomIn.click();
  await expect(preview.getByRole("button", { name: /125%/ })).toBeVisible();
  await expect(previewImage).toHaveAttribute(
    "style",
    /scale\(1\.25\)/,
  );

  // First double-click resets an already zoomed image; second double-click reaches 2.5x.
  await preview.locator('[role="application"]').dblclick();
  await expect(preview.getByRole("button", { name: /100%/ })).toBeVisible();
  await preview.locator('[role="application"]').dblclick();
  await expect(preview.getByRole("button", { name: /250%/ })).toBeVisible();

  // Reset and close through actual controls.
  await preview.getByRole("button", { name: /250%/ }).click();
  await expect(preview.getByRole("button", { name: /100%/ })).toBeVisible();
  await preview.locator('button[aria-label="Close"]').filter({ hasText: "✕" }).first().click();
  await expect(preview).toBeHidden();
  await expect(issueModal).toBeVisible();
});
