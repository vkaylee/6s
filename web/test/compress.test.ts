import { afterEach, describe, expect, it } from "bun:test";
import { compressImage } from "../src/utils/compress.ts";

describe("compressImage", () => {
  const originalCreateImageBitmap = (globalThis as unknown as { createImageBitmap?: unknown })
    .createImageBitmap;
  const originalOffscreenCanvas = (globalThis as unknown as { OffscreenCanvas?: unknown })
    .OffscreenCanvas;
  const originalDocument = (globalThis as unknown as { document?: unknown }).document;
  const originalImage = (globalThis as unknown as { Image?: unknown }).Image;
  const originalURL = (globalThis as unknown as { URL?: unknown }).URL;

  afterEach(() => {
    (globalThis as unknown as { createImageBitmap?: unknown }).createImageBitmap =
      originalCreateImageBitmap;
    (globalThis as unknown as { OffscreenCanvas?: unknown }).OffscreenCanvas =
      originalOffscreenCanvas;
    (globalThis as unknown as { document?: unknown }).document = originalDocument;
    (globalThis as unknown as { Image?: unknown }).Image = originalImage;
    (globalThis as unknown as { URL?: unknown }).URL = originalURL;
  });

  it("handles basic blob input safely in non-browser runtime", async () => {
    const rawData = new Uint8Array([1, 2, 3, 4, 5]);
    const originalBlob = new Blob([rawData], { type: "image/png" });
    const result = await compressImage(originalBlob, { maxDimension: 1280, quality: 0.7 });
    expect(result).toBeDefined();
    expect(result.size).toBe(originalBlob.size);
  });

  it("handles empty options with defaults safely", async () => {
    const rawData = new Uint8Array([10, 20, 30]);
    const originalBlob = new Blob([rawData], { type: "image/jpeg" });
    const result = await compressImage(originalBlob);
    expect(result).toBeDefined();
    expect(result.size).toBe(originalBlob.size);
  });

  it("compresses using createImageBitmap and OffscreenCanvas with width downscaling", async () => {
    const mockBlob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    (globalThis as unknown as { createImageBitmap?: unknown }).createImageBitmap = async () => ({
      width: 2000,
      height: 1000,
    });

    class MockOffscreenCanvas {
      width: number;
      height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }
      getContext(type: string) {
        if (type === "2d") {
          return {
            drawImage: () => {},
          };
        }
        return null;
      }
      async convertToBlob() {
        return mockBlob;
      }
    }

    (globalThis as unknown as { OffscreenCanvas?: unknown }).OffscreenCanvas = MockOffscreenCanvas;

    const res = await compressImage(mockBlob, { maxDimension: 1000 });
    expect(res).toBe(mockBlob);
  });

  it("compresses using createImageBitmap and OffscreenCanvas with height downscaling", async () => {
    const mockBlob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    (globalThis as unknown as { createImageBitmap?: unknown }).createImageBitmap = async () => ({
      width: 1000,
      height: 2000,
    });

    class MockOffscreenCanvas {
      width: number;
      height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }
      getContext() {
        return {
          drawImage: () => {},
        };
      }
      async convertToBlob() {
        return mockBlob;
      }
    }

    (globalThis as unknown as { OffscreenCanvas?: unknown }).OffscreenCanvas = MockOffscreenCanvas;

    const res = await compressImage(mockBlob, { maxDimension: 1000 });
    expect(res).toBe(mockBlob);
  });

  it("compresses using document canvas fallback when OffscreenCanvas missing", async () => {
    const mockBlob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    (globalThis as unknown as { createImageBitmap?: unknown }).createImageBitmap = async () => ({
      width: 800,
      height: 600,
    });
    delete (globalThis as unknown as { OffscreenCanvas?: unknown }).OffscreenCanvas;

    (globalThis as unknown as { document?: unknown }).document = {
      createElement: (tag: string) => {
        if (tag === "canvas") {
          return {
            width: 0,
            height: 0,
            getContext: () => ({ drawImage: () => {} }),
            toBlob: (cb: (b: Blob | null) => void) => cb(mockBlob),
          };
        }
        return {};
      },
    };

    const res = await compressImage(mockBlob);
    expect(res).toBe(mockBlob);
  });

  it("falls back to HTMLImageElement when createImageBitmap is unavailable", async () => {
    const mockBlob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    delete (globalThis as unknown as { createImageBitmap?: unknown }).createImageBitmap;
    delete (globalThis as unknown as { OffscreenCanvas?: unknown }).OffscreenCanvas;

    (globalThis as unknown as { URL?: unknown }).URL = {
      createObjectURL: () => "blob:test-url",
      revokeObjectURL: () => {},
    };

    (globalThis as unknown as { document?: unknown }).document = {
      createElement: (tag: string) => {
        if (tag === "canvas") {
          return {
            width: 0,
            height: 0,
            getContext: () => ({ drawImage: () => {} }),
            toBlob: (cb: (b: Blob | null) => void) => cb(mockBlob),
          };
        }
        return {};
      },
    };

    class MockImage {
      width = 1600;
      height = 900;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_val: string) {
        queueMicrotask(() => this.onload?.());
      }
    }

    (globalThis as unknown as { Image?: unknown }).Image = MockImage;

    const res = await compressImage(mockBlob, { maxDimension: 1280 });
    expect(res).toBe(mockBlob);
  });

  it("rejects when HTMLImageElement onerror triggers", async () => {
    const mockBlob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    delete (globalThis as unknown as { createImageBitmap?: unknown }).createImageBitmap;
    delete (globalThis as unknown as { OffscreenCanvas?: unknown }).OffscreenCanvas;

    (globalThis as unknown as { URL?: unknown }).URL = {
      createObjectURL: () => "blob:test-url",
      revokeObjectURL: () => {},
    };

    (globalThis as unknown as { document?: unknown }).document = {
      createElement: () => ({}),
    };

    class MockFailingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_val: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }

    (globalThis as unknown as { Image?: unknown }).Image = MockFailingImage;

    expect(compressImage(mockBlob)).rejects.toThrow();
  });
});
