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
});
