import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { InstallPrompt } from "../src/components/InstallPrompt.tsx";
import { usePWAInstall } from "../src/hooks/usePWAInstall.ts";

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

  it("usePWAInstall initializes properly and promptInstall returns false without deferredPrompt", async () => {
    let hookResult: ReturnType<typeof usePWAInstall> | null = null;
    function HookHarness() {
      hookResult = usePWAInstall();
      return <div>{hookResult.canInstall ? "CAN" : "CANNOT"}</div>;
    }
    const html = renderToString(<HookHarness />);
    expect(html).toContain("CANNOT");
    const hook = hookResult as ReturnType<typeof usePWAInstall> | null;
    expect(hook).not.toBeNull();
    if (hook) {
      expect(hook.isInstalled).toBe(false);
      expect(hook.isIOS).toBe(false);
      const installed = await hook.promptInstall();
      expect(installed).toBe(false);
    }
  });
});
