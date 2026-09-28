import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act } from "react";
import { IssueDetailModal } from "../src/pages/IssueDetailModal.tsx";
import { useAuthStore } from "../src/store/authStore.ts";
import { useDialogStore } from "../src/store/dialogStore.ts";
import { IssueStatus } from "../src/types/index.ts";
import {
  baseIssue,
  button,
  cleanupMounted,
  installFetch,
  locations,
  mount,
  mutations,
  resetTestState,
} from "./issueDetailModal.fixtures.tsx";

beforeEach(resetTestState);
afterEach(cleanupMounted);

describe("IssueDetailModal - Status & Actions", () => {
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
    const confirmTitle = Array.from(container.querySelectorAll("h3")).find(
      (el) => el.textContent === "Xác nhận duyệt đạt sự cố?",
    );
    expect(confirmTitle).toBeDefined();
    const drawer = confirmTitle?.closest("div.border-t");
    expect(drawer?.className).toContain("dark:bg-zinc-900");
    expect(drawer?.className).not.toContain("zinc-850");
    const checkboxes = Array.from(drawer?.querySelectorAll('input[type="checkbox"]') ?? []);
    expect(checkboxes.length).toBeGreaterThan(0);
    expect(checkboxes[0]?.className).toContain("dark:bg-zinc-900");
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

  it("shows the server reason when approval is rejected", async () => {
    installFetch({
      issue: baseIssue({
        status: IssueStatus.PENDING_REVIEW,
        photo_after: "/api/issues/101/media/after/after.jpg",
        allowed_actions: { assign: false, verify_cause: false, resolve: false, close: true },
      }),
    });
    const baseFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("/close")) {
        return new Response(
          JSON.stringify({
            error: {
              code: "FORBIDDEN",
              message:
                "Bạn không thể tự duyệt issue do chính mình xử lý. Cần người khác nghiệm thu.",
            },
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        );
      }
      return baseFetch(input, init);
    }) as typeof fetch;

    const container = await mount(
      <IssueDetailModal
        issue={baseIssue({
          status: IssueStatus.PENDING_REVIEW,
          photo_after: "/api/issues/101/media/after/after.jpg",
          allowed_actions: { assign: false, verify_cause: false, resolve: false, close: true },
        })}
        isOpen={true}
        onClose={() => {}}
        onRefresh={() => {}}
      />,
    );
    await act(async () => {
      button(container, "DUYỆT ĐẠT")?.click();
    });
    await act(async () => {
      button(container, "Xác nhận")?.click();
    });
    await act(async () => {});

    expect(useDialogStore.getState().options.message).toBe(
      "Bạn không thể tự duyệt issue do chính mình xử lý. Cần người khác nghiệm thu.",
    );
    useDialogStore.getState().handleCancel();
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
    expect(button(container, "Khóa")).toBeUndefined();
    expect(container.textContent).toContain("Sự cố đang chờ người có quyền nghiệm thu.");
    expect(container.textContent).toContain("Chờ duyệt");
    expect(mutations()).toEqual([]);
  });

  it("explains that the resolver cannot self-approve", async () => {
    installFetch({
      issue: baseIssue({
        status: IssueStatus.PENDING_REVIEW,
        resolver_id: 7,
        allowed_actions: { assign: false, verify_cause: false, resolve: false, close: false },
      }),
    });
    useAuthStore.setState({
      user: {
        id: 7,
        username: "resolver",
        full_name: "Resolver",
        role: "SUPERADMIN" as never,
        capabilities: ["issue:close_any", "issue:close_safety"],
      },
    });
    const container = await mount(
      <IssueDetailModal
        issue={baseIssue({
          status: IssueStatus.PENDING_REVIEW,
          resolver_id: 7,
          allowed_actions: { assign: false, verify_cause: false, resolve: false, close: false },
        })}
        isOpen={true}
        onClose={() => {}}
        onRefresh={() => {}}
      />,
    );
    expect(button(container, "DUYỆT ĐẠT")).toBeUndefined();
    expect(container.textContent).toContain("Cần người khác nghiệm thu");
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

  it("renders responsive action bar with wrapped resolve label and compact invalidate button", async () => {
    installFetch({ issue: baseIssue() });
    await act(async () => {
      useAuthStore.setState({
        user: {
          id: 1,
          username: "admin",
          full_name: "Admin",
          role: "ADMIN" as never,
          capabilities: ["issue:invalidate", "issue:resolve"],
        },
      });
    });

    const container = await mount(
      <IssueDetailModal
        issue={baseIssue()}
        isOpen={true}
        onClose={() => {}}
        onRefresh={() => {}}
      />,
    );

    const resolveLabel = container.querySelector("label.cursor-pointer");
    expect(resolveLabel).not.toBeNull();
    expect(resolveLabel?.className).toContain("min-w-0");
    expect(resolveLabel?.className).toContain("flex-1");
    expect(resolveLabel?.getAttribute("title")).toBeTruthy();

    const labelText = resolveLabel?.querySelector("span > span");
    expect(labelText).not.toBeNull();
    expect(labelText?.className).toContain("text-center");
    expect(labelText?.className).toContain("leading-tight");
    expect(labelText?.className).not.toContain("truncate");

    const invalidateBtn = button(container, "Bác bỏ báo cáo");
    expect(invalidateBtn).toBeDefined();
    expect(invalidateBtn?.className).toContain("w-14");
    expect(invalidateBtn?.className).toContain("shrink-0");
  });

  it("opens action menu, triggers soft-delete confirmation dialog, and closes on Escape", async () => {
    const issue = baseIssue({
      version: 1,
      allowed_actions: {
        assign: false,
        verify_cause: false,
        resolve: false,
        close: false,
        delete: true,
      } as never,
    });
    installFetch({ issue });
    const container = await mount(
      <IssueDetailModal issue={issue} isOpen={true} onClose={() => {}} onRefresh={() => {}} />,
    );

    const actionsBtn = container.querySelector(
      'button[aria-label="Hành động"]',
    ) as HTMLButtonElement | null;
    expect(actionsBtn).not.toBeNull();
    expect(actionsBtn?.getAttribute("aria-expanded")).toBe("false");

    await act(async () => {
      actionsBtn?.click();
    });
    await act(async () => {});
    expect(actionsBtn?.getAttribute("aria-expanded")).toBe("true");

    const deleteMenuItem = Array.from(container.querySelectorAll('button[role="menuitem"]')).find(
      (el) => el.textContent?.includes("Xoá mềm"),
    ) as HTMLButtonElement | undefined;
    expect(deleteMenuItem).toBeDefined();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    await act(async () => {});
    expect(container.querySelector('button[role="menuitem"]')).toBeNull();
    // Test click outside to close menu
    await act(async () => {
      actionsBtn?.click();
    });
    await act(async () => {});
    expect(container.querySelector('button[role="menuitem"]')).not.toBeNull();
    await act(async () => {
      document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    await act(async () => {});
    expect(container.querySelector('button[role="menuitem"]')).toBeNull();

    await act(async () => {
      actionsBtn?.click();
    });
    await act(async () => {});
    const reDeleteMenuItem = Array.from(container.querySelectorAll('button[role="menuitem"]')).find(
      (el) => el.textContent?.includes("Xoá mềm"),
    ) as HTMLButtonElement | undefined;
    await act(async () => {
      reDeleteMenuItem?.click();
    });
    await act(async () => {});

    expect(container.textContent).toContain("Xoá mềm sự cố này?");
    expect(container.querySelector("textarea")).not.toBeNull();
  });

  it("shows restore action in menu for soft-deleted issue and triggers restore confirmation", async () => {
    const issue = baseIssue({
      version: 2,
      deleted_at: "2026-03-02T10:00:00Z",
      allowed_actions: {
        assign: false,
        verify_cause: false,
        resolve: false,
        close: false,
        restore: true,
      } as never,
    });
    installFetch({ issue });
    const container = await mount(
      <IssueDetailModal issue={issue} isOpen={true} onClose={() => {}} onRefresh={() => {}} />,
    );

    expect(container.textContent).toContain("Đã xoá — chỉ đọc");
    const actionsBtn = container.querySelector(
      'button[aria-label="Hành động"]',
    ) as HTMLButtonElement | null;
    expect(actionsBtn).not.toBeNull();
    await act(async () => {
      actionsBtn?.click();
    });
    await act(async () => {});

    const restoreMenuItem = Array.from(container.querySelectorAll('button[role="menuitem"]')).find(
      (el) => el.textContent?.includes("Khôi phục"),
    ) as HTMLButtonElement | undefined;
    expect(restoreMenuItem).toBeDefined();
    await act(async () => {
      restoreMenuItem?.click();
    });
    await act(async () => {});
    expect(container.textContent).toContain("Khôi phục sự cố này?");
  });

  it("hides action menu when neither delete nor restore is allowed", async () => {
    const issue = baseIssue({
      version: 1,
      allowed_actions: {
        assign: false,
        verify_cause: false,
        resolve: false,
        close: false,
        delete: false,
        restore: false,
      } as never,
    });
    installFetch({ issue });
    const container = await mount(
      <IssueDetailModal
        issue={issue}
        isOpen={true}
        onClose={() => {}}
        onRefresh={() => {}}
        locations={locations as never}
      />,
    );
    expect(container.querySelector('button[aria-label="Hành động"]')).toBeNull();
  });
});
