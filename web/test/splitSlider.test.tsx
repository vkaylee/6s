import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { SplitSlider } from "../src/components/SplitSlider.tsx";

describe("SplitSlider Component", () => {
  it("renders before and after image comparison slider", () => {
    const html = renderToString(
      <SplitSlider beforeUrl="/uploads/before/test.jpg" afterUrl="/uploads/after/test.jpg" />,
    );
    expect(html).toContain("/uploads/before/test.jpg");
    expect(html).toContain("/uploads/after/test.jpg");
  });
});
