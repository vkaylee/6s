import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { SplitSlider } from "../src/components/SplitSlider.tsx";

describe("SplitSlider Component", () => {
  it("renders before and after image comparison slider", () => {
    const html = renderToString(
      <SplitSlider
        beforeUrl="/api/issues/1/media/before/test.jpg"
        afterUrl="/api/issues/1/media/after/test.jpg"
        onPhotoClick={() => {}}
      />,
    );
    expect(html).toContain("/api/issues/1/media/before/test.jpg");
    expect(html).toContain("/api/issues/1/media/after/test.jpg");
  });

  it("constrains its container to a bounded box so absolute images do not cover the modal", () => {
    const html = renderToString(
      <SplitSlider
        beforeUrl="/api/issues/1/media/before/test.jpg"
        afterUrl="/api/issues/1/media/after/test.jpg"
        onPhotoClick={() => {}}
      />,
    );
    const containerMatch = html.match(/<div[^>]*role="slider"[^>]*>/);
    expect(containerMatch).not.toBeNull();
    const container = containerMatch?.[0] ?? "";
    const classAttr = container.match(/class="([^"]*)"/)?.[1] ?? "";
    expect(classAttr).toContain("relative");
    expect(classAttr).toContain("aspect-[4/3]");
    expect(classAttr).toContain("w-full");
    expect(classAttr).toContain("overflow-hidden");
  });

  it("disables native image dragging and text selection for repeatable dragging", () => {
    const html = renderToString(
      <SplitSlider beforeUrl="/before.jpg" afterUrl="/after.jpg" onPhotoClick={() => {}} />,
    );
    expect(html).toContain('draggable="false"');
    expect(html).toContain("select-none");
    expect(html).toContain("pointer-events-none");
  });
});
