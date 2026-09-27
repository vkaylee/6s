import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AuthenticatedImage } from "../src/components/AuthenticatedImage.tsx";

beforeAll(() => {
  GlobalRegistrator.register({ url: "https://6s.test/" });
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
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

  it("reports native image failures to the caller immediately", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted.push({ root, container });
    let errorReported = false;

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
    expect(container.querySelector("img")?.getAttribute("src")).toBeNull();
  });

  it("renders error state after native image loading fails", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted.push({ root, container });

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
});
