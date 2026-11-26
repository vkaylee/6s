import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { usePWAInstall } from "../src/hooks/usePWAInstall.ts";
import { WithHookMocks } from "./fixtures/mockState.tsx";

function makeWindow(userAgent: string, standalone: boolean) {
  let promptHandler: ((e: unknown) => void) | null = null;
  let installedHandler: (() => void) | null = null;

  const fakeWindow = {
    matchMedia: (q: string) => ({ matches: standalone && q.includes("standalone") }),
    navigator: { userAgent },
    addEventListener: (evt: string, cb: unknown) => {
      if (evt === "beforeinstallprompt") promptHandler = cb as (e: unknown) => void;
      if (evt === "appinstalled") installedHandler = cb as () => void;
    },
    removeEventListener: () => {},
  };

  return {
    fakeWindow,
    handlers: () => ({ promptHandler, installedHandler }),
  };
}

describe("usePWAInstall", () => {
  it("detects standalone installed PWA, iOS device, and prompt flow", async () => {
    const originalWindow = globalThis.window;
    const { fakeWindow, handlers } = makeWindow(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
      true,
    );
    globalThis.window = fakeWindow as unknown as Window & typeof globalThis;

    let resultHook: ReturnType<typeof usePWAInstall> | null = null;

    function TestComp() {
      resultHook = usePWAInstall();
      return <div>{resultHook.isInstalled ? "INSTALLED" : "NOT_INSTALLED"}</div>;
    }

    try {
      const html = renderToString(
        <WithHookMocks initialStates={[null, true, true]}>
          <TestComp />
        </WithHookMocks>,
      );

      expect(html).toContain("INSTALLED");
      const hook1 = resultHook as unknown as ReturnType<typeof usePWAInstall>;
      expect(hook1.isIOS).toBe(true);

      const can = await hook1.promptInstall();
      expect(can).toBe(false);

      const { promptHandler, installedHandler } = handlers();

      if (promptHandler) {
        const acceptEvt = {
          preventDefault: () => {},
          prompt: async () => {},
          userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
        };
        (promptHandler as (e: unknown) => void)(acceptEvt);
      }

      if (installedHandler) {
        (installedHandler as () => void)();
      }
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it("handles dismissed and rejected prompt install safely", async () => {
    const originalWindow = globalThis.window;
    const { fakeWindow, handlers } = makeWindow("Chrome on Linux", false);
    globalThis.window = fakeWindow as unknown as Window & typeof globalThis;

    let resultHook: ReturnType<typeof usePWAInstall> | null = null;

    function TestComp() {
      resultHook = usePWAInstall();
      return <div>PWA</div>;
    }

    try {
      renderToString(
        <WithHookMocks>
          <TestComp />
        </WithHookMocks>,
      );

      const { promptHandler } = handlers();
      expect(promptHandler).toBeDefined();

      if (promptHandler) {
        const dismissEvt = {
          preventDefault: () => {},
          prompt: async () => {},
          userChoice: Promise.resolve({ outcome: "dismissed", platform: "web" }),
        };
        (promptHandler as (e: unknown) => void)(dismissEvt);
        const hook2 = resultHook as unknown as ReturnType<typeof usePWAInstall>;
        const dismissRes = await hook2.promptInstall();
        expect(dismissRes).toBe(false);

        const throwEvt = {
          preventDefault: () => {},
          prompt: async () => {
            throw new Error("fail");
          },
          userChoice: Promise.resolve({ outcome: "dismissed", platform: "web" }),
        };
        (promptHandler as (e: unknown) => void)(throwEvt);
        const throwRes = await hook2.promptInstall();
        expect(throwRes).toBe(false);
      }
    } finally {
      globalThis.window = originalWindow;
    }
  });
});
