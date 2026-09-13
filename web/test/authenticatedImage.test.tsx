import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { AuthenticatedImage } from "../src/components/AuthenticatedImage.tsx";

describe("AuthenticatedImage", () => {
  it("renders the resolved source and pending accessibility state", () => {
    const html = renderToString(
      <AuthenticatedImage
        imageUrl="data:image/png;base64,placeholder"
        alt="Issue photo"
        className="h-24 w-32 object-cover"
      />,
    );

    expect(html).toContain('src="data:image/png;base64,placeholder"');
    expect(html).toContain('alt="Issue photo"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("h-24 w-32 object-cover");
  });

  it("keeps caller sizing and image attributes intact", () => {
    const html = renderToString(
      <AuthenticatedImage
        imageUrl="blob:preview"
        alt="Preview"
        className="absolute inset-0 object-contain"
        loading="lazy"
        draggable={false}
      />,
    );

    expect(html).toContain("absolute inset-0 object-contain");
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('draggable="false"');
  });

  it("renders no source when the image URL is missing", () => {
    const html = renderToString(<AuthenticatedImage imageUrl={null} alt="Empty" />);

    expect(html).not.toContain("src=");
  });

  it("renders transparent GIF placeholder for SSR loading state", () => {
    const html = renderToString(
      <AuthenticatedImage imageUrl="https://example.com/a.png" alt="Test" />,
    );
    // SSR always shows a valid src (the URL passed) and aria-busy.
    expect(html).toContain('src="https://example.com/a.png"');
    expect(html).toContain('aria-busy="true"');
  });
});
