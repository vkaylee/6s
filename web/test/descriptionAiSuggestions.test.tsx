import { beforeEach, describe, expect, it } from "bun:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { invalidateAiStatus, loadAiStatus } from "../src/hooks/useAiStatus.ts";
import {
  type AiSuggestionsState,
  useDescriptionAiSuggestions,
} from "../src/pages/create-issue/useDescriptionAiSuggestions.ts";
import {
  CauseType,
  IssueCategory,
  type ProposedTagItem,
  type TagItem,
} from "../src/types/index.ts";

interface HookMethods {
  suggestFromDescription: () => Promise<void>;
  applyAllSuggestions: () => void;
  aiSuggestions: AiSuggestionsState;
}

describe("description AI suggestions flow", () => {
  beforeEach(() => {
    invalidateAiStatus();
  });

  it("passes trimmed description payload and infers category and tags when empty", async () => {
    const requests: { url: string; body: unknown }[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : "url" in input ? input.url : String(input);
      if (url.includes("/api/ai/status")) {
        return new Response(JSON.stringify({ data: { enabled: true } }));
      }
      const rawBody =
        init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
      const parsedBody = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;
      requests.push({ url, body: parsedBody });
      return new Response(
        JSON.stringify({
          data: {
            existing_tags: ["s3_oil_spill"],
            proposed_tags: [{ name_vi: "Đề xuất mới", category: IssueCategory.S3 }],
          },
        }),
      );
    }) as typeof fetch;

    try {
      await loadAiStatus();

      let hookRef: HookMethods | null = null;
      let inferredCat: IssueCategory | null = null;
      let appliedExisting: string[] = [];
      let appliedProposed: ProposedTagItem[] = [];

      const catalog: TagItem[] = [
        {
          tag_code: "s3_oil_spill",
          category: IssueCategory.S3,
          label_vi: "Rò rỉ dầu mỡ",
        },
      ];

      function TestHarness() {
        const result = useDescriptionAiSuggestions({
          description: "  Dầu máy tràn trên sàn  ",
          locationSelected: true,
          photoBlob: new Blob(["sample"], { type: "image/jpeg" }),
          category: null,
          selectedTags: [],
          tags: catalog,
          onSelectCategory: (cat) => {
            inferredCat = cat;
          },
          onAddTags: (existing, proposed) => {
            appliedExisting = existing;
            appliedProposed = proposed;
          },
          translate: (key) => key,
        });
        hookRef = result;
        return null;
      }

      renderToString(React.createElement(TestHarness));
      expect(hookRef).not.toBeNull();
      if (hookRef !== null) {
        const handler: HookMethods = hookRef;
        await handler.suggestFromDescription();
      }

      expect(requests.length).toBe(1);
      expect(requests[0].body).toEqual({
        query: "Dầu máy tràn trên sàn",
        description: "Dầu máy tràn trên sàn",
        category: null,
        image_data_url: "data:image/jpeg;base64,c2FtcGxl",
      });
      expect(inferredCat as IssueCategory | null).toBe(IssueCategory.S3);
      expect(appliedExisting).toEqual(["s3_oil_spill"]);
      expect(appliedProposed).toEqual([{ name_vi: "Đề xuất mới", category: IssueCategory.S3 }]);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("preserves manual category, cause type, and tags without overwriting", async () => {
    const requests: { url: string; body: unknown }[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : "url" in input ? input.url : String(input);
      if (url.includes("/api/ai/status")) {
        return new Response(JSON.stringify({ data: { enabled: true } }));
      }
      const rawBody =
        init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
      const parsedBody = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;
      requests.push({ url, body: parsedBody });
      return new Response(
        JSON.stringify({
          data: {
            category: "3S",
            cause_type: "BEHAVIOR",
            existing_tags: ["s3_oil_spill"],
            proposed_tags: [{ name_vi: "Đề xuất mới", category: IssueCategory.S3 }],
          },
        }),
      );
    }) as typeof fetch;

    try {
      await loadAiStatus();

      let hookRef: HookMethods | null = null;
      let categoryOverwritten = false;
      let causeTypeOverwritten = false;
      let tagsOverwritten = false;

      const catalog: TagItem[] = [
        {
          tag_code: "s3_oil_spill",
          category: IssueCategory.S3,
          label_vi: "Rò rỉ dầu mỡ",
        },
      ];

      function ManualHarness() {
        const result = useDescriptionAiSuggestions({
          description: "Rò rỉ",
          locationSelected: true,
          photoBlob: new Blob(["sample"], { type: "image/jpeg" }),
          category: IssueCategory.S1,
          causeType: CauseType.CONDITION,
          isCauseTypeManual: true,
          selectedTags: ["manual_tag_code"],
          tags: catalog,
          onSelectCategory: () => {
            categoryOverwritten = true;
          },
          onSuggestCauseType: () => {
            causeTypeOverwritten = true;
          },
          onAddTags: () => {
            tagsOverwritten = true;
          },
          translate: (key) => key,
        });
        hookRef = result;
        return null;
      }

      renderToString(React.createElement(ManualHarness));
      expect(hookRef).not.toBeNull();
      if (hookRef !== null) {
        const handler: HookMethods = hookRef;
        await handler.suggestFromDescription();
      }

      expect(requests[0].body).toEqual({
        query: "Rò rỉ",
        description: "Rò rỉ",
        category: IssueCategory.S1,
        cause_type: CauseType.CONDITION,
        image_data_url: "data:image/jpeg;base64,c2FtcGxl",
      });
      expect(categoryOverwritten).toBe(false);
      expect(causeTypeOverwritten).toBe(false);
      expect(tagsOverwritten).toBe(false);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("sends text-only payload without image_data_url when photo is missing", async () => {
    const requests: { url: string; body: Record<string, unknown> }[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : "url" in input ? input.url : String(input);
      if (url.includes("/api/ai/status")) {
        return new Response(JSON.stringify({ data: { enabled: true } }));
      }
      const rawBody =
        init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
      const parsedBody = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;
      requests.push({ url, body: parsedBody });
      return new Response(
        JSON.stringify({
          data: {
            category: "3S",
            cause_type: "CONDITION",
            existing_tags: ["s3_oil_spill"],
            proposed_tags: [],
          },
        }),
      );
    }) as typeof fetch;

    try {
      await loadAiStatus();
      let hookRef: HookMethods | null = null;
      let suggestedCategory: IssueCategory | null = null;
      let suggestedCause: CauseType | null = null;

      function TextOnlyHarness() {
        hookRef = useDescriptionAiSuggestions({
          description: "Mô tả có nhưng không có ảnh",
          locationSelected: true,
          photoBlob: null,
          category: null,
          causeType: CauseType.CONDITION,
          selectedTags: [],
          tags: [{ tag_code: "s3_oil_spill", category: IssueCategory.S3, label_vi: "Dầu" }],
          onSelectCategory: (cat) => {
            suggestedCategory = cat;
          },
          onSuggestCauseType: (cause) => {
            suggestedCause = cause;
          },
          onAddTags: () => {},
          translate: (k) => k,
        });
        return null;
      }

      renderToString(React.createElement(TextOnlyHarness));
      if (hookRef !== null) {
        const handler: HookMethods = hookRef;
        await handler.suggestFromDescription();
      }

      expect(requests.length).toBe(1);
      expect(requests[0].body.query).toBe("Mô tả có nhưng không có ảnh");
      expect(requests[0].body.description).toBe("Mô tả có nhưng không có ảnh");
      expect(requests[0].body.image_data_url).toBeUndefined();
      expect(suggestedCategory as IssueCategory | null).toBe(IssueCategory.S3);
      expect(suggestedCause as CauseType | null).toBe(CauseType.CONDITION);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("provides apply-all behavior that applies only to empty/unselected fields", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : "url" in input ? input.url : String(input);
      if (url.includes("/api/ai/status")) {
        return new Response(JSON.stringify({ data: { enabled: true } }));
      }
      return new Response(
        JSON.stringify({
          data: {
            category: "2S",
            cause_type: "BEHAVIOR",
            existing_tags: ["s2_already_selected", "s2_tool_placement"],
            proposed_tags: [{ name_vi: "Đề xuất 2S", category: IssueCategory.S2 }],
          },
        }),
      );
    }) as typeof fetch;

    try {
      await loadAiStatus();
      let hookRef: HookMethods | null = null;
      let appliedCategory: IssueCategory | null = null;
      let appliedCause: CauseType | null = null;
      let addedExistingTags: string[] = [];
      let addedProposedTags: ProposedTagItem[] = [];

      function ApplyAllHarness() {
        hookRef = useDescriptionAiSuggestions({
          description: "Dụng cụ không để đúng vị trí",
          locationSelected: true,
          photoBlob: null,
          category: null,
          causeType: CauseType.CONDITION,
          isCauseTypeManual: false,
          selectedTags: ["s2_already_selected"],
          tags: [
            { tag_code: "s2_already_selected", category: IssueCategory.S2, label_vi: "Đã chọn" },
            {
              tag_code: "s2_tool_placement",
              category: IssueCategory.S2,
              label_vi: "Vị trí đồ nghề",
            },
          ],
          onSelectCategory: (cat) => {
            appliedCategory = cat;
          },
          onSuggestCauseType: (cause) => {
            appliedCause = cause;
          },
          onAddTags: (existing, proposed) => {
            addedExistingTags = existing;
            addedProposedTags = proposed;
          },
          translate: (k) => k,
        });
        return null;
      }

      renderToString(React.createElement(ApplyAllHarness));
      if (hookRef !== null) {
        const handler: HookMethods = hookRef;
        await handler.suggestFromDescription();
        handler.applyAllSuggestions();
      }

      expect(appliedCategory as IssueCategory | null).toBe(IssueCategory.S2);
      expect(appliedCause as CauseType | null).toBe(CauseType.BEHAVIOR);
      // s2_already_selected was already selected, so apply-all should only add unselected tags
      expect(addedExistingTags).toEqual(["s2_tool_placement"]);
      expect(addedProposedTags).toEqual([{ name_vi: "Đề xuất 2S", category: IssueCategory.S2 }]);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
