import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { invalidateAiStatus } from "../src/hooks/useAiStatus.ts";
import { useI18nStore } from "../src/i18n/index.ts";
import { IssueDetailModal } from "../src/pages/IssueDetailModal.tsx";
import { useAuthStore } from "../src/store/authStore.ts";
import { useMasterdataStore } from "../src/store/masterdataStore.ts";
import { IssueCategory, type IssueItem, IssueStatus } from "../src/types/index.ts";

beforeAll(() => {
  GlobalRegistrator.register({ url: "https://6s.test/" });
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  await GlobalRegistrator.unregister();
});

type Call = { method: string; url: string; body: string };
let calls: Call[] = [];
const originalFetch = globalThis.fetch;
const mounted: { root: Root; container: HTMLElement }[] = [];

const baseIssue = (over: Partial<IssueItem> = {}): IssueItem => ({
  id: 101,
  client_uuid: "c0a80101-0000-4000-8000-000000000101",
  version: 1,
  category: IssueCategory.S3,
  location_code: "LINE_A1",
  location_name: "Chuyen May A1",
  description: "Dau loang duoi san may",
  status: IssueStatus.OPEN,
  creator_id: 10,
  creator_name: "Nguyen Van A",
  tags: [],
  created_at: "2026-03-01T00:00:00Z",
  photo_before: "/api/issues/101/media/before/before.jpg",
  photo_detail: "/api/issues/101/media/detail/detail.jpg",
  ...over,
});

const locations = [
  { code: "LINE_A1", name_vi: "Chuyen May A1", name_en: "Line A1", name_zh: "A1", is_active: true },
];

/** Serves every endpoint the detail modal touches and echoes mutations onto the issue. */
function installFetch({ ai = false, issue }: { ai?: boolean; issue: IssueItem }) {
  calls = [];
  invalidateAiStatus();
  let serverIssue: IssueItem = { ...issue };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const body = typeof init?.body === "string" ? init.body : "";
    calls.push({ method: init?.method ?? "GET", url, body });
    const send = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 });
    if (url.includes("/api/ai/status")) return send({ enabled: ai });
    if (url.includes("/api/ai/cached")) return send({ cached: false });
    if (url.includes("score-logs")) return send([]);
    if (url.includes("/api/ai/review-follow-up")) return send({ answer: "Theo hinh anh" });
    if (url.includes("/api/ai/review")) {
      return send({
        verdict: "MISMATCH",
        feedback: "Anh khong khop phan loai",
        suggestion: { category: "5S" },
        used_vision: false,
      });
    }
    if (url.includes("/api/ai/translate"))
      return send({ translated_text: "Oil spilled on the floor" });
    if (url.endsWith("/api/assets") || url.endsWith("/api/teams")) return send([]);
    if (init?.method === "PATCH") {
      serverIssue = { ...serverIssue, ...(JSON.parse(body || "{}") as Partial<IssueItem>) };
      return send(serverIssue);
    }
    if (url.includes("/close")) return send({ ...serverIssue, status: IssueStatus.CLOSED });
    if (url.includes("/reopen")) return send({ ...serverIssue, status: IssueStatus.OPEN });
    if (url.includes("/invalid")) return send({ ...serverIssue, status: IssueStatus.INVALID });
    return send(serverIssue);
  }) as typeof fetch;
}

async function mount(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => {
    root.render(element);
  });
  await act(async () => {});
  return container;
}

function button(container: HTMLElement, text: string) {
  return (Array.from(container.querySelectorAll("button")) as HTMLButtonElement[]).find((item) =>
    (item.textContent ?? "").includes(text),
  );
}

function selectByLabel(container: HTMLElement, label: string) {
  return (Array.from(container.querySelectorAll("select")) as HTMLSelectElement[]).find(
    (item) => item.getAttribute("aria-label") === label,
  );
}

async function choose(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => {});
}

const mutations = () => calls.filter((call) => call.method !== "GET");

beforeEach(() => {
  useI18nStore.getState().setLocale("vi");
  useAuthStore.setState({ user: null });
  useMasterdataStore.setState({
    assets: [],
    teams: [{ id: 7, code: "TM", name: "To May", is_active: true } as never],
    membersByTeam: {},
    membersStatusByTeam: {},
    status: "ready",
  });
});

afterEach(async () => {
  while (mounted.length > 0) {
    const entry = mounted.pop();
    await act(async () => {
      entry?.root.unmount();
    });
    entry?.container.remove();
  }
  globalThis.fetch = originalFetch;
  invalidateAiStatus();
  useI18nStore.getState().setLocale("vi");
});

describe("IssueDetailModal Component", () => {
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
    expect(button(container, "Hỏi AI")).toBeUndefined();
    expect(mutations()).toEqual([]);
  });

  it("requests an AI review, applies the suggested category and restores the original text after translating", async () => {
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
      button(container, "Hỏi AI")?.click();
    });
    await act(async () => {});
    const review = calls.find((call) => call.url.includes("/api/ai/review"));
    expect(review?.method).toBe("POST");
    expect(review?.body).toContain('"issue_id":101');
    expect(container.textContent).toContain("Phân loại không khớp");
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

  it("opens the photo gallery and navigates it with zoom, arrows and Escape", async () => {
    installFetch({ issue: baseIssue() });
    const container = await mount(
      <IssueDetailModal
        issue={baseIssue()}
        isOpen={true}
        onClose={() => {}}
        onRefresh={() => {}}
      />,
    );
    const photoButton = (
      Array.from(container.querySelectorAll("button")) as HTMLButtonElement[]
    ).find((item) => item.querySelector('img[alt="Trước khắc phục"]'));
    await act(async () => {
      photoButton?.click();
    });
    await act(async () => {});
    expect(
      container.querySelector("#issue-photo-preview-title")?.closest('[role="dialog"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("1 / 2");
    expect(container.textContent).toContain("TRƯỚC");

    await act(async () => {
      button(container, "Phóng to")?.click();
    });
    expect(container.textContent).toContain("125%");

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    });
    expect(container.textContent).toContain("2 / 2");

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(
      container.querySelector("#issue-photo-preview-title")?.closest('[role="dialog"]'),
    ).toBeFalsy();
  });

  it("renders the responsibility history and saves assignment plus cause verification with the current version", async () => {
    installFetch({
      issue: baseIssue({
        version: 3,
        allowed_actions: { assign: true, verify_cause: true, resolve: false, close: false },
        cause_status: "UNVERIFIED",
        responsibility_history: [
          {
            id: 1,
            action: "ASSIGN",
            changed_by: 1,
            changed_by_name: "Admin",
            old_value: null,
            new_value: null,
            created_at: "2026-03-02T10:00:00Z",
          },
        ],
      }),
    });
    const container = await mount(
      <IssueDetailModal
        issue={baseIssue({
          version: 3,
          allowed_actions: { assign: true, verify_cause: true, resolve: false, close: false },
          cause_status: "UNVERIFIED",
          responsibility_history: [
            {
              id: 1,
              action: "ASSIGN",
              changed_by: 1,
              changed_by_name: "Admin",
              old_value: null,
              new_value: null,
              created_at: "2026-03-02T10:00:00Z",
            },
          ],
        })}
        isOpen={true}
        onClose={() => {}}
        onRefresh={() => {}}
        locations={locations as never}
      />,
    );
    expect(container.textContent).toContain("Lịch sử phân công");
    expect(container.textContent).toContain("Admin");

    await act(async () => {
      button(container, "Điều chỉnh phân công")?.click();
    });
    await act(async () => {});
    const teamSelect = selectByLabel(container, "Đơn vị xử lý");
    expect(teamSelect).toBeDefined();
    await choose(teamSelect as HTMLSelectElement, "7");
    await act(async () => {
      button(container, "Lưu")?.click();
    });
    await act(async () => {});
    const assignment = mutations().find((call) => call.method === "PATCH");
    expect(assignment?.url).toContain("/api/issues/101");
    expect(assignment?.body).toContain('"expected_version":3');
    expect(assignment?.body).toContain('"assigned_team_id":7');
    expect(container.textContent).toContain("To May (TM)");
    const status = selectByLabel(container, "Trạng thái");
    expect(status).toBeDefined();
    await choose(status as HTMLSelectElement, "CONFIRMED");
    await choose(
      selectByLabel(container, "Đơn vị chịu trách nhiệm nguyên nhân") as HTMLSelectElement,
      "7",
    );
    await act(async () => {
      button(container, "Lưu kết quả xác minh")?.click();
    });
    await act(async () => {});
    const patches = mutations().filter((call) => call.method === "PATCH");
    const verification = patches[patches.length - 1];
    expect(verification?.body).toContain('"expected_version":3');
    expect(verification?.body).toContain('"cause_status":"CONFIRMED"');
    expect(verification?.body).toContain('"cause_team_id":7');
  });

  it("blocks cause verification until a responsible team is chosen and keeps the modal open on failure", async () => {
    installFetch({
      issue: baseIssue({
        allowed_actions: { assign: false, verify_cause: true, resolve: false, close: false },
        cause_status: "UNVERIFIED",
      }),
    });
    const baseFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return new Response(JSON.stringify({ error: { message: "bad" } }), { status: 409 });
      }
      return baseFetch(input as never, init);
    }) as typeof fetch;

    const container = await mount(
      <IssueDetailModal
        issue={baseIssue({
          allowed_actions: { assign: false, verify_cause: true, resolve: false, close: false },
          cause_status: "UNVERIFIED",
        })}
        isOpen={true}
        onClose={() => {}}
        onRefresh={() => {}}
      />,
    );
    const status = selectByLabel(container, "Trạng thái");
    await choose(status as HTMLSelectElement, "CONFIRMED");
    expect(selectByLabel(container, "Đơn vị chịu trách nhiệm nguyên nhân")).toBeDefined();

    await act(async () => {
      button(container, "Lưu kết quả xác minh")?.click();
    });
    await act(async () => {});
    expect(mutations().some((call) => call.method === "PATCH")).toBe(false);
  });
  it("disables cause verification while saving to prevent double submission", async () => {
    const issue = baseIssue({
      allowed_actions: { assign: false, verify_cause: true, resolve: false, close: false },
      cause_status: "UNVERIFIED",
    });
    installFetch({ issue });
    let resolvePatch!: (response: Response) => void;
    const patchResponse = new Promise<Response>((resolve) => {
      resolvePatch = resolve;
    });
    const baseFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        calls.push({
          method: "PATCH",
          url: String(input instanceof Request ? input.url : input),
          body: typeof init.body === "string" ? init.body : "",
        });
        return patchResponse;
      }
      return baseFetch(input, init);
    }) as typeof fetch;

    const container = await mount(
      <IssueDetailModal issue={issue} isOpen={true} onClose={() => {}} onRefresh={() => {}} />,
    );
    const verifyButton = button(container, "Lưu kết quả xác minh");
    expect(verifyButton).toBeDefined();

    await act(async () => {
      verifyButton?.click();
    });
    expect((verifyButton as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      verifyButton?.click();
    });
    expect(mutations().filter((call) => call.method === "PATCH")).toHaveLength(1);

    resolvePatch(new Response(JSON.stringify({ data: issue }), { status: 200 }));
    await act(async () => {});
    expect((button(container, "Lưu kết quả xác minh") as HTMLButtonElement).disabled).toBe(false);
  });

  it("confirms an approval with the chosen kaizen rating for a permitted resolver", async () => {
    let refreshed = 0;
    let closed = 0;
    installFetch({
      issue: baseIssue({
        status: IssueStatus.PENDING_REVIEW,
        photo_after: "/api/issues/101/media/after/after.jpg",
        allowed_actions: { assign: false, verify_cause: false, resolve: false, close: true },
      }),
    });
    const container = await mount(
      <IssueDetailModal
        issue={baseIssue({
          status: IssueStatus.PENDING_REVIEW,
          photo_after: "/api/issues/101/media/after/after.jpg",
          allowed_actions: { assign: false, verify_cause: false, resolve: false, close: true },
        })}
        isOpen={true}
        onClose={() => {
          closed += 1;
        }}
        onRefresh={() => {
          refreshed += 1;
        }}
      />,
    );
    const approve = button(container, "DUYỆT ĐẠT");
    expect(approve?.disabled).toBe(false);
    await act(async () => {
      approve?.click();
    });
    await act(async () => {});
    expect(container.textContent).toContain("Xác nhận duyệt đạt sự cố?");

    const stars = (Array.from(container.querySelectorAll("button")) as HTMLButtonElement[]).filter(
      (item) => (item.textContent ?? "").trim() === "★",
    );
    await act(async () => {
      stars[4]?.click();
    });
    await act(async () => {
      button(container, "Xác nhận")?.click();
    });
    await act(async () => {});
    const closeCall = mutations().find((call) => call.url.includes("/close"));
    expect(closeCall?.method).toBe("POST");
    expect(closeCall?.body).toContain('"score_rating":5');
    expect(refreshed).toBe(1);
    expect(closed).toBe(1);
  });

  it("reopens a pending issue after confirmation, falling back to the documented default reason", async () => {
    installFetch({
      issue: baseIssue({
        status: IssueStatus.PENDING_REVIEW,
        allowed_actions: { assign: false, verify_cause: false, resolve: false, close: true },
      }),
    });
    const container = await mount(
      <IssueDetailModal
        issue={baseIssue({
          status: IssueStatus.PENDING_REVIEW,
          allowed_actions: { assign: false, verify_cause: false, resolve: false, close: true },
        })}
        isOpen={true}
        onClose={() => {}}
        onRefresh={() => {}}
      />,
    );
    // Cancel first: dismissing the drawer must not send anything.
    await act(async () => {
      button(container, "Mở lại")?.click();
    });
    await act(async () => {});
    expect(container.textContent).toContain("Xác nhận mở lại sự cố?");
    await act(async () => {
      button(container, "Hủy")?.click();
    });
    await act(async () => {});
    expect(container.textContent).not.toContain("Xác nhận mở lại sự cố?");
    expect(mutations()).toEqual([]);

    await act(async () => {
      button(container, "Mở lại")?.click();
    });
    await act(async () => {});
    await act(async () => {
      button(container, "Xác nhận")?.click();
    });
    await act(async () => {});
    const reopen = mutations().find((call) => call.url.includes("/reopen"));
    expect(reopen?.method).toBe("POST");
    expect(reopen?.body).toContain("Chưa đạt yêu cầu 6S");
  });

  it("locks approval and explains the missing permission for a plain user", async () => {
    installFetch({
      issue: baseIssue({
        status: IssueStatus.PENDING_REVIEW,
        allowed_actions: { assign: false, verify_cause: false, resolve: false, close: false },
      }),
    });
    const container = await mount(
      <IssueDetailModal
        issue={baseIssue({
          status: IssueStatus.PENDING_REVIEW,
          allowed_actions: { assign: false, verify_cause: false, resolve: false, close: false },
        })}
        isOpen={true}
        onClose={() => {}}
        onRefresh={() => {}}
      />,
    );
    expect(button(container, "Khóa")?.disabled).toBe(true);
    expect(container.textContent).toContain("Cần quyền Line Leader trở lên");
    expect(mutations()).toEqual([]);
  });

  it("lets an authorized safety viewer invalidate with the default reason and hides it from others", async () => {
    installFetch({ issue: baseIssue() });
    await act(async () => {
      useAuthStore.setState({
        user: {
          id: 1,
          username: "admin",
          full_name: "Admin",
          role: "ADMIN" as never,
          capabilities: ["issue:invalidate"],
        },
      });
    });
    const authorized = await mount(
      <IssueDetailModal
        issue={baseIssue()}
        isOpen={true}
        onClose={() => {}}
        onRefresh={() => {}}
      />,
    );
    await act(async () => {
      button(authorized, "Bác bỏ báo cáo")?.click();
    });
    await act(async () => {});
    expect(authorized.textContent).toContain("Chỉ bác bỏ khi");
    await act(async () => {
      button(authorized, "Xác nhận")?.click();
    });
    await act(async () => {});
    const invalid = mutations().find((call) => call.url.includes("/invalid"));
    expect(invalid?.method).toBe("POST");
    expect(invalid?.body).toContain("Báo cáo không đúng thực tế");

    await act(async () => {
      useAuthStore.setState({
        user: { id: 99, username: "u", full_name: "U", role: "USER" as never },
      });
    });
    const plain = await mount(
      <IssueDetailModal
        issue={baseIssue()}
        isOpen={true}
        onClose={() => {}}
        onRefresh={() => {}}
      />,
    );
    expect(button(plain, "Bác bỏ báo cáo")).toBeUndefined();
    expect(plain.textContent).not.toContain("CHỤP ẢNH KHẮC PHỤC");
  });

  it("opens the full edit form prefilled with the current description for the reporter", async () => {
    installFetch({ issue: baseIssue() });
    await act(async () => {
      useAuthStore.setState({
        user: {
          id: 10,
          username: "owner",
          full_name: "Owner",
          role: "USER" as never,
          capabilities: ["issue:close_own"],
        },
      });
    });
    const container = await mount(
      <IssueDetailModal
        issue={baseIssue()}
        isOpen={true}
        onClose={() => {}}
        onRefresh={() => {}}
        locations={locations as never}
      />,
    );
    const editButton = container.querySelector('button[aria-label="Chỉnh sửa"]');
    expect(editButton).not.toBeNull();
    await act(async () => {
      editButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {});
    expect(container.textContent).toContain("Chỉnh sửa báo cáo sự cố 6S / An toàn");
    expect((container.querySelector("textarea") as HTMLTextAreaElement | null)?.value).toBe(
      "Dau loang duoi san may",
    );
  });
});
