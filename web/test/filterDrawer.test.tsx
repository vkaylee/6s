import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { FilterDrawer, type FilterState } from "../src/components/FilterDrawer.tsx";
import type { LocationItem } from "../src/types/index.ts";

describe("FilterDrawer Component", () => {
  const mockLocations: LocationItem[] = [
    {
      code: "LINE_01",
      name_vi: "Chuyền may 1",
      name_en: "Sewing Line 1",
      name_zh: "缝纫1线",
      is_active: true,
    },
    {
      code: "WAREHOUSE",
      name_vi: "Kho nguyên liệu",
      name_en: "Raw Material Warehouse",
      name_zh: "原料仓",
      is_active: true,
    },
  ];

  const initialFilters: FilterState = {
    statuses: [],
    categories: [],
    locationCodes: [],
  };

  it("does not render when isOpen is false", () => {
    const html = renderToString(
      <FilterDrawer
        isOpen={false}
        onClose={() => {}}
        locations={mockLocations}
        filters={initialFilters}
        onApply={() => {}}
        onReset={() => {}}
      />,
    );
    expect(html).toBe("");
  });

  it("renders filter options when isOpen is true", () => {
    const html = renderToString(
      <FilterDrawer
        isOpen={true}
        onClose={() => {}}
        locations={mockLocations}
        filters={initialFilters}
        onApply={() => {}}
        onReset={() => {}}
      />,
    );
    expect(html).toContain("LINE_01");
    expect(html).toContain("WAREHOUSE");
    expect(html).toContain("1S");
    expect(html).toContain("6S");
  });

  it("highlights selected filter values", () => {
    const activeFilters: FilterState = {
      statuses: ["OPEN"],
      categories: ["6S"],
      locationCodes: ["LINE_01"],
    };
    const html = renderToString(
      <FilterDrawer
        isOpen={true}
        onClose={() => {}}
        locations={mockLocations}
        filters={activeFilters}
        onApply={() => {}}
        onReset={() => {}}
      />,
    );
    expect(html).toContain("bg-rose-600");
  });
});
