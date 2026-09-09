import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { LocationCombobox } from "../src/components/LocationCombobox.tsx";
import type { LocationItem } from "../src/types/index.ts";

const locations = [
  { code: "LINE_A", name_vi: "Dây chuyền A", name_en: "Line A", name_zh: "A线" },
  { code: "LINE_B", name_vi: "Dây chuyền B", name_en: "Line B", name_zh: "B线" },
] as LocationItem[];

describe("LocationCombobox", () => {
  it("renders a touch-first location trigger", () => {
    const html = renderToString(
      <LocationCombobox locations={locations} value="" onChange={() => {}} />,
    );
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("Chọn vị trí");
  });

  it("renders the selected location on the trigger", () => {
    const html = renderToString(
      <LocationCombobox locations={locations} value="LINE_A" onChange={() => {}} />,
    );
    expect(html).toContain("Dây chuyền A");
    expect(html).toContain("LINE_A");
  });
});
