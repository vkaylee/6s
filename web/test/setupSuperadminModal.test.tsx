import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { SetupSuperadminModal } from "../src/pages/SetupSuperadminModal.tsx";

describe("SetupSuperadminModal Component", () => {
  it("returns null when isOpen is false", () => {
    const html = renderToString(<SetupSuperadminModal isOpen={false} onSuccess={() => {}} />);
    expect(html).toBe("");
  });

  it("renders superadmin setup form inputs when isOpen is true", () => {
    const html = renderToString(<SetupSuperadminModal isOpen={true} onSuccess={() => {}} />);
    expect(html).toContain("admin");
    expect(html).toContain('type="password"');
  });
});
