import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AuthenticatedImage } from "../src/components/AuthenticatedImage.tsx";

let registeredHere = false;
const originalFetch = globalThis.fetch;
const originalCreateObjectURL = URL.createObjectURL;

beforeAll(() => {
  if (!GlobalRegistrator.isRegistered) {
    GlobalRegistrator.register({ url: "https://6s.test/" });
    registeredHere = true;
  }
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  globalThis.fetch = originalFetch;
  URL.createObjectURL = originalCreateObjectURL;
});

afterAll(async () => {
  globalThis.fetch = originalFetch;
  URL.createObjectURL = originalCreateObjectURL;
  if (registeredHere) await GlobalRegistrator.unregister();
});

const mounted: { root: Root; container: HTMLElement }[] = [];
afterEach(async () => {
  while (mounted.length > 0) {
    const entry = mounted.pop();
    await act(async () => entry?.root.unmount());
    entry?.container.remove();
  }
});

describe("AuthenticatedImage browser loading", () => {
  it("renders same-origin media URL for native cookie-authenticated loading", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted.push({ root, container });

    await act(async () => {
      root.render(<AuthenticatedImage imageUrl="/api/issues/1/media/before/photo.jpg" />);
    });

    const image = container.querySelector("img");
    expect(image?.getAttribute("src")).toBe("/api/issues/1/media/before/photo.jpg");
  });

  it("reports native image failures while retrying through authenticated fetch", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted.push({ root, container });
    let errorReported = false;
    let requestedUrl = "";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(new Blob(["image"]), { status: 200 });
    }) as unknown as typeof fetch;
    URL.createObjectURL = (() => "blob:fallback") as typeof URL.createObjectURL;

    await act(async () => {
      root.render(
        <AuthenticatedImage
          imageUrl="/api/issues/1/media/before/missing.jpg"
          onError={() => {
            errorReported = true;
          }}
        />,
      );
    });
    await act(async () => {
      container.querySelector("img")?.dispatchEvent(new Event("error"));
    });

    expect(errorReported).toBe(true);
    expect(requestedUrl).toContain("/api/issues/1/media/before/missing.jpg");
    expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:fallback");
  });

  it("renders error state after native and authenticated fallback loading fail", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted.push({ root, container });
    globalThis.fetch = (async () =>
      new Response("denied", { status: 403 })) as unknown as typeof fetch;

    await act(async () => {
      root.render(
        <AuthenticatedImage
          imageUrl="/api/issues/1/media/before/missing.jpg"
          alt="Issue photo"
          compact={false}
        />,
      );
    });

    await act(async () => {
      container.querySelector("img")?.dispatchEvent(new Event("error"));
    });

    expect(container.querySelector("img")?.getAttribute("src")).toBeNull();
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });
  it("retries authenticated fallback after a network failure", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted.push({ root, container });
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      if (fetchCalls === 1) throw new TypeError("Failed to fetch");
      return new Response(new Blob(["image"]), { status: 200 });
    }) as unknown as typeof fetch;
    URL.createObjectURL = (() => "blob:retry-fallback") as typeof URL.createObjectURL;

    await act(async () => {
      root.render(
        <AuthenticatedImage imageUrl="/api/issues/1/media/before/missing.jpg" compact={false} />,
      );
    });
    await act(async () => {
      container.querySelector("img")?.dispatchEvent(new Event("error"));
    });

    expect(fetchCalls).toBe(1);
    expect(container.querySelector('[role="status"]')).not.toBeNull();

    await act(async () => {
      container.querySelector("button")?.click();
    });
    await act(async () => {
      container.querySelector("img")?.dispatchEvent(new Event("error"));
    });

    expect(fetchCalls).toBe(2);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:retry-fallback");
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});
