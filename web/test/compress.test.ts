import { describe, expect, it } from "bun:test";
import { compressImage } from "../src/utils/compress.ts";

describe("compressImage", () => {
  it("handles basic blob input safely in non-browser runtime", async () => {
    const rawData = new Uint8Array([1, 2, 3, 4, 5]);
    const originalBlob = new Blob([rawData], { type: "image/png" });
    const result = await compressImage(originalBlob, { maxDimension: 1280, quality: 0.7 });
    expect(result).toBeDefined();
    expect(result.size).toBe(originalBlob.size);
  });
});
