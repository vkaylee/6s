import { describe, expect, it } from "bun:test";
import type { DraftIssue } from "../src/db/indexeddb.ts";
import { buildIssueSyncFormData } from "../src/sync/syncEngine.ts";

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

function draft(overrides: Partial<DraftIssue> = {}): DraftIssue {
  return {
    client_uuid: "3f0c1f5e-2b1a-4a5e-8f7c-9d0e1a2b3c4d",
    category: "1S",
    location_code: "LINE_A1",
    tags: [],
    description: "report",
    photo_before_blob: new Blob([JPEG_BYTES], { type: "image/jpeg" }),
    created_at: 1_700_000_000_000,
    sync_status: "PENDING",
    ...overrides,
  };
}

async function uploadedBytes(formData: FormData, field: string): Promise<Uint8Array> {
  const file = formData.get(field);
  if (!(file instanceof Blob)) throw new Error(`missing upload field ${field}`);
  return new Uint8Array(await file.arrayBuffer());
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/** Installs an OffscreenCanvas whose conversion output is a JPEG; returns conversion counter. */
function installCanvas(jpegOutput = true) {
  const original = {
    createImageBitmap: (globalThis as Record<string, unknown>).createImageBitmap,
    OffscreenCanvas: (globalThis as Record<string, unknown>).OffscreenCanvas,
  };
  let conversions = 0;

  (globalThis as Record<string, unknown>).createImageBitmap = async () => ({
    width: 120,
    height: 90,
    close() {},
  });
  (globalThis as Record<string, unknown>).OffscreenCanvas = class {
    constructor(
      public width: number,
      public height: number,
    ) {}
    getContext() {
      return { drawImage() {} };
    }
    async convertToBlob() {
      conversions++;
      return new Blob([jpegOutput ? JPEG_BYTES : WEBP_BYTES], {
        type: jpegOutput ? "image/jpeg" : "image/webp",
      });
    }
  };

  return {
    get conversions() {
      return conversions;
    },
    restore() {
      Object.assign(globalThis, original);
    },
  };
}

describe("issue sync upload format", () => {
  it("uploads an already-valid JPEG untouched", async () => {
    const canvas = installCanvas();
    try {
      const payload = await buildIssueSyncFormData(draft());

      expect(Array.from(await uploadedBytes(payload, "photo_before"))).toEqual(
        Array.from(JPEG_BYTES),
      );
      expect(canvas.conversions).toBe(0);
    } finally {
      canvas.restore();
    }
  });

  it("uploads an already-valid PNG untouched", async () => {
    const canvas = installCanvas();
    try {
      const payload = await buildIssueSyncFormData(
        draft({ photo_before_blob: new Blob([PNG_BYTES], { type: "image/png" }) }),
      );

      expect(Array.from(await uploadedBytes(payload, "photo_before"))).toEqual(
        Array.from(PNG_BYTES),
      );
      expect(canvas.conversions).toBe(0);
    } finally {
      canvas.restore();
    }
  });

  it("converts a pasted WebP photo to JPEG before upload", async () => {
    const canvas = installCanvas();
    try {
      const payload = await buildIssueSyncFormData(
        draft({ photo_before_blob: new Blob([WEBP_BYTES], { type: "image/webp" }) }),
      );

      expect(isJpeg(await uploadedBytes(payload, "photo_before"))).toBe(true);
      expect(canvas.conversions).toBe(1);
    } finally {
      canvas.restore();
    }
  });

  it("converts a pasted WebP detail photo to JPEG before upload", async () => {
    const canvas = installCanvas();
    try {
      const payload = await buildIssueSyncFormData(
        draft({ photo_detail_blob: new Blob([WEBP_BYTES], { type: "image/webp" }) }),
      );

      expect(isJpeg(await uploadedBytes(payload, "photo_detail"))).toBe(true);
      expect(canvas.conversions).toBe(1);
    } finally {
      canvas.restore();
    }
  });

  it("rejects an unconvertible photo instead of uploading an unsupported format", async () => {
    const canvas = installCanvas(false);
    try {
      const pending = buildIssueSyncFormData(
        draft({ photo_before_blob: new Blob([WEBP_BYTES], { type: "image/webp" }) }),
      );

      await expect(pending).rejects.toThrow("JPEG or PNG");
    } finally {
      canvas.restore();
    }
  });

  it("rejects an unconvertible photo when no canvas runtime is available", async () => {
    const original = {
      createImageBitmap: (globalThis as Record<string, unknown>).createImageBitmap,
      OffscreenCanvas: (globalThis as Record<string, unknown>).OffscreenCanvas,
    };
    (globalThis as Record<string, unknown>).createImageBitmap = undefined;
    (globalThis as Record<string, unknown>).OffscreenCanvas = undefined;

    try {
      const pending = buildIssueSyncFormData(
        draft({ photo_before_blob: new Blob([WEBP_BYTES], { type: "image/webp" }) }),
      );

      await expect(pending).rejects.toThrow("JPEG or PNG");
    } finally {
      Object.assign(globalThis, original);
    }
  });
});
