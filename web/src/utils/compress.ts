export interface CompressOptions {
  maxDimension?: number;
  quality?: number;
}

/**
 * Compresses an image blob/file using HTML5 Canvas.
 * Resizes longest edge to max 1280px and outputs image/jpeg at quality 0.7.
 */
export async function compressImage(
  file: Blob | File,
  options: CompressOptions = {},
): Promise<Blob> {
  const maxDimension = options.maxDimension ?? 1280;
  const quality = options.quality ?? 0.7;

  // If in non-DOM environment (e.g. unit tests without Canvas support), return original
  if (typeof document === "undefined" && typeof OffscreenCanvas === "undefined") {
    return file;
  }

  return new Promise<Blob>((resolve, reject) => {
    // If createImageBitmap is supported
    if (typeof createImageBitmap !== "undefined") {
      createImageBitmap(file)
        .then((bitmap) => {
          let { width, height } = bitmap;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          if (typeof OffscreenCanvas !== "undefined") {
            const canvas = new OffscreenCanvas(width, height);
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              resolve(file);
              return;
            }
            ctx.drawImage(bitmap, 0, 0, width, height);
            canvas
              .convertToBlob({ type: "image/jpeg", quality })
              .then(resolve)
              .catch(() => resolve(file));
            return;
          }

          if (typeof document !== "undefined") {
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              resolve(file);
              return;
            }
            ctx.drawImage(bitmap, 0, 0, width, height);
            canvas.toBlob(
              (blob) => {
                if (blob) {
                  resolve(blob);
                } else {
                  resolve(file);
                }
              },
              "image/jpeg",
              quality,
            );
            return;
          }

          resolve(file);
        })
        .catch(reject);
      return;
    }

    // Fallback using HTMLImageElement
    if (typeof Image !== "undefined" && typeof URL !== "undefined") {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(file);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              resolve(file);
            }
          },
          "image/jpeg",
          quality,
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load image for compression"));
      };
      img.src = url;
      return;
    }

    resolve(file);
  });
}
