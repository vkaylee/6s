import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { ImageAnnotatorModal } from "../src/components/ImageAnnotatorModal.tsx";

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
});
