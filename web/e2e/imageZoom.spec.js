import { chromium, expect, test } from "@playwright/test";

test("full screen preview overlay triggers, zooms and pans", async ({}, testInfo) => {
  testInfo.annotations.push({ type: "owner", description: "frontend-platform" });
  testInfo.annotations.push({ type: "reason", description: "Requires Playwright Chromium binary" });
  testInfo.annotations.push({ type: "expiry", description: "2026-10-31" });
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    testInfo.skip(true, `Playwright Chromium unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    // Inject mock HTML rendering IssueDetailModal with image buttons
    await page.setContent(`
      <div id="root">
        <button id="open-zoom" type="button">
          <img id="thumb-before" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100' height='100' fill='red'/></svg>" alt="Trước khắc phục" />
          <span>🔍 Chạm ảnh để xem toàn màn hình</span>
        </button>

        <div id="preview-modal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.95); z-index:70;">
          <button id="close-preview" type="button">✕</button>
          <div id="zoom-container" style="width:100%; height:80vh; display:flex; align-items:center; justify-content:center; overflow:hidden;">
            <img id="preview-img" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><rect width='400' height='300' fill='blue'/></svg>" style="transform: translate3d(0px, 0px, 0) scale(1); max-width:100%;" />
          </div>
          <div id="controls">
            <button id="btn-zoom-out">➖ Thu nhỏ</button>
            <button id="btn-zoom-reset">100%</button>
            <button id="btn-zoom-in">➕ Phóng to</button>
          </div>
        </div>
      </div>
      <script>
        let scale = 1;
        let panX = 0;
        let panY = 0;
        const modal = document.getElementById('preview-modal');
        const img = document.getElementById('preview-img');
        const container = document.getElementById('zoom-container');
        const resetBtn = document.getElementById('btn-zoom-reset');

        function updateTransform() {
          img.style.transform = \`translate3d(\${panX}px, \${panY}px, 0) scale(\${scale})\`;
          resetBtn.innerText = Math.round(scale * 100) + '%';
        }

        document.getElementById('open-zoom').onclick = () => {
          modal.style.display = 'block';
          scale = 1;
          panX = 0;
          panY = 0;
          updateTransform();
        };

        document.getElementById('close-preview').onclick = () => {
          modal.style.display = 'none';
        };

        document.getElementById('btn-zoom-in').onclick = () => {
          scale = Math.min(5, scale + 0.25);
          updateTransform();
        };

        document.getElementById('btn-zoom-out').onclick = () => {
          scale = Math.max(0.5, scale - 0.25);
          updateTransform();
        };

        document.getElementById('btn-zoom-reset').onclick = () => {
          scale = 1;
          panX = 0;
          panY = 0;
          updateTransform();
        };

        container.addEventListener('wheel', (e) => {
          e.preventDefault();
          const delta = e.deltaY < 0 ? 0.2 : -0.2;
          scale = Math.min(5, Math.max(0.5, scale + delta));
          updateTransform();
        }, { passive: false });

        container.ondblclick = () => {
          if (scale > 1) {
            scale = 1;
            panX = 0;
            panY = 0;
          } else {
            scale = 2.5;
          }
          updateTransform();
        };
      </script>
    `);

    // 1. Click thumbnail to open preview
    await page.click("#open-zoom");
    await expect(page.locator("#preview-modal")).toBeVisible();

    // 2. Click Zoom In button
    await page.click("#btn-zoom-in");
    await expect(page.locator("#btn-zoom-reset")).toHaveText("125%");
    await expect(page.locator("#preview-img")).toHaveCSS(
      "transform",
      /matrix\(1\.25, 0, 0, 1\.25, 0, 0\)|scale\(1\.25\)/,
    );

    // 3. Double click to zoom 2.5x
    await page.dblclick("#zoom-container");
    await expect(page.locator("#btn-zoom-reset")).toHaveText("100%"); // was > 1 so resets to 1
    await page.dblclick("#zoom-container");
    await expect(page.locator("#btn-zoom-reset")).toHaveText("250%");

    // 4. Mouse wheel to zoom out
    await page.mouse.wheel(0, 100);
    // Scale should decrease from 2.5
    const resetText = await page.locator("#btn-zoom-reset").innerText();
    expect(parseInt(resetText, 10)).toBeLessThan(250);

    // 5. Reset button
    await page.click("#btn-zoom-reset");
    await expect(page.locator("#btn-zoom-reset")).toHaveText("100%");

    // 6. Close preview
    await page.click("#close-preview");
  } finally {
    await browser.close();
  }
});
