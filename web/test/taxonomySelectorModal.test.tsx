import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TaxonomySelectorModal } from "../src/components/TaxonomySelectorModal.tsx";
import { invalidateAiStatus, loadAiStatus } from "../src/hooks/useAiStatus.ts";
import { useI18nStore } from "../src/i18n/index.ts";
import { IssueCategory, type TagItem } from "../src/types/index.ts";

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

const mockTags: TagItem[] = [
  {
    code: "OIL_LEAK",
    tag_code: "OIL_LEAK",
    name_vi: "Rò rỉ dầu",
    category: IssueCategory.S3,
    is_active: true,
    status: "APPROVED",
  },
  {
    code: "DIRT",
    tag_code: "DIRT",
    name_vi: "Bụi bẩn",
    category: IssueCategory.S3,
    is_active: true,
    status: "APPROVED",
  },
];

function installFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  calls = [];
  invalidateAiStatus();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const body = typeof init?.body === "string" ? init.body : "";
    calls.push({ method: init?.method ?? "GET", url, body });
    return handler(url, init);
  }) as typeof fetch;
}

async function mount(element: React.ReactElement) {
  await loadAiStatus();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => {
    root.render(element);
  });
  await act(async () => {});
  await act(async () => {});
  return container;
}

function button(container: HTMLElement, text: string) {
  return (Array.from(container.querySelectorAll("button")) as HTMLButtonElement[]).find((item) =>
    (item.textContent ?? "").includes(text),
  );
}

type InputProps = { onChange?: (event: { target: { value: string } }) => void };

/**
 * happy-dom does not bubble synthetic input events into React's root listener,
 * so drive the React onChange prop the framework actually wired up.
 */
async function setInputValue(input: HTMLInputElement, value: string) {
  const reactKey = Object.keys(input).find((key) => key.startsWith("__reactProps$"));
  const props = (input as unknown as Record<string, InputProps>)[reactKey ?? ""];
  await act(async () => {
    props?.onChange?.({ target: { value } });
  });
  await act(async () => {});
}

beforeEach(() => {
  useI18nStore.getState().setLocale("vi");
});

afterEach(async () => {
  for (const { root, container } of mounted) {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  }
  mounted.length = 0;
  globalThis.fetch = originalFetch;
  invalidateAiStatus();
});

describe("TaxonomySelectorModal AI suggestion flow", () => {
  it("calls AI endpoint across all categories when opened in ALL tab", async () => {
    installFetch((url) => {
      if (url.includes("/api/ai/status")) {
        return new Response(JSON.stringify({ data: { enabled: true } }), { status: 200 });
      }
      if (url.includes("/api/ai/suggest-tags")) {
        return new Response(
          JSON.stringify({
            data: {
              existing_tags: ["OIL_LEAK"],
              proposed_tags: [],
            },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    });

    const container = await mount(
      <TaxonomySelectorModal
        isOpen={true}
        onClose={() => {}}
        tags={mockTags}
        selectedTags={[]}
        currentCategory={null}
        onToggleTag={() => {}}
        onSelectCategory={() => {}}
      />,
    );
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    await setInputValue(input, "vết dầu loang");
    const aiBtn = button(container, "AI gợi ý");
    await act(async () => {
      aiBtn?.click();
    });
    await act(async () => {});
    const suggestCall = calls.find((c) => c.url.includes("/api/ai/suggest-tags"));
    expect(suggestCall).toBeDefined();
    expect(JSON.parse(suggestCall?.body || "{}")).toEqual({
      query: "vết dầu loang",
      description: "",
    });
    expect(container.textContent).toContain("Rò rỉ dầu");
  });
  it("calls AI endpoint with category and renders suggestions when category is active", async () => {
    installFetch((url) => {
      if (url.includes("/api/ai/status")) {
        return new Response(JSON.stringify({ data: { enabled: true } }), { status: 200 });
      }
      if (url.includes("/api/ai/suggest-tags")) {
        return new Response(
          JSON.stringify({
            data: {
              existing_tags: ["OIL_LEAK"],
              proposed_tags: [
                {
                  name_vi: "Dầu thủy lực",
                  name_zh: "液压油",
                  name_en: "Hydraulic oil",
                  category: "3S",
                },
              ],
            },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    });

    const toggled: string[] = [];
    const proposed: unknown[] = [];
    const container = await mount(
      <TaxonomySelectorModal
        isOpen={true}
        onClose={() => {}}
        tags={mockTags}
        selectedTags={[]}
        currentCategory={IssueCategory.S3}
        onToggleTag={(c) => toggled.push(c)}
        onSelectCategory={() => {}}
        onAddCustomTag={(t) => proposed.push(t)}
      />,
    );
    await act(async () => {});

    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    await setInputValue(input, "dau nhot");

    const aiBtn = button(container, "AI gợi ý");
    await act(async () => {
      aiBtn?.click();
    });
    await act(async () => {});

    const suggestCall = calls.find((c) => c.url.includes("/api/ai/suggest-tags"));
    expect(suggestCall).toBeDefined();
    expect(JSON.parse(suggestCall?.body || "{}")).toEqual({
      query: "dau nhot",
      category: "3S",
      description: "",
    });

    // Check rendered suggestions
    expect(container.textContent).toContain("Gợi ý từ danh mục chuẩn:");
    expect(container.textContent).toContain("Rò rỉ dầu");
    expect(container.textContent).toContain("Đề xuất thẻ mới phù hợp:");
    expect(container.textContent).toContain("Dầu thủy lực");

    // Toggle existing tag
    const existingPill = button(container, "#Rò rỉ dầu");
    await act(async () => {
      existingPill?.click();
    });
    expect(toggled).toContain("OIL_LEAK");

    // Add proposed tag
    const proposedPill = button(container, "Dầu thủy lực");
    expect(proposedPill).toBeDefined();
    await act(async () => {
      proposedPill?.click();
    });
    expect(proposed.length).toBe(1);
  });

  it("shows clear failure notice instead of tag-not-found when AI request fails", async () => {
    installFetch((url) => {
      if (url.includes("/api/ai/status")) {
        return new Response(JSON.stringify({ data: { enabled: true } }), { status: 200 });
      }
      if (url.includes("/api/ai/suggest-tags")) {
        return new Response(
          JSON.stringify({ error: { code: "AI_GATEWAY_ERROR", message: "Gateway down" } }),
          {
            status: 502,
          },
        );
      }
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    });

    const container = await mount(
      <TaxonomySelectorModal
        isOpen={true}
        onClose={() => {}}
        tags={mockTags}
        selectedTags={[]}
        currentCategory={IssueCategory.S3}
        onToggleTag={() => {}}
        onSelectCategory={() => {}}
      />,
    );
    await act(async () => {});

    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    await setInputValue(input, "su co");

    const aiBtn = button(container, "AI gợi ý");
    await act(async () => {
      aiBtn?.click();
    });
    await act(async () => {});
    expect(container.textContent).toContain(
      "Không thể gọi AI lúc này. Bạn vẫn có thể tìm hoặc tạo thẻ thủ công.",
    );
    // A failed call must not masquerade as an empty-but-successful AI answer.
    expect(container.textContent).not.toContain("AI chưa tìm thấy thẻ phù hợp cho nội dung này.");
  });
});
