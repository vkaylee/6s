import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { StatusBar } from "../src/components/StatusBar.tsx";

describe("StatusBar Component", () => {
  it("renders status bar and navigation actions", () => {
    const html = renderToString(<StatusBar onOpenDrawer={() => {}} />);
    expect(html).toContain("Ngoại tuyến");
  });
});
