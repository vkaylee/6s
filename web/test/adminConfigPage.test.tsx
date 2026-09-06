import { describe, expect, it } from "bun:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { AdminConfigPage } from "../src/pages/AdminConfigPage.tsx";

function WithMockState({
  values,
  children,
}: {
  values: unknown[];
  children: React.ReactNode;
}) {
  const internals = (
    React as unknown as {
      __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: {
        ReactCurrentDispatcher: {
          current: { useState: (init: unknown) => [unknown, () => void] };
        };
      };
    }
  ).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
  let idx = 0;
  internals.current.useState = (init: unknown) => {
    const val =
      idx < values.length
        ? values[idx++]
        : typeof init === "function"
          ? (init as () => unknown)()
          : init;
    return [val, () => {}];
  };
  return <>{children}</>;
}

describe("AdminConfigPage UI and tabs", () => {
  it("renders admin config page with locations tab by default", () => {
    const html = renderToString(
      <Router ssrPath="/admin/config">
        <AdminConfigPage />
      </Router>,
    );
    expect(html).toContain("LINE_A3");
    expect(html).toContain("LOC:");
  });

  it("renders all five configuration tab triggers with proper localization", () => {
    const html = renderToString(
      <Router ssrPath="/admin/config">
        <AdminConfigPage />
      </Router>,
    );
    expect(html).toContain("Vị trí xưởng");
    expect(html).toContain("Danh mục Thẻ");
    expect(html).toContain("Điểm số 6S");
    expect(html).toContain("Active Directory");
    expect(html).toContain("Kênh thông báo");
  });

  it("renders TAGS tab content", () => {
    const html = renderToString(
      <WithMockState values={[true, "TAGS"]}>
          <AdminConfigPage />
        </Router>
      </WithMockState>,
    );
    expect(html).toContain("Gói từ điển ngành nhanh");
    expect(html).toContain("Thêm thẻ mới");
  });

  it("renders SCORING tab content", () => {
    const html = renderToString(
      <WithMockState values={[true, "SCORING"]}>
          <AdminConfigPage />
        </Router>
      </WithMockState>,
    );
    expect(html).toContain("Chạm [-] [+] để tăng giảm bước nhảy 1 điểm (Quick Stepper)");
  });

  it("renders AD tab content", () => {
    const html = renderToString(
      <WithMockState values={[true, "AD"]}>
          <AdminConfigPage />
        </Router>
      </WithMockState>,
    );
    expect(html).toContain("Cấu hình AD / LDAP");
  });

  it("renders NOTIFICATIONS tab content", () => {
    const html = renderToString(
      <WithMockState values={[true, "NOTIFICATIONS"]}>
          <AdminConfigPage />
        </Router>
      </WithMockState>,
    );
    expect(html).toContain("Bật thông báo qua WxPusher");
  });
});
