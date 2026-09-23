import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useKeyboardViewport } from "../src/hooks/useKeyboardViewport.ts";

function delay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

beforeAll(() => {
  GlobalRegistrator.register({ url: "https://6s.test/" });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  await GlobalRegistrator.unregister();
});

function Probe() {
  useKeyboardViewport();
  return (
    <>
      <input id="name" type="text" />
      <textarea id="desc" />
      <input id="agree" type="checkbox" />
      <input id="photo" type="file" />
    </>
  );
}

describe("useKeyboardViewport", () => {
  let container: HTMLDivElement;
  let root: Root;
  let scrollCalls: number;

  beforeEach(async () => {
    scrollCalls = 0;
    Element.prototype.scrollIntoView = () => {
      scrollCalls += 1;
    };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<Probe />);
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  const focusAndWait = async (id: string) => {
    const el = document.getElementById(id) as HTMLElement;
    await act(async () => {
      el.focus();
      document.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    await act(async () => {
      await delay(400);
    });
  };

  it("scrolls a focused text input into view after the keyboard settles", async () => {
    await focusAndWait("name");
    expect(scrollCalls).toBe(1);
  });

  it("scrolls a focused textarea into view", async () => {
    await focusAndWait("desc");
    expect(scrollCalls).toBe(1);
  });

  it("ignores non-text inputs like checkbox and file", async () => {
    await focusAndWait("agree");
    await focusAndWait("photo");
    expect(scrollCalls).toBe(0);
  });

  it("stops reacting after unmount", async () => {
    await act(async () => {
      root.unmount();
    });
    const el = document.createElement("input");
    document.body.appendChild(el);
    el.focus();
    document.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await delay(400);
    expect(scrollCalls).toBe(0);
    el.remove();
  });
});
