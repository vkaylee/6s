import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { IssueAiAssistantBanner } from "../src/pages/create-issue/IssueAiAssistantBanner.tsx";

let registeredHere = false;
let mountedRoot: Root | null = null;
let mountedContainer: HTMLElement | null = null;

beforeAll(() => {
  if (!GlobalRegistrator.isRegistered) {
    GlobalRegistrator.register({ url: "https://6s.test/" });
    registeredHere = true;
  }
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  if (mountedRoot) {
    await act(async () => mountedRoot?.unmount());
  }
  mountedContainer?.remove();
  if (registeredHere) await GlobalRegistrator.unregister();
});

function suggestionProps() {
  return {
    hasPhoto: true,
    hasLocation: true,
    hasDescription: true,
    aiEnabled: true,
    aiLoading: false,
    aiError: null,
    aiRequested: true,
    aiSuggestions: {
      existing_tags: ["s1_waste"],
      proposed_tags: [],
      category: "2S",
      cause_type: "CONDITION" as const,
    },
    tags: [{ code: "s1_waste", label_vi: "Rác thải", category: "2S" }],
    selectedTags: [],
    category: null,
    causeType: "CONDITION" as const,
    onSuggest: () => {},
    onApplyAll: () => {},
    onToggleTag: () => {},
    onSelectCategory: () => {},
    onSelectCauseType: () => {},
    translate: (key: string) => key,
  };
}

describe("IssueAiAssistantBanner", () => {
  it("enables text-only AI with location and description even without evidence photo", () => {
    const textOnlyReady = renderToString(
      <IssueAiAssistantBanner
        hasPhoto={false}
        hasLocation={true}
        hasDescription={true}
        aiEnabled={true}
        aiLoading={false}
        aiError={null}
        aiRequested={false}
        aiSuggestions={{ existing_tags: [], proposed_tags: [] }}
        tags={[]}
        selectedTags={[]}
        category={null}
        onSuggest={() => {}}
        onToggleTag={() => {}}
        onSelectCategory={() => {}}
        translate={(key) => key}
      />,
    );
    expect(textOnlyReady).not.toContain('disabled=""');

    const blockedWithoutLocation = renderToString(
      <IssueAiAssistantBanner
        hasPhoto={true}
        hasLocation={false}
        hasDescription={true}
        aiEnabled={true}
        aiLoading={false}
        aiError={null}
        aiRequested={false}
        aiSuggestions={{ existing_tags: [], proposed_tags: [] }}
        tags={[]}
        selectedTags={[]}
        category={null}
        onSuggest={() => {}}
        onToggleTag={() => {}}
        onSelectCategory={() => {}}
        translate={(key) => key}
      />,
    );
    expect(blockedWithoutLocation).toContain("disabled");
  });

  it("displays suggested category, cause type, and apply-all action", () => {
    const html = renderToString(
      <IssueAiAssistantBanner
        hasPhoto={false}
        hasLocation={true}
        hasDescription={true}
        aiEnabled={true}
        aiLoading={false}
        aiError={null}
        aiRequested={true}
        aiSuggestions={{
          existing_tags: ["s1_waste"],
          proposed_tags: [],
          category: "1S",
          cause_type: "BEHAVIOR",
        }}
        tags={[{ code: "s1_waste", label_vi: "Rác thải", category: "1S" }]}
        selectedTags={[]}
        category={null}
        causeType="CONDITION"
        onSuggest={() => {}}
        onApplyAll={() => {}}
        onToggleTag={() => {}}
        onSelectCategory={() => {}}
        onSelectCauseType={() => {}}
        translate={(key) => key}
      />,
    );
    expect(html).toContain("issue.ai_banner_apply_all");
    expect(html).toContain("Phân loại");
    expect(html).toContain("1S");
    expect(html).toContain("Nguyên nhân");
    expect(html).toContain("Hành vi con người");
  });

  it("renders collapsible trigger when suggestions are present", () => {
    const html = renderToString(
      <IssueAiAssistantBanner
        hasPhoto={true}
        hasLocation={true}
        hasDescription={true}
        aiEnabled={true}
        aiLoading={false}
        aiError={null}
        aiRequested={true}
        aiSuggestions={{
          existing_tags: ["s1_waste"],
          proposed_tags: [],
          category: "2S",
          cause_type: "CONDITION",
        }}
        tags={[{ code: "s1_waste", label_vi: "Rác thải", category: "2S" }]}
        selectedTags={[]}
        category={null}
        causeType="CONDITION"
        onSuggest={() => {}}
        onApplyAll={() => {}}
        onToggleTag={() => {}}
        onSelectCategory={() => {}}
        onSelectCauseType={() => {}}
        translate={(key) => key}
      />,
    );
    expect(html).toContain('id="ai-suggestions-details"');
    expect(html).toContain('aria-controls="ai-suggestions-details"');
  });

  it("collapses and reopens suggestion details from the toggle", async () => {
    mountedContainer = document.createElement("div");
    document.body.appendChild(mountedContainer);
    mountedRoot = createRoot(mountedContainer);
    await act(async () => {
      mountedRoot?.render(<IssueAiAssistantBanner {...suggestionProps()} />);
    });

    const toggle = () =>
      mountedContainer?.querySelector<HTMLButtonElement>(
        "[aria-controls='ai-suggestions-details']",
      );
    expect(toggle()?.getAttribute("aria-expanded")).toBe("true");
    expect(mountedContainer?.querySelector("#ai-suggestions-details")).not.toBeNull();

    await act(async () => {
      toggle()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(toggle()?.getAttribute("aria-expanded")).toBe("false");
    expect(mountedContainer?.querySelector("#ai-suggestions-details")).toBeNull();

    await act(async () => {
      toggle()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(toggle()?.getAttribute("aria-expanded")).toBe("true");
    expect(mountedContainer?.querySelector("#ai-suggestions-details")).not.toBeNull();
  });
});
