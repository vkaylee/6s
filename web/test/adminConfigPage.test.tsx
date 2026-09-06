import { describe, expect, it } from "bun:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { AdminConfigPage } from "../src/pages/AdminConfigPage.tsx";
import type { LocationItem } from "../src/types/index.ts";

function WithMockState({ values, children }: { values: unknown[]; children: React.ReactNode }) {
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
    expect(html).toContain("Trí tuệ nhân tạo (AI)");
  });

  it("renders TAGS tab content", () => {
    const html = renderToString(
      <WithMockState values={[true, "TAGS"]}>
        <Router ssrPath="/admin/config">
          <AdminConfigPage />
        </Router>
      </WithMockState>,
    );
    expect(html).toContain("Gói từ điển ngành nhanh");
    expect(html).toContain("Thêm thẻ mới");
  });

  it("renders SCORING tab content with populated rules", () => {
    const html = renderToString(
      <WithMockState
        values={[
          true, // isHeaderVisible
          "SCORING", // activeTab
          {
            s1_base: 10,
            s2_base: 8,
            s3_base: 6,
            s4_base: 4,
            s5_base: 2,
            s6_base: 15,
          }, // rules
          "2026-03-01", // applyFrom
          "Cập nhật quy chế chấm điểm tháng 3", // reason
          true, // isRetroactive
          false, // isSaving
        ]}
      >
        <Router ssrPath="/admin/config">
          <AdminConfigPage />
        </Router>
      </WithMockState>,
    );
    expect(html).toContain("Chạm [-] [+] để tăng giảm bước nhảy 1 điểm (Quick Stepper)");
    expect(html).toContain("Cập nhật quy chế chấm điểm tháng 3");
  });

  it("renders AD tab content with connection details and test result", () => {
    const html = renderToString(
      <WithMockState
        values={[
          true, // isHeaderVisible
          "AD", // activeTab
          {}, // rules
          "", // applyFrom
          "", // reason
          false, // isRetroactive
          false, // isSaving
          true, // adEnabled
          "ad.factory.lan", // adServer
          636, // adPort
          true, // adUseTls
          "DC=factory,DC=lan", // adBaseDn
          "CN=svc_6s_auth,OU=Services,DC=factory,DC=lan", // adBindDn
          "", // adBindPassword
          "Kết nối LDAP thành công! Đã xác thực người dùng.", // adTestResult
        ]}
      >
        <Router ssrPath="/admin/config">
          <AdminConfigPage />
        </Router>
      </WithMockState>,
    );
    expect(html).toContain("Bật xác thực Active Directory / LDAP");
    expect(html).toContain("ad.factory.lan");
    expect(html).toContain("Kết nối LDAP thành công! Đã xác thực người dùng.");
  });

  it("renders NOTIFICATIONS tab content with test ping results and tokens", () => {
    const mockResults = [
      { channel: "WxPusher", success: true },
      { channel: "Webhook", success: false, error: "Network timeout" },
    ];
    const html = renderToString(
      <WithMockState
        values={[
          true, // 0: isHeaderVisible
          "NOTIFICATIONS", // 1: activeTab
          {}, // 2: rules
          "", // 3: applyFrom
          "", // 4: reason
          false, // 5: isRetroactive
          false, // 6: isSaving
          false, // 7: adEnabled
          "", // 8: adServer
          636, // 9: adPort
          true, // 10: adUseTls
          "", // 11: adBaseDn
          "", // 12: adBindDn
          "", // 13: adBindPassword
          null, // 14: adTestResult
          [], // 15: locations
          false, // 16: isLoadingLocations
          "", // 17: newCode
          "", // 18: newNameVi
          "", // 19: newNameZh
          "", // 20: newNameEn
          "", // 21: newQr
          false, // 22: isAddingLocation
          null, // 23: editingLocation
          "", // 24: editNameVi
          "", // 25: editNameZh
          "", // 26: editNameEn
          "", // 27: editQr
          false, // 28: isUpdatingLocation
          true, // 29: notifEnabled
          true, // 30: notifHasToken
          "AT_token_123", // 31: notifAppToken
          true, // 32: notifHasWebhook
          "http://hook.local", // 33: notifWebhookUrl
          "https://6s.factory.lan", // 34: notifBaseUrl
          false, // 35: isTestingNotif
          mockResults, // 36: notifTestResults
        ]}
      >
        <Router ssrPath="/admin/config">
          <AdminConfigPage />
        </Router>
      </WithMockState>,
    );
    expect(html).toContain("Bật thông báo qua WxPusher");
    expect(html).toContain("WxPusher");
    expect(html).toContain("✓ OK");
    expect(html).toContain("Network timeout");
  });

  it("renders AI tab content with models, api key status, and test results", () => {
    const dnsResult = {
      success: true,
      host: "api.openai.com",
      ips: ["10.0.0.1"],
      latency_ms: 25,
    };
    const testRes = {
      api_key: { success: true, latency_ms: 120, model_used: "gpt-4o" },
      default: { success: false, error: "Rate limit reached" },
    };
    const html = renderToString(
      <WithMockState
        values={[
          true, // 0: isHeaderVisible
          "AI", // 1: activeTab
          {}, // 2: rules
          "", // 3: applyFrom
          "", // 4: reason
          false, // 5: isRetroactive
          false, // 6: isSaving
          false, // 7: adEnabled
          "", // 8: adServer
          636, // 9: adPort
          true, // 10: adUseTls
          "", // 11: adBaseDn
          "", // 12: adBindDn
          "", // 13: adBindPassword
          null, // 14: adTestResult
          [], // 15: locations
          false, // 16: isLoadingLocations
          "", // 17: newCode
          "", // 18: newNameVi
          "", // 19: newNameZh
          "", // 20: newNameEn
          "", // 21: newQr
          false, // 22: isAddingLocation
          null, // 23: editingLocation
          "", // 24: editNameVi
          "", // 25: editNameZh
          "", // 26: editNameEn
          "", // 27: editQr
          false, // 28: isUpdatingLocation
          true, // 29: notifEnabled
          false, // 30: notifHasToken
          "", // 31: notifAppToken
          false, // 32: notifHasWebhook
          "", // 33: notifWebhookUrl
          "", // 34: notifBaseUrl
          false, // 35: isTestingNotif
          null, // 36: notifTestResults
          true, // 37: aiEnabled
          "https://ai.factory.lan/v1", // 38: aiBaseUrl
          true, // 39: aiHasApiKey
          "", // 40: aiApiKey
          "gpt-4o", // 41: aiDefaultModel
          "gpt-4o-mini", // 42: aiModelTranslate
          "gpt-4o", // 43: aiModelVision
          "gpt-4o-mini", // 44: aiModelSummary
          null, // 45: testingTarget
          testRes, // 46: testResults
          dnsResult, // 47: dnsTestResult
        ]}
      >
        <Router ssrPath="/admin/config">
          <AdminConfigPage />
        </Router>
      </WithMockState>,
    );
    expect(html).toContain("Kích hoạt dịch vụ AI");
    expect(html).toContain("api.openai.com");
    expect(html).toContain("Rate limit reached");
  });

  it("renders TAGS tab content with populated tags list", () => {
    const mockTags = [
      {
        code: "TAG_5S",
        name_vi: "Chuẩn 5S",
        name_zh: "5S标准",
        name_en: "5S Standard",
        category: "1S",
        use_count: 12,
        is_active: true,
      },
      {
        code: "TAG_CLEAN",
        name_vi: "Vệ sinh",
        category: "3S",
        use_count: 0,
        is_active: false,
      },
    ];
    const html = renderToString(
      <WithMockState
        values={[
          true, // 0: isHeaderVisible
          "TAGS", // 1: activeTab
          {}, // 2: rules
          "", // 3: applyFrom
          "", // 4: reason
          false, // 5: isRetroactive
          false, // 6: isSaving
          false, // 7: adEnabled
          "", // 8: adServer
          636, // 9: adPort
          true, // 10: adUseTls
          "", // 11: adBaseDn
          "", // 12: adBindDn
          "", // 13: adBindPassword
          null, // 14: adTestResult
          [], // 15: locations
          false, // 16: isLoadingLocations
          "", // 17: newCode
          "", // 18: newNameVi
          "", // 19: newNameZh
          "", // 20: newNameEn
          "", // 21: newQr
          false, // 22: isAddingLocation
          null, // 23: editingLocation
          "", // 24: editNameVi
          "", // 25: editNameZh
          "", // 26: editNameEn
          "", // 27: editQr
          false, // 28: isUpdatingLocation
          true, // 29: notifEnabled
          false, // 30: notifHasToken
          "", // 31: notifAppToken
          false, // 32: notifHasWebhook
          "", // 33: notifWebhookUrl
          "", // 34: notifBaseUrl
          false, // 35: isTestingNotif
          null, // 36: notifTestResults
          false, // 37: aiEnabled
          "", // 38: aiBaseUrl
          false, // 39: aiHasApiKey
          "", // 40: aiApiKey
          "", // 41: aiDefaultModel
          "", // 42: aiModelTranslate
          "", // 43: aiModelVision
          "", // 44: aiModelSummary
          null, // 45: testingTarget
          {}, // 46: testResults
          null, // 47: dnsTestResult
          mockTags, // 48: tags
          false, // 49: isLoadingTags
          "", // 50: tagCode
          "1S", // 51: tagCategory
          "", // 52: tagNameVi
          "", // 53: tagNameZh
          "", // 54: tagNameEn
          false, // 55: isAddingTag
        ]}
      >
        <Router ssrPath="/admin/config">
          <AdminConfigPage />
        </Router>
      </WithMockState>,
    );
    expect(html).toContain("TAG_5S");
    expect(html).toContain("Chuẩn 5S");
    expect(html).toContain("TAG_CLEAN");
  });

  it("renders LOCATIONS tab with multiple locations and status buttons", () => {
    const mockLocs: LocationItem[] = [
      {
        code: "LINE_A1",
        name_vi: "Chuyền May A1",
        name_zh: "一号线",
        name_en: "Line A1",
        is_active: true,
      },
      {
        code: "LINE_B2",
        name_vi: "Chuyền May B2",
        name_zh: "二号线",
        name_en: "Line B2",
        is_active: false,
      },
    ];
    const html = renderToString(
      <WithMockState
        values={[
          true, // 0: isHeaderVisible
          "LOCATIONS", // 1: activeTab
          {}, // 2: rules
          "", // 3: applyFrom
          "", // 4: reason
          false, // 5: isRetroactive
          false, // 6: isSaving
          false, // 7: adEnabled
          "", // 8: adServer
          636, // 9: adPort
          true, // 10: adUseTls
          "", // 11: adBaseDn
          "", // 12: adBindDn
          "", // 13: adBindPassword
          null, // 14: adTestResult
          mockLocs, // 15: locations
          false, // 16: isLoadingLocations
        ]}
      >
        <Router ssrPath="/admin/config">
          <AdminConfigPage />
        </Router>
      </WithMockState>,
    );
    expect(html).toContain("LINE_A1");
    expect(html).toContain("Chuyền May A1");
    expect(html).toContain("LINE_B2");
  });

  it("renders location edit modal when editingLocation is selected", () => {
    const mockEditLoc: LocationItem = {
      code: "LINE_A1",
      name_vi: "Chuyền May A1",
      name_zh: "车间 A1",
      name_en: "Sewing Line A1",
      qr_code: "QR_A1",
      is_active: true,
    };
    const html = renderToString(
      <WithMockState
        values={[
          true, // isHeaderVisible (hook 0)
          "LOCATIONS", // activeTab (hook 1)
          {}, // rules (hook 2)
          "", // applyFrom (hook 3)
          "", // reason (hook 4)
          false, // isRetroactive (hook 5)
          false, // isSaving (hook 6)
          false, // adEnabled (hook 7)
          "ad.factory.lan", // adServer (hook 8)
          636, // adPort (hook 9)
          true, // adUseTls (hook 10)
          "DC=factory,DC=lan", // adBaseDn (hook 11)
          "CN=svc_6s_auth,OU=Services,DC=factory,DC=lan", // adBindDn (hook 12)
          "", // adBindPassword (hook 13)
          null, // adTestResult (hook 14)
          [mockEditLoc], // locations (hook 15)
          false, // isLoadingLocations (hook 16)
          "", // newCode (hook 17)
          "", // newNameVi (hook 18)
          "", // newNameZh (hook 19)
          "", // newNameEn (hook 20)
          "", // newQr (hook 21)
          false, // isAddingLocation (hook 22)
          mockEditLoc, // editingLocation (hook 23)
          "Chuyền May A1", // editNameVi (hook 24)
          "车间 A1", // editNameZh (hook 25)
          "Sewing Line A1", // editNameEn (hook 26)
          "QR_A1", // editQr (hook 27)
          false, // isUpdatingLocation (hook 28)
        ]}
      >
        <Router ssrPath="/admin/config">
          <AdminConfigPage />
        </Router>
      </WithMockState>,
    );
    expect(html).toContain("Chỉnh sửa vị trí");
    expect(html).toContain("LINE_A1");
    expect(html).toContain("Lưu thay đổi");
  });
});
