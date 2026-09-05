import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { InstallPrompt } from "../src/components/InstallPrompt.tsx";

describe("PWA Install Component & Manifest", () => {
  it("InstallPrompt renders without crash in SSR/Node environment", () => {
    const html = renderToString(<InstallPrompt />);
    // In SSR (no beforeinstallprompt event, not iOS), canInstall is false so it renders null
    expect(html).toBe("");
  });

  it("manifest.webmanifest exists and has required PWA fields", async () => {
    const file = Bun.file("public/manifest.webmanifest");
    const exists = await file.exists();
    expect(exists).toBe(true);

    const data = await file.json();
    expect(data.name).toBe("6S Issue Management System");
    expect(data.short_name).toBe("6S System");
    expect(data.display).toBe("standalone");
    expect(data.start_url).toBe("/");
    expect(data.theme_color).toBe("#DC2626");
    expect(Array.isArray(data.icons)).toBe(true);
    expect(data.icons.length).toBeGreaterThan(0);
  });

  it("service worker file sw.js exists in public", async () => {
    const file = Bun.file("public/sw.js");
    const exists = await file.exists();
    expect(exists).toBe(true);
  });
});
