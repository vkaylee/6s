import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { AIReviewPanel, type AIReviewResult } from "../src/components/AIReviewPanel.tsx";
import { IssueCategory, type IssueItem, IssueStatus } from "../src/types/index.ts";

const issue: IssueItem = {
  id: 1,
  client_uuid: "00000000-0000-4000-8000-000000000001",
  version: 1,
  category: IssueCategory.S3,
  location_code: "LINE_A1",
  location_name: "Line A1",
  description: "Issue description",
  photo_before: "",
  status: IssueStatus.OPEN,
  creator_id: 1,
  creator_name: "Reporter",
  tags: [],
  created_at: new Date().toISOString(),
};

const review: AIReviewResult = {
  verdict: "REVIEW",
  feedback: "",
  suggestion: {},
  used_vision: false,
};

function renderPanel(isAskingFollowUp: boolean, streamingAnswer?: string) {
  return renderToString(
    <AIReviewPanel
      review={review}
      currentIssue={issue}
      tags={[]}
      value=""
      selectedProposedTags={[]}
      onSelectedProposedTagsChange={() => {}}
      isAskingFollowUp={isAskingFollowUp}
      pendingFollowUpQuestion={isAskingFollowUp ? "Explain this result" : null}
      streamingFollowUpAnswer={streamingAnswer ?? (isAskingFollowUp ? "Working" : "")}
      followUpCount={isAskingFollowUp ? 1 : 0}
      followUpLimit={5}
      followUpHistory={[]}
      onFollowUpQuestionChange={() => {}}
      onApplySuggestion={() => {}}
      onFollowUp={() => {}}
    />,
  );
}

describe("AIReviewPanel follow-up controls", () => {
  it("hides label, count, input and send button while answering", () => {
    const html = renderPanel(true);

    expect(html).toContain("Explain this result");
    expect(html).toContain("Working");
    expect(html).not.toContain("Hỏi thêm AI");
    expect(html).not.toContain('type="text"');
    expect(html).not.toContain("Gửi");
  });

  it("shows label, count, input and send button when idle", () => {
    const html = renderPanel(false);

    expect(html).toContain("Hỏi thêm AI");
    expect(html).toMatch(/0(?:<!-- -->)?\/(?:<!-- -->)?5/);
    expect(html).toContain('placeholder="Nhập câu hỏi..."');
    expect(html).toContain("Gửi");
  });
});

it("shows animated dots while waiting for follow-up response", () => {
  const html = renderPanel(true, "");

  expect(html).toContain("Đang trả lời");
  expect(html).toContain("animate-bounce");
  expect(html).toContain('style="animation-delay:0ms"');
});

it("renders markdown formatting in AI feedback and follow-up answers", () => {
  const html = renderToString(
    <AIReviewPanel
      review={{ ...review, feedback: "" }}
      currentIssue={issue}
      tags={[]}
      value=""
      selectedProposedTags={[]}
      onSelectedProposedTagsChange={() => {}}
      isAskingFollowUp={false}
      pendingFollowUpQuestion={null}
      streamingFollowUpAnswer=""
      followUpCount={1}
      followUpLimit={5}
      followUpHistory={[
        { question: "What next?", answer: "*Check* the box\n- Confirm location\n1. Close report" },
      ]}
      onFollowUpQuestionChange={() => {}}
      onApplySuggestion={() => {}}
      onFollowUp={() => {}}
    />,
  );

  expect(html).toContain("<em>Check</em>");
  expect(html).toContain("Confirm location");
  expect(html).toContain("Close report");
  expect(html).not.toContain("*Check*");
});

it("renders AI tag codes as localized pills", () => {
  const tags = [{ code: "WET_FLOOR", name_vi: "Sàn ướt", name_zh: "湿地面", name_en: "Wet floor" }];
  const renderFeedback = (feedback: string) =>
    renderToString(
      <AIReviewPanel
        review={review}
        currentIssue={issue}
        tags={tags}
        value=""
        selectedProposedTags={[]}
        onSelectedProposedTagsChange={() => {}}
        isAskingFollowUp={false}
        pendingFollowUpQuestion={null}
        streamingFollowUpAnswer=""
        followUpCount={1}
        followUpLimit={5}
        followUpHistory={[{ question: "Check", answer: feedback }]}
        onFollowUpQuestionChange={() => {}}
        onApplySuggestion={() => {}}
        onFollowUp={() => {}}
      />,
    );

  const vietnamese = renderFeedback("Sàn có ' WET_FLOOR ' cần xử lý.");
  expect(vietnamese).toContain("Sàn ướt");
  expect(vietnamese).toContain('title="WET_FLOOR"');
  expect(vietnamese).not.toContain("' Sàn ướt '");
  expect(vietnamese).not.toContain("'WET_FLOOR'");

  const chinese = renderFeedback("发现 #WET_FLOOR，需要处理。");
  expect(chinese).toContain("湿地面");
  expect(chinese).toContain('title="WET_FLOOR"');
  const english = renderFeedback("Review `WET_FLOOR` before closing.");
  expect(english).toContain("Wet floor");
  expect(english).not.toContain("<code");

  const proposedFeedback = renderToString(
    <AIReviewPanel
      review={{
        ...review,
        feedback:
          "Hình ảnh xác nhận móc cẩu thiếu khóa an toàn. Thẻ ' Tràn đổ hóa chất nguy hiểm chưa xử lý ' chọn sai thực tế.",
        suggestion: {
          proposed_tags: [
            {
              name_vi: "Tràn đổ hóa chất nguy hiểm chưa xử lý",
              name_zh: "未处理危险化学品泄漏",
              name_en: "Unaddressed hazardous chemical spill",
              category: "6S",
            },
          ],
        },
      }}
      currentIssue={issue}
      tags={tags}
      value=""
      selectedProposedTags={[]}
      onSelectedProposedTagsChange={() => {}}
      isAskingFollowUp={false}
      pendingFollowUpQuestion={null}
      streamingFollowUpAnswer=""
      followUpCount={1}
      followUpLimit={5}
      followUpHistory={[
        {
          question: "Chi tiết",
          answer:
            "Hình ảnh xác nhận móc cẩu thiếu khóa an toàn. Thẻ ' Tràn đổ hóa chất nguy hiểm chưa xử lý ' chọn sai thực tế.",
        },
      ]}
      onFollowUpQuestionChange={() => {}}
      onApplySuggestion={() => {}}
      onFollowUp={() => {}}
    />,
  );
  expect(proposedFeedback).toContain("Tràn đổ hóa chất nguy hiểm chưa xử lý");
  expect(proposedFeedback).not.toContain("' Tràn đổ hóa chất nguy hiểm chưa xử lý '");
  expect(proposedFeedback).not.toContain("Thẻ '");

  const parenFeedback = renderToString(
    <AIReviewPanel
      review={{
        ...review,
        feedback:
          "Phân loại 6S đúng nhưng chọn nhầm thẻ tràn đổ hóa chất ( Tràn đổ hóa chất nguy hiểm chưa xử lý ). Cần bỏ thẻ Tràn đổ hóa chất nguy hiểm chưa xử lý .",
        suggestion: {
          proposed_tags: [
            {
              name_vi: "Tràn đổ hóa chất nguy hiểm chưa xử lý",
              name_zh: "未处理危险化学品泄漏",
              name_en: "Unaddressed hazardous chemical spill",
              category: "6S",
            },
          ],
        },
      }}
      currentIssue={issue}
      tags={tags}
      value=""
      selectedProposedTags={[]}
      onSelectedProposedTagsChange={() => {}}
      isAskingFollowUp={false}
      pendingFollowUpQuestion={null}
      streamingFollowUpAnswer=""
      followUpCount={1}
      followUpLimit={5}
      followUpHistory={[
        {
          question: "Chi tiết",
          answer:
            "Phân loại 6S đúng nhưng chọn nhầm thẻ tràn đổ hóa chất ( Tràn đổ hóa chất nguy hiểm chưa xử lý ). Cần bỏ thẻ Tràn đổ hóa chất nguy hiểm chưa xử lý .",
        },
      ]}
      onFollowUpQuestionChange={() => {}}
      onApplySuggestion={() => {}}
      onFollowUp={() => {}}
    />,
  );
  expect(parenFeedback).not.toContain("( Tràn đổ hóa chất nguy hiểm chưa xử lý )");
  expect(parenFeedback).not.toContain("( <span");
  expect(parenFeedback).not.toContain("</span> )");
  expect(parenFeedback).toContain("thẻ tràn đổ hóa chất <span");
});

it("allows only HTTPS markdown links in AI answers", () => {
  const html = renderToString(
    <AIReviewPanel
      review={review}
      currentIssue={issue}
      tags={[]}
      value=""
      selectedProposedTags={[]}
      onSelectedProposedTagsChange={() => {}}
      isAskingFollowUp={false}
      pendingFollowUpQuestion={null}
      streamingFollowUpAnswer=""
      followUpCount={1}
      followUpLimit={5}
      followUpHistory={[
        { question: "Links", answer: "[Guide](https://example.com) [Unsafe](javascript:alert(1))" },
      ]}
      onFollowUpQuestionChange={() => {}}
      onApplySuggestion={() => {}}
      onFollowUp={() => {}}
    />,
  );

  expect(html).toContain('href="https://example.com"');
  expect(html).toContain("[Unsafe](javascript:alert(1))");
  expect(html).not.toContain('href="javascript:alert(1)"');
});

it("renders panel header with title and collapse toggle", () => {
  const html = renderPanel(false);

  expect(html).toContain("Đánh giá từ AI");
  expect(html).toContain("Thu gọn");
  expect(html).toContain('aria-controls="ai-review-content"');
  expect(html).toContain('aria-expanded="true"');
  expect(html).toContain("sm:flex-row");
  expect(html).toContain("flex-wrap");
});

it("renders proposed new tags with apply buttons", () => {
  const html = renderToString(
    <AIReviewPanel
      review={{
        ...review,
        suggestion: {
          proposed_tags: [
            { name_vi: "Mùi khét máy", name_zh: "焦味", name_en: "Burning smell", category: "3S" },
          ],
        },
      }}
      currentIssue={issue}
      tags={[]}
      value=""
      selectedProposedTags={[]}
      onSelectedProposedTagsChange={() => {}}
      isAskingFollowUp={false}
      pendingFollowUpQuestion={null}
      streamingFollowUpAnswer=""
      followUpCount={0}
      followUpLimit={5}
      followUpHistory={[]}
      onFollowUpQuestionChange={() => {}}
      onApplySuggestion={() => {}}
      onFollowUp={() => {}}
    />,
  );
  expect(html).toContain("Mùi khét máy");
  expect(html).toContain("3S");
});

it("filters out proposed tags that were already selected by user", () => {
  const html = renderToString(
    <AIReviewPanel
      review={{
        ...review,
        suggestion: {
          proposed_tags: [
            { name_vi: "Mùi khét máy", name_zh: "焦味", name_en: "Burning smell", category: "3S" },
          ],
        },
      }}
      currentIssue={issue}
      tags={[]}
      value=""
      selectedProposedTags={[
        { name_vi: "Mùi khét máy", name_zh: "焦味", name_en: "Burning smell", category: "3S" },
      ]}
      onSelectedProposedTagsChange={() => {}}
      isAskingFollowUp={false}
      pendingFollowUpQuestion={null}
      streamingFollowUpAnswer=""
      followUpCount={0}
      followUpLimit={5}
      followUpHistory={[]}
      onFollowUpQuestionChange={() => {}}
      onApplySuggestion={() => {}}
      onFollowUp={() => {}}
    />,
  );
  expect(html).toContain("✓ #Mùi khét máy");
  expect(html).not.toContain("· Áp dụng");
});
