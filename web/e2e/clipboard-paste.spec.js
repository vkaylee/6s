// @ts-check
import { expect, test } from "@playwright/test";
import {
  ensureLocationsViaAPI,
  getE2EConfig,
  loginViaAPI,
  loginViaUI,
} from "./helpers.js";

/**
 * Valid 64x1 WebP binary fixture generated from real encoder.
 */
const CLIPBOARD_WEBP_BASE64 =
  "UklGRtgAAABXRUJQVlA4IMwAAACQEwCdASpAAfAAPm02mUmkIyKhICgAgA2JaW7hd2Ee3AAAE9gHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZMQAA/v+2WP//raTNCmQ///tLP/qWf/Us/xiucEL6FAAAAAAAAAAAAAA=";

test.describe("Clipboard Paste Image Upload", () => {
  test("pasted image is converted to JPEG and syncs successfully without 400 rejection", async ({
    page,
    request,
  }) => {
    const { baseURL, username, password } = getE2EConfig();

    // 1. Authenticate API and verify test locations exist
    const session = await loginViaAPI(request, username, password);
    await ensureLocationsViaAPI(request, session.access_token);

    // 2. Log in through UI and open Create Issue page
    await loginViaUI(page, username, password);
    await page.goto(`${baseURL}/issues/new`);

    // Wait for the create form to render
    await page.waitForSelector("textarea", { timeout: 10_000 });

    // 3. Select 6S Category (1S)
    const s1Button = page.locator("button:has-text('1S')").first();
    await s1Button.click();

    // 4. Fill Description
    const descText = `Clipboard paste verification issue ${Date.now()}`;
    const descArea = page.locator("textarea").first();
    await descArea.fill(descText);

    // 5. Simulate clipboard paste event with a WebP Blob onto the window
    await page.evaluate((base64Webp) => {
      const binary = atob(base64Webp);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const webpBlob = new Blob([bytes], { type: "image/webp" });
      const file = new File([webpBlob], "clipboard.webp", { type: "image/webp" });

      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const pasteEvent = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: dataTransfer,
      });

      window.dispatchEvent(pasteEvent);
    }, CLIPBOARD_WEBP_BASE64);

    // 6. If ImageAnnotatorModal opens on capture, close or save it
    const annotatorModal = page.locator('div[role="dialog"][aria-labelledby="image-annotator-modal-title"]');
    try {
      await annotatorModal.waitFor({ state: "visible", timeout: 5000 });
      const annotatorSave = annotatorModal
        .locator("button")
        .filter({ hasText: /Save Annotation|Lưu chú thích|Save|Lưu/i })
        .first();
      if (await annotatorSave.isVisible().catch(() => false)) {
        await annotatorSave.click();
      } else {
        await annotatorModal.locator('button[aria-label="Close"], button:has-text("Cancel")').first().click();
      }
      await annotatorModal.waitFor({ state: "hidden", timeout: 5000 });
    } catch {
      // Annotator modal did not open or already closed
    }

    // 7. Verify the overview photo preview appears (indicates paste was processed)
    const photoPreview = page.locator("img[src^='blob:']").first();
    await expect(photoPreview).toBeVisible({ timeout: 5000 });

    // 8. Capture the POST /api/issues/sync request and assert HTTP 200/201 response
    const submitBtn = page
      .locator("button:has-text('GỬI BÁO CÁO'), button:has-text('SUBMIT'), button:has-text('Submit'), button:has-text('Lưu báo cáo')")
      .first();

    const [syncResponse] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/api/issues/sync") && res.request().method() === "POST",
        { timeout: 15_000 },
      ),
      submitBtn.click(),
    ]);

    expect(
      syncResponse.status(),
      `Expected sync to succeed with 200/201, got ${syncResponse.status()}: ${await syncResponse.text()}`,
    ).toBeLessThan(300);

    const syncJson = await syncResponse.json();
    expect(syncJson.data).toBeDefined();
    expect(syncJson.data.client_uuid).toBeDefined();
    expect(syncJson.data.photo_before).toMatch(/\.jpg$/i);
  });
});
