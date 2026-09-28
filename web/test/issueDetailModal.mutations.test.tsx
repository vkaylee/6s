import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act } from "react";
import { IssueDetailModal } from "../src/pages/IssueDetailModal.tsx";
import { useAuthStore } from "../src/store/authStore.ts";
import { IssueStatus } from "../src/types/index.ts";
import {
  baseIssue,
  button,
  calls,
  choose,
  cleanupMounted,
  installFetch,
  locations,
  mount,
  mutations,
  resetTestState,
  selectByLabel,
} from "./issueDetailModal.fixtures.tsx";

beforeEach(resetTestState);
afterEach(cleanupMounted);

describe("IssueDetailModal - Mutations & Permissions", () => {
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
      button(container, "Sửa")?.click();
    });
    await act(async () => {});
    const teamSelect = selectByLabel(container, "Team xử lý");
    expect(container.textContent).toContain("Phân công & trách nhiệm");
    expect(selectByLabel(container, "Trạng thái")).toBeUndefined();
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

    await act(async () => {
      button(container, "Xác minh")?.click();
    });
    await act(async () => {});
    const status = selectByLabel(container, "Trạng thái");
    expect(status).toBeDefined();
    await choose(status as HTMLSelectElement, "CONFIRMED");
    await choose(selectByLabel(container, "Đơn vị gây lỗi") as HTMLSelectElement, "7");
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

  it("hides unverified cause details from viewers without verification permission", async () => {
    installFetch({
      issue: baseIssue({
        allowed_actions: { assign: false, verify_cause: false, resolve: false, close: false },
        cause_status: "UNVERIFIED",
        cause_team_id: 7,
      }),
    });
    const container = await mount(
      <IssueDetailModal
        issue={baseIssue({
          allowed_actions: { assign: false, verify_cause: false, resolve: false, close: false },
          cause_status: "UNVERIFIED",
          cause_team_id: 7,
        })}
        isOpen={true}
        onClose={() => {}}
        onRefresh={() => {}}
      />,
    );
    expect(container.textContent).toContain("Phân công & trách nhiệm");
    expect(container.textContent).not.toContain("Chưa xác minh");
    expect(container.textContent).not.toContain("Đơn vị gây lỗi");
    expect(button(container, "Xác minh")).toBeUndefined();
  });

  it("shows confirmed fault team as compact assignment context to viewers", async () => {
    installFetch({
      issue: baseIssue({
        allowed_actions: { assign: false, verify_cause: false, resolve: false, close: false },
        cause_status: "CONFIRMED",
        cause_team_id: 7,
      }),
    });
    const container = await mount(
      <IssueDetailModal
        issue={baseIssue({
          allowed_actions: { assign: false, verify_cause: false, resolve: false, close: false },
          cause_status: "CONFIRMED",
          cause_team_id: 7,
        })}
        isOpen={true}
        onClose={() => {}}
        onRefresh={() => {}}
      />,
    );
    expect(container.textContent).toContain("Đơn vị gây lỗi: To May (TM)");
    expect(button(container, "Xác minh")).toBeUndefined();
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
    await act(async () => {
      button(container, "Xác minh")?.click();
    });
    await act(async () => {});
    const status = selectByLabel(container, "Trạng thái");
    expect(status).toBeDefined();
    await choose(status as HTMLSelectElement, "CONFIRMED");
    expect(selectByLabel(container, "Đơn vị gây lỗi")).toBeDefined();

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
    await act(async () => {
      button(container, "Xác minh")?.click();
    });
    await act(async () => {});
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

  it("syncs cause team with assigned team when smart sync toggle is checked", async () => {
    const issue = baseIssue({
      version: 4,
      allowed_actions: { assign: true, verify_cause: true, resolve: false, close: false },
      cause_status: "UNVERIFIED",
    });
    installFetch({ issue });
    const container = await mount(
      <IssueDetailModal issue={issue} isOpen={true} onClose={() => {}} onRefresh={() => {}} />,
    );
    await act(async () => {
      button(container, "Sửa")?.click();
    });
    await act(async () => {});
    const teamSelect = selectByLabel(container, "Team xử lý");
    expect(teamSelect).toBeDefined();
    await choose(teamSelect as HTMLSelectElement, "7");

    const syncCheckbox = container.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement | null;
    expect(syncCheckbox).not.toBeNull();
    await act(async () => {
      syncCheckbox?.click();
    });
    await act(async () => {});

    await act(async () => {
      button(container, "Lưu")?.click();
    });
    await act(async () => {});

    const assignment = mutations().find((call) => call.method === "PATCH");
    expect(assignment).toBeDefined();
    expect(assignment?.body).toContain('"assigned_team_id":7');
    expect(assignment?.body).toContain('"cause_team_id":7');
    expect(assignment?.body).toContain('"cause_status":"CONFIRMED"');
  });

  it("allows selecting cause team directly in close confirmation drawer", async () => {
    let closed = 0;
    const issue = baseIssue({
      version: 2,
      status: IssueStatus.PENDING_REVIEW,
      photo_after: "/api/issues/101/media/after/after.jpg",
      allowed_actions: { assign: false, verify_cause: true, resolve: false, close: true },
      cause_status: "UNVERIFIED",
    });
    installFetch({ issue });
    const container = await mount(
      <IssueDetailModal
        issue={issue}
        isOpen={true}
        onClose={() => {
          closed += 1;
        }}
        onRefresh={() => {}}
      />,
    );
    await act(async () => {
      button(container, "DUYỆT ĐẠT")?.click();
    });
    await act(async () => {});
    expect(container.textContent).toContain("Xác nhận duyệt đạt sự cố?");
    expect(container.textContent).toContain("Xác nhận đơn vị gây lỗi");

    const causeSelect = selectByLabel(container, "Xác nhận đơn vị gây lỗi");
    expect(causeSelect).toBeDefined();
    await choose(causeSelect as HTMLSelectElement, "7");

    await act(async () => {
      button(container, "Xác nhận")?.click();
    });
    await act(async () => {});

    const patch = mutations().find((call) => call.method === "PATCH");
    expect(patch).toBeDefined();
    expect(patch?.body).toContain('"cause_team_id":7');
    expect(patch?.body).toContain('"cause_status":"CONFIRMED"');

    const closeCall = mutations().find((call) => call.url.includes("/close"));
    expect(closeCall?.method).toBe("POST");
    expect(closed).toBe(1);
  });
});
