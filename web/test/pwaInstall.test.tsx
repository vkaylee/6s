import { describe, expect, it } from "bun:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { InstallPrompt } from "../src/components/InstallPrompt.tsx";
import { usePWAInstall } from "../src/hooks/usePWAInstall.ts";

function WithMockState({ values, children }: { values: unknown[]; children: React.ReactNode }) {
  const internals = (
    React as unknown as {
      __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: {
        ReactCurrentDispatcher: {
          current: { useState: (init: unknown) => [unknown, () => void] };
        };
      };
    }
  ).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
  let idx = 0;
  internals.current.useState = (init: unknown) => {
    const val =
      idx < values.length
        ? values[idx++]
        : typeof init === "function"
          ? (init as () => unknown)()
          : init;
    return [val, () => {}];
  };
  return <>{children}</>;
}
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

  it("renders InstallPrompt button and iOS modal when canInstall and isIOS are true", () => {
    const html = renderToString(
      <WithMockState values={[null, false, true, true]}>
        <InstallPrompt />
      </WithMockState>,
    );
    expect(html).toContain('data-testid="pwa-install-btn"');
    expect(html).toContain("📲");
  });

  it("renders null when already installed", () => {
    const html = renderToString(
      <WithMockState values={[null, true, false, false]}>
        <InstallPrompt />
      </WithMockState>,
    );
    expect(html).toBe("");
  });
});
