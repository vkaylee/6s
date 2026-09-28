import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act } from "react";
import { useI18nStore } from "../src/i18n/index.ts";
import { IssueDetailModal } from "../src/pages/IssueDetailModal.tsx";
import { useAuthStore } from "../src/store/authStore.ts";
import { useMasterdataStore } from "../src/store/masterdataStore.ts";
import {
  baseIssue,
  button,
  calls,
  cleanupMounted,
  installFetch,
  locations,
  mount,
  mutations,
  resetCalls,
  resetTestState,
} from "./issueDetailModal.fixtures.tsx";

beforeEach(resetTestState);
afterEach(cleanupMounted);

describe("IssueDetailModal - Rendering & AI", () => {
  it("returns an empty surface when closed and renders authoritative issue metadata when open", async () => {
    installFetch({ issue: baseIssue({ reject_reason: "Anh mo khong dung" }) });
    const closed = await mount(
      <IssueDetailModal
        issue={baseIssue()}
        isOpen={false}
        onClose={() => {}}
        onRefresh={() => {}}
      />,
    );
    expect(closed.innerHTML).toBe("");

    const open = await mount(
      <IssueDetailModal
        issue={baseIssue({ reject_reason: "Anh mo khong dung" })}
        isOpen={true}
        onClose={() => {}}
        onRefresh={() => {}}
        locations={locations as never}
      />,
    );
    const text = open.textContent ?? "";
    expect(text).toContain("#101");
    expect(text).toContain("Chuyen May A1");
    expect(text).toContain("Dau loang duoi san may");
    expect(text).toContain("Mới ghi nhận");
    expect(text).toContain("Anh mo khong dung");
    expect(text).toContain("Biến động điểm 6S của sự cố");
  });

  it("shows the localized score rule label and signed points returned for the issue", async () => {
    installFetch({ issue: baseIssue() });
    const baseFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("score-logs")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 1,
                issue_id: 101,
                target_type: "LOCATION",
                target_id: "LINE_A1",
                rule_key: "penalty_normal",
                rule_description: "x",
                points: -2,
                created_at: "2026-03-02T00:00:00Z",
              },
            ],
          }),
          { status: 200 },
        );
      }
      return baseFetch(input as never, init);
    }) as typeof fetch;

    const container = await mount(
      <IssueDetailModal
        issue={baseIssue()}
        isOpen={true}
        onClose={() => {}}
        onRefresh={() => {}}
      />,
    );
    expect(container.textContent).toContain("Trừ điểm sự cố thường");
    expect(container.textContent).toContain("-2");

    await act(async () => {
      useI18nStore.getState().setLocale("en");
    });
    expect(container.textContent).toContain("Normal issue penalty");
  });

  it("hides AI controls while the server reports AI disabled", async () => {
    installFetch({ ai: false, issue: baseIssue() });
    const container = await mount(
      <IssueDetailModal
        issue={baseIssue()}
        isOpen={true}
        onClose={() => {}}
        onRefresh={() => {}}
      />,
    );
    expect(container.textContent).toContain("AI đang tắt");
    expect(button(container, "Phân tích AI")).toBeUndefined();
    expect(mutations()).toEqual([]);
  });

  it("requests an AI review, renders it before assignment card, allows collapsing and applies suggestions", async () => {
    installFetch({ ai: true, issue: baseIssue() });
    const container = await mount(
      <IssueDetailModal
        issue={baseIssue()}
        isOpen={true}
        onClose={() => {}}
        onRefresh={() => {}}
      />,
    );

    await act(async () => {
      button(container, "Phân tích AI")?.click();
    });
    await act(async () => {});
    const review = calls.find((call) => call.url.includes("/api/ai/review"));
    expect(review?.method).toBe("POST");
    expect(review?.body).toContain('"issue_id":101');
    expect(container.textContent).toContain("Đánh giá từ AI");
    expect(container.textContent).toContain("Phân loại không khớp");
    expect(container.textContent).toContain("AI đề xuất phân loại");

    const aiPanelPos = container.textContent?.indexOf("Đánh giá từ AI") ?? -1;
    const assignmentPos = container.textContent?.indexOf("Phân công & trách nhiệm") ?? -1;
    expect(aiPanelPos).toBeGreaterThan(-1);
    expect(assignmentPos).toBeGreaterThan(-1);
    expect(aiPanelPos).toBeLessThan(assignmentPos);

    await act(async () => {
      button(container, "Thu gọn")?.click();
    });
    expect(container.textContent).not.toContain("AI đề xuất phân loại");
    expect(button(container, "Xem chi tiết")).toBeDefined();

    await act(async () => {
      button(container, "Xem chi tiết")?.click();
    });
    expect(container.textContent).toContain("AI đề xuất phân loại");

    await act(async () => {
      button(container, "Áp dụng")?.click();
    });
    await act(async () => {});
    const applied = mutations().find((call) => call.method === "PATCH");
    expect(applied?.url).toContain("/api/issues/101");
    expect(applied?.body).toContain('"category":"5S"');
    expect(container.textContent).toContain("AI đề xuất phân loại: 5S");

    await act(async () => {
      button(container, "Dịch AI")?.click();
    });
    await act(async () => {});
    expect(calls.some((call) => call.url.includes("/api/ai/translate"))).toBe(true);
    expect(container.textContent).toContain("Oil spilled on the floor");

    await act(async () => {
      button(container, "Xem bản gốc")?.click();
    });
    expect(container.textContent).toContain("Dau loang duoi san may");
  });

  it("includes selected proposed tags when re-requesting AI review", async () => {
    installFetch({
      ai: true,
      issue: baseIssue(),
      reviewResult: {
        verdict: "REVIEW",
        feedback: "Cần xem xét nhãn mới.",
        suggestion: {
          proposed_tags: [
            { name_vi: "Mùi khét máy", name_zh: "焦味", name_en: "Burning smell", category: "3S" },
          ],
        },
        used_vision: false,
      },
    });
    const container = await mount(
      <IssueDetailModal
        issue={baseIssue()}
        isOpen={true}
        onClose={() => {}}
        onRefresh={() => {}}
      />,
    );

    // First AI review
    await act(async () => {
      button(container, "Phân tích AI")?.click();
    });
    await act(async () => {});

    expect(container.textContent).toContain("Mùi khét máy");
    expect(container.textContent).toContain("AI đề xuất thẻ mới");

    // Click proposed tag button to select it
    const tagBtn = button(container, "Mùi khét máy");
    expect(tagBtn).toBeDefined();
    await act(async () => {
      tagBtn?.click();
    });
    await act(async () => {});

    // Verify patch was triggered with proposed_tags
    const patchCall = mutations().find((call) => call.method === "PATCH");
    expect(patchCall?.body).toContain('"proposed_tags":[{"name_vi":"Mùi khét máy"');

    // Re-run AI review
    resetCalls();
    await act(async () => {
      button(container, "Phân tích AI")?.click();
    });
    await act(async () => {});

    const reReview = calls.find((call) => call.url.includes("/api/ai/review"));
    expect(reReview).toBeDefined();
    expect(reReview?.body).toContain('"proposed_tags":[{"name_vi":"Mùi khét máy"');
  });

  it("switches modal tabs and toggles anchored quick edit popovers", async () => {
    useAuthStore.setState({
      user: {
        id: 1,
        username: "admin",
        full_name: "Admin User",
        role: "ADMIN" as never,
        capabilities: ["issue:close_any", "issue:close_own"],
      },
    });
    const issue = baseIssue({
      responsibility_history: [
        {
          id: 1,
          action: "ASSIGN",
          changed_by: 1,
          changed_by_name: "Admin User",
          old_value: null,
          new_value: { assigned_team_id: 7 },
          created_at: "2026-09-24T00:00:00Z",
        },
      ],
    });
    installFetch({ issue, ai: true });
    const container = await mount(
      <IssueDetailModal issue={issue} isOpen={true} onClose={() => {}} onRefresh={() => {}} />,
    );

    // Initial Overview tab
    expect(container.textContent).toContain("Tổng quan");
    expect(container.textContent).toContain("Đánh giá AI");
    expect(container.textContent).toContain("Lịch sử & Điểm số");

    // Click AI review tab
    const aiTab = Array.from(container.querySelectorAll('button[role="tab"]')).find((b) =>
      b.textContent?.includes("Đánh giá AI"),
    ) as HTMLButtonElement | undefined;
    expect(aiTab).toBeDefined();
    await act(async () => {
      aiTab?.click();
    });
    await act(async () => {});
    expect(aiTab?.getAttribute("aria-selected")).toBe("true");

    // Click History tab
    const historyTab = Array.from(container.querySelectorAll('button[role="tab"]')).find((b) =>
      b.textContent?.includes("Lịch sử & Điểm số"),
    ) as HTMLButtonElement | undefined;
    expect(historyTab).toBeDefined();
    await act(async () => {
      historyTab?.click();
    });
    await act(async () => {});
    expect(historyTab?.getAttribute("aria-selected")).toBe("true");
    expect(container.textContent).toContain("Lịch sử phân công");

    // Test quick category edit popover
    const catEditBtn = container.querySelector(
      'button[title="Chạm để sửa nhanh phân loại S"]',
    ) as HTMLButtonElement | null;
    expect(catEditBtn).not.toBeNull();
    await act(async () => {
      catEditBtn?.click();
    });
    await act(async () => {});
    expect(catEditBtn?.getAttribute("aria-expanded")).toBe("true");
  });

  it("renders responsibility metadata as vertically stacked rows without text truncation ellipsis", async () => {
    useAuthStore.setState({
      user: {
        id: 1,
        username: "admin",
        full_name: "Admin User",
        role: "ADMIN" as never,
        capabilities: ["issue:assign"],
      },
    });
    const longAssetName = "Hệ thống băng chuyền phân loại tự động khu vực dập khuôn A";
    const longTeamName = "Đội ngũ chuyên trách bảo trì thiết bị và cơ điện nhà xưởng 2";
    useMasterdataStore.setState({
      assets: [
        {
          id: 42,
          asset_code: "EQ-CONV-A1-EXTRA-LONG-CODE",
          name: longAssetName,
          location_code: "LINE_A1",
          is_active: true,
        } as never,
      ],
      teams: [
        {
          id: 77,
          code: "MAINT-HVAC-MECH-TEAM",
          name: longTeamName,
          is_active: true,
        } as never,
      ],
      membersByTeam: {
        77: [
          {
            id: 99,
            username: "nguyenvana_long_username",
            full_name: "Kỹ sư trưởng Nguyễn Văn Hoàng Nam Long",
            role: "MAINTENANCE",
            is_active: true,
          } as never,
        ],
      },
      membersStatusByTeam: { 77: "ready" },
      status: "ready",
    });

    installFetch({
      issue: baseIssue({
        asset_id: 42,
        assigned_team_id: 77,
        assignee_id: 99,
        allowed_actions: { assign: true, verify_cause: false, resolve: false, close: false },
      }),
    });

    const container = await mount(
      <IssueDetailModal
        issue={baseIssue({
          asset_id: 42,
          assigned_team_id: 77,
          assignee_id: 99,
          allowed_actions: { assign: true, verify_cause: false, resolve: false, close: false },
        })}
        isOpen={true}
        onClose={() => {}}
        onRefresh={() => {}}
        locations={locations as never}
      />,
    );

    const responsibilitySection = container.querySelector(
      'section[aria-labelledby="assignment-title"]',
    );
    expect(responsibilitySection).not.toBeNull();

    // Assert stacked divide-y container instead of 3-column grid
    expect(responsibilitySection?.querySelector(".sm\\:grid-cols-3")).toBeNull();
    expect(responsibilitySection?.querySelector(".divide-y")).not.toBeNull();

    // Assert long names are rendered in DOM with break-words and no truncate ellipsis class
    const text = responsibilitySection?.textContent ?? "";
    expect(text).toContain(`EQ-CONV-A1-EXTRA-LONG-CODE — ${longAssetName}`);
    expect(text).toContain(`${longTeamName} (MAINT-HVAC-MECH-TEAM)`);
    expect(text).toContain("Kỹ sư trưởng Nguyễn Văn Hoàng Nam Long");

    const values = responsibilitySection?.querySelectorAll(".break-words");
    expect(values?.length).toBeGreaterThanOrEqual(3);
    expect(responsibilitySection?.querySelectorAll(".truncate").length).toBe(0);
  });
});
