import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { OfflineOutboxDrawer } from "../src/components/OfflineOutboxDrawer.tsx";

describe("OfflineOutboxDrawer Component", () => {
  it("returns null when isOpen is false", () => {
    const html = renderToString(<OfflineOutboxDrawer isOpen={false} onClose={() => {}} />);
    expect(html).toBe("");
  });

  it("renders drawer header and controls when isOpen is true", () => {
    const html = renderToString(<OfflineOutboxDrawer isOpen={true} onClose={() => {}} />);
    expect(html).toContain("Hàng đợi ngoại tuyến");
  });
});
