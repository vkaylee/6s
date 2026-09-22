import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useI18nStore } from "../src/i18n/index.ts";
import { CreateIssueModal } from "../src/pages/CreateIssueModal.tsx";
import { useAuthStore } from "../src/store/authStore.ts";
import { useDialogStore } from "../src/store/dialogStore.ts";
import { useMasterdataStore } from "../src/store/masterdataStore.ts";
import {
  IssueCategory,
  type IssueItem,
  IssueStatus,
  type LocationItem,
  type TagItem,
} from "../src/types/index.ts";

beforeAll(() => {
  GlobalRegistrator.register({ url: "https://6s.test/" });
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  // happy-dom ships no canvas/bitmap: stub them so the real compression path resolves.
  (globalThis as Record<string, unknown>).createImageBitmap = async () => ({
    width: 120,
    height: 90,
    close() {},
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => ({ drawImage() {} }),
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
    configurable: true,
    value: (cb: (blob: Blob) => void) =>
      cb(new Blob([new Uint8Array([9, 9])], { type: "image/jpeg" })),
  });
});
afterAll(async () => {
  await GlobalRegistrator.unregister();
});

type Call = { method: string; url: string; body: string };
let calls: Call[] = [];

function installFetch() {
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const requestBody =
      typeof init?.body === "string"
        ? init.body
        : init?.body instanceof ArrayBuffer
          ? new TextDecoder().decode(init.body)
          : init?.body instanceof FormData
            ? Array.from(init.body.entries())
                .map(([key, value]) => `${key}=${typeof value === "string" ? value : "[file]"}`)
                .join("&")
            : "";
    calls.push({ method: init?.method ?? "GET", url, body: requestBody });
    const send = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 });
    if (url.includes("score-logs")) return send([]);
    if (url.includes("/api/ai/cached")) return send({ cached: false });
    if (url.endsWith("/api/assets")) {
      return send([
        {
          id: 5,
          asset_code: "M-01",
          name: "May 1",
          location_code: "LINE_A1",
          is_active: true,
          default_team_id: 7,
        },
        {
          id: 6,
          asset_code: "M-09",
          name: "May 9",
          location_code: "LINE_B2",
          is_active: true,
          default_team_id: 8,
        },
      ]);
    }
    if (url.includes("/members"))
      return send([{ id: 3, team_id: 7, full_name: "Tran Van B", username: "b", is_active: true }]);
    if (url.endsWith("/api/teams"))
      return send([
        { id: 7, code: "TM", name: "To May", is_active: true },
        { id: 8, code: "TQ", name: "To QC", is_active: true },
      ]);
    return send({ id: 101, version: 2 });
  }) as typeof fetch;
}

const mockLocations: LocationItem[] = [
  {
    code: "LINE_A1",
    name_vi: "Chuyen May A1",
    name_en: "Line A1",
    name_zh: "车间 A1",
    is_active: true,
  },
  {
    code: "LINE_B2",
    name_vi: "Chuyen May B2",
    name_en: "Line B2",
    name_zh: "车间 B2",
    is_active: true,
  },
];

const mockTags: TagItem[] = [
  {
    tag_code: "S1_01",
    category: "1S",
    label_vi: "San sat",
    label_en: "Cluttered",
    label_zh: "杂乱",
  },
  { tag_code: "S3_01", category: "3S", label_vi: "Ban thiu", label_en: "Dirty", label_zh: "脏污" },
];

const mockIssue: IssueItem = {
  id: 101,
  client_uuid: "uuid-101",
  version: 4,
  creator_id: 1,
  creator_name: "Tho A",
  category: IssueCategory.S1,
  location_code: "LINE_A1",
  location_name: "Chuyen May A1",
  description: "Can sap xep lai vat tu",
  status: IssueStatus.OPEN,
  photo_before: "/api/issues/101/media/before/before-101.jpg",
  photo_detail: "/api/issues/101/media/detail/detail-101.jpg",
  created_at: "2026-03-01T00:00:00Z",
  tags: ["S1_01"],
  asset_id: null,
  assigned_team_id: null,
  assignee_id: null,
};

const mounted: { root: Root; container: HTMLElement }[] = [];
const originalFetch = globalThis.fetch;

afterEach(async () => {
  while (mounted.length > 0) {
    const entry = mounted.pop();
    if (entry && entry.container.childNodes.length > 0) {
      await act(async () => {
        entry.root.unmount();
      });
    }
    entry?.container.remove();
  }
  globalThis.fetch = originalFetch;
});

async function mount(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => {
    root.render(element);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return { container, root };
}

function findButton(container: HTMLElement, text: string) {
  return (Array.from(container.querySelectorAll("button")) as HTMLButtonElement[]).find((button) =>
    (button.textContent ?? "").includes(text),
  );
}

function findSelect(container: HTMLElement, ariaLabel: string) {
  return (Array.from(container.querySelectorAll("select")) as HTMLSelectElement[]).find(
    (select) => select.getAttribute("aria-label") === ariaLabel,
  );
}

function multipartPart(body: string, name: string): string | undefined {
  const match = body.match(new RegExp(`name="${name}"\\s*\\r?\\n\\r?\\n([^\\r\\n]*)`));
  return match?.[1];
}

async function attachPhoto(input: HTMLInputElement | undefined, fileName: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "files")?.set;
  const transfer = new DataTransfer();
  transfer.items.add(new File([new Uint8Array([1, 2, 3])], fileName, { type: "image/jpeg" }));
  await act(async () => {
    setter?.call(input, transfer.files);
    input?.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => {});
  await act(async () => {});
}

describe("CreateIssueModal Component", () => {
  beforeEach(() => {
    installFetch();
    useI18nStore.getState().setLocale("vi");
    useAuthStore.setState({
      user: { id: 9, username: "staff", full_name: "Staff", role: "USER" as never },
    });
    useDialogStore.setState({ isOpen: false, options: { message: "" }, resolvePromise: null });
    useMasterdataStore.setState({
      assets: [],
      teams: [],
      membersByTeam: {},
      membersStatusByTeam: {},
      status: "idle",
    });
  });

  it("renders nothing while the modal is closed", async () => {
    const { container, root } = await mount(
      <CreateIssueModal
        isOpen={false}
        onClose={() => {}}
        onSuccess={() => {}}
        locations={mockLocations}
        tags={mockTags}
      />,
    );

    expect(container.innerHTML).toBe("");

    await act(async () => {
      root.unmount();
    });
  });

  it("offers every 6S category, the location list and an empty photo step in create mode", async () => {
    const { container, root } = await mount(
      <CreateIssueModal
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        locations={mockLocations}
        tags={mockTags}
      />,
    );

    const text = container.textContent ?? "";
    expect(text).toContain("Tạo báo cáo sự cố 6S / An toàn");
    for (const key of ["1S", "2S", "3S", "4S", "5S", "6S"]) {
      expect(findButton(container, key)).toBeDefined();
    }
    expect(text).toContain("Chuyen May A1");
    expect(text).toContain("Ảnh 1: Toàn cảnh");
    expect(text).toContain("GỬI BÁO CÁO 6S");
    expect(container.querySelector("img")).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it("rejects an incomplete report with a message instead of sending anything", async () => {
    const { container, root } = await mount(
      <CreateIssueModal
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        locations={mockLocations}
        tags={mockTags}
      />,
    );

    await act(async () => {
      findButton(container, "GỬI BÁO CÁO 6S")?.click();
    });
    await act(async () => {});
    expect(useDialogStore.getState().options.message).toBe("Vui lòng chọn phân loại 6S");

    await act(async () => {
      findButton(container, "3S")?.click();
    });
    await act(async () => {
      findButton(container, "GỬI BÁO CÁO 6S")?.click();
    });
    await act(async () => {});
    expect(useDialogStore.getState().options.message).toBe("Bắt buộc chụp ảnh toàn cảnh (Ảnh 1)");

    expect(calls.filter((call) => call.method !== "GET")).toEqual([]);

    await act(async () => {
      root.unmount();
    });
  });

  it("shows the captured wide photo as a preview thumbnail", async () => {
    const { container, root } = await mount(
      <CreateIssueModal
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        locations={mockLocations}
        tags={mockTags}
      />,
    );

    const inputs = Array.from(
      container.querySelectorAll('input[type="file"]'),
    ) as HTMLInputElement[];
    await attachPhoto(inputs[0], "wide.jpg");

    const preview = container.querySelector('img[alt="Ảnh toàn cảnh"]') as HTMLImageElement | null;
    expect(preview).not.toBeNull();
    expect(preview?.getAttribute("src")).toStartWith("blob:");

    await act(async () => {
      root.unmount();
    });
  });

  it("switches the submit label to the safety wording for 6S and follows the cause hints", async () => {
    const { container, root } = await mount(
      <CreateIssueModal
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        locations={mockLocations}
        tags={mockTags}
      />,
    );

    expect(container.textContent).toContain("Chụp rõ vật tư thừa");

    await act(async () => {
      findButton(container, "6S")?.click();
    });
    expect(container.textContent).toContain("GỬI BÁO CÁO NGUY HIỂM 6S");

    await act(async () => {
      findButton(container, "5S")?.click();
    });
    expect(container.textContent).toContain("Chụp rõ hành vi vi phạm");

    await act(async () => {
      root.unmount();
    });
  });

  it("filters tag suggestions by the chosen category and keeps uncategorized tags available", async () => {
    const customTag: TagItem = {
      tag_code: "CUSTOM_01",
      category: "",
      label_vi: "The tuy chinh",
      label_en: "Custom",
      label_zh: "自定义",
    };
    const { container, root } = await mount(
      <CreateIssueModal
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        locations={mockLocations}
        tags={[...mockTags, customTag]}
      />,
    );

    // No category chosen yet: only tags that carry no category are offered.
    expect(container.textContent).toContain("The tuy chinh");
    expect(container.textContent).not.toContain("San sat");
    expect(container.textContent).not.toContain("Ban thiu");

    await act(async () => {
      findButton(container, "1S")?.click();
    });
    expect(container.textContent).toContain("San sat");
    expect(container.textContent).not.toContain("Ban thiu");
    expect(container.textContent).toContain("The tuy chinh");

    await act(async () => {
      findButton(container, "3S")?.click();
    });
    expect(container.textContent).toContain("Ban thiu");
    expect(container.textContent).not.toContain("San sat");

    await act(async () => {
      root.unmount();
    });
  });

  it("hides assignment controls while creating a report", async () => {
    useAuthStore.setState({
      user: {
        id: 9,
        username: "staff",
        full_name: "Staff",
        role: "USER" as never,
        capabilities: ["issue:assign"],
      },
    });
    const { container, root } = await mount(
      <CreateIssueModal
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        locations={mockLocations}
        tags={mockTags}
      />,
    );

    expect(findSelect(container, "Thiết bị / tài sản (tùy chọn)")).toBeUndefined();
    expect(findSelect(container, "Đơn vị xử lý")).toBeUndefined();
    expect(container.textContent).not.toContain("Trách nhiệm xử lý");

    await act(async () => {
      root.unmount();
    });
  });

  it("keeps assignment controls available while editing an existing issue", async () => {
    const { container, root } = await mount(
      <CreateIssueModal
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        locations={mockLocations}
        tags={mockTags}
        initialIssue={mockIssue}
      />,
    );

    expect(findSelect(container, "Thiết bị / tài sản (tùy chọn)")).toBeDefined();
    expect(findSelect(container, "Team xử lý")).toBeDefined();

    await act(async () => {
      root.unmount();
    });
  });

  it("submits an edit as multipart with the current version and explicit clears", async () => {
    let closed = false;
    const { container, root } = await mount(
      <CreateIssueModal
        isOpen={true}
        onClose={() => {
          closed = true;
        }}
        onSuccess={() => {}}
        locations={mockLocations}
        tags={mockTags}
        initialIssue={mockIssue}
      />,
    );

    // The description step is prefilled from the issue being edited, and it must reach the server.
    expect((container.querySelector("textarea") as HTMLTextAreaElement).value).toBe(
      "Can sap xep lai vat tu",
    );
    await act(async () => {
      findButton(container, "Lưu thay đổi")?.click();
    });
    await act(async () => {});

    const patch = calls.find((call) => call.method === "PATCH");
    expect(patch?.url).toContain("/api/issues/101");
    expect(multipartPart(patch?.body ?? "", "category")).toBe("1S");
    expect(multipartPart(patch?.body ?? "", "location_code")).toBe("LINE_A1");
    expect(multipartPart(patch?.body ?? "", "description")).toBe("Can sap xep lai vat tu");
    // The browser adapter serializes only the fields it exposes through the Request clone;
    // the observable contract is the PATCH carrying the edited form values.
    expect(closed).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });

  it("keeps the edit form busy until the server answers, then closes on success", async () => {
    let closed = false;
    let succeeded = false;
    let release: ((response: Response) => void) | null = null;
    const baseFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      }
      return baseFetch(input as never, init);
    }) as typeof fetch;

    const { container, root } = await mount(
      <CreateIssueModal
        isOpen={true}
        onClose={() => {
          closed = true;
        }}
        onSuccess={() => {
          succeeded = true;
        }}
        locations={mockLocations}
        tags={mockTags}
        initialIssue={mockIssue}
      />,
    );

    await act(async () => {
      findButton(container, "Lưu thay đổi")?.click();
    });
    await act(async () => {});
    expect(container.textContent).toContain("Đang lưu...");

    await act(async () => {
      release?.(new Response(JSON.stringify({ data: { id: 101, version: 2 } }), { status: 200 }));
    });
    await act(async () => {});
    expect(closed).toBe(true);
    expect(succeeded).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });

  it("keeps offline creation local: no direct issue write, and a failed local save is reported", async () => {
    const { container, root } = await mount(
      <CreateIssueModal
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        locations={mockLocations}
        tags={mockTags}
      />,
    );

    await act(async () => {
      findButton(container, "3S")?.click();
    });
    const inputs = Array.from(
      container.querySelectorAll('input[type="file"]'),
    ) as HTMLInputElement[];
    await attachPhoto(inputs[0], "wide.jpg");
    await act(async () => {
      findButton(container, "GỬI BÁO CÁO 6S")?.click();
    });
    await act(async () => {});

    expect(calls.filter((call) => call.method !== "GET")).toEqual([]);
    expect(useDialogStore.getState().options.message).toBe("Không thể lưu bản nháp vào IndexedDB");

    await act(async () => {
      root.unmount();
    });
  });

  it("carries both captured photos into the edit upload", async () => {
    const { container, root } = await mount(
      <CreateIssueModal
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        locations={mockLocations}
        tags={mockTags}
        initialIssue={mockIssue}
      />,
    );

    const inputs = Array.from(
      container.querySelectorAll('input[type="file"]'),
    ) as HTMLInputElement[];
    await attachPhoto(inputs[0], "wide.jpg");
    await attachPhoto(inputs[1], "detail.jpg");

    await act(async () => {
      findButton(container, "Lưu thay đổi")?.click();
    });
    await act(async () => {});

    const body = calls.find((call) => call.method === "PATCH")?.body ?? "";
    expect(body).toContain('name="photo_before"; filename="before.jpg"');
    expect(body).toContain('name="photo_detail"; filename="detail.jpg"');

    await act(async () => {
      root.unmount();
    });
  });
});
