import { describe, expect, it } from "bun:test";
import { goBack } from "../src/utils/navigation.ts";

describe("goBack navigation helper", () => {
  it("exports goBack function", () => {
    expect(typeof goBack).toBe("function");
  });

  it("calls history.back() when history length is greater than 1", () => {
    let backCalled = false;
    let replacedUrl: string | null = null;

    const originalWindow = globalThis.window;
    const mockWindow = {
      history: {
        length: 3,
        back: () => {
          backCalled = true;
        },
      },
      location: {
        replace: (url: string) => {
          replacedUrl = url;
        },
      },
    };

    Object.defineProperty(globalThis, "window", {
      value: mockWindow,
      writable: true,
      configurable: true,
    });

    goBack("/default");
    expect(backCalled).toBe(true);
    expect(replacedUrl).toBeNull();

    Object.defineProperty(globalThis, "window", {
      value: originalWindow,
      writable: true,
      configurable: true,
    });
  });

  it("calls location.replace fallback when history length is 1 or less", () => {
    let backCalled = false;
    let replacedUrl = "";
    const originalWindow = globalThis.window;
    const mockWindow = {
      history: {
        length: 1,
        back: () => {
          backCalled = true;
        },
      },
      location: {
        replace: (url: string) => {
          replacedUrl = url;
        },
      },
    };

    Object.defineProperty(globalThis, "window", {
      value: mockWindow,
      writable: true,
      configurable: true,
    });

    goBack("/fallback");
    expect(backCalled).toBe(false);
    expect(replacedUrl).toBe("/fallback");

    Object.defineProperty(globalThis, "window", {
      value: originalWindow,
      writable: true,
      configurable: true,
    });
  });
});
