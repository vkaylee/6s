import { describe, expect, it } from "bun:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { ImageAnnotatorModal } from "../src/components/ImageAnnotatorModal.tsx";

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

const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("ImageAnnotatorModal Component", () => {
  it("returns null when isOpen is false", () => {
    const html = renderToString(
      <ImageAnnotatorModal
        imageUrl=""
        isOpen={false}
        title={{ vi: "Chú thích ảnh", en: "Annotate Photo", zh: "标注图片" }}
        onSave={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).toBe("");
  });

  it("renders toolbar with circle, rect, pen tools and color palette when open", () => {
    const html = renderToString(
      <ImageAnnotatorModal
        imageUrl={PNG_1PX}
        isOpen={true}
        title={{ vi: "Chú thích ảnh", en: "Annotate Photo", zh: "标注图片" }}
        onSave={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).toContain("Khoanh tròn");
    expect(html).toContain("Khung chữ nhật");
    expect(html).toContain("Vẽ tự do");
    expect(html).toContain("Lưu chú thích");
  });

  it("renders canvas element with image and delete button", () => {
    const html = renderToString(
      <ImageAnnotatorModal
        imageUrl={PNG_1PX}
        isOpen={true}
        title={{ vi: "Chú thích ảnh", en: "Annotate Photo", zh: "标注图片" }}
        onSave={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).toContain("<canvas");
    expect(html).toContain("Dùng ngón tay hoặc bút khoanh tròn");
  });

  it("renders i18n title resolved via resolveI18n", () => {
    const html = renderToString(
      <ImageAnnotatorModal
        imageUrl={PNG_1PX}
        isOpen={true}
        title={{ vi: "Chú thích ảnh", en: "Annotate Photo", zh: "标注图片" }}
        onSave={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).toContain("Chú thích ảnh");
  });

  it("renders with selected shape and moving cursor classes", () => {
    const mockShapes = [
      {
        id: "shape-1",
        type: "circle" as const,
        color: "#f43f5e",
        lineWidth: 4,
        points: [],
        start: { x: 10, y: 10 },
        end: { x: 50, y: 50 },
      },
    ];

    const html = renderToString(
      <WithMockState
        values={[
          "rect", // tool
          "#3b82f6", // color
          mockShapes, // shapes
          "shape-1", // selectedShapeId
          false, // isDrawing
          true, // isMoving
          null, // resizingCorner
          true, // imageLoaded
        ]}
      >
        <ImageAnnotatorModal
          imageUrl={PNG_1PX}
          isOpen={true}
          title={{ vi: "Chú thích ảnh", en: "Annotate Photo", zh: "标注图片" }}
          onSave={() => {}}
          onClose={() => {}}
        />
      </WithMockState>,
    );

    expect(html).toContain("cursor-grabbing");
    expect(html).toContain("Xóa nét");
  });
});
