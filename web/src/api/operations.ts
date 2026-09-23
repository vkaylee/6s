import type {
  IssueItem,
  LocationHealthScore,
  LocationItem,
  PaginationMeta,
  ProposedTagItem,
  ReporterLeaderboard,
  TagItem,
} from "../types/index.ts";
import { apiClient, sdkClient } from "./client.ts";
import type {
  CloseIssueData,
  GetReporterLeaderboardData,
  InvalidateIssueData,
  Issue,
  ListIssuesData,
  ReopenIssueData,
  UpdateIssueData,
  UpsertTagData,
} from "./generated/index.ts";
import {
  closeIssue,
  getIssue,
  getLocationLeaderboard,
  getReporterLeaderboard,
  invalidateIssue,
  listIssues,
  listLocations,
  listTags,
  reopenIssue,
  updateIssue,
  upsertTag,
} from "./generated/index.ts";
export type IssueMutation = "close" | "reopen" | "invalid";

export type CloseIssueBody = NonNullable<CloseIssueData["body"]>;
export type ReopenIssueBody = ReopenIssueData["body"];
export type InvalidIssueBody = InvalidateIssueData["body"];
export type IssueMutationBody = {
  close: CloseIssueBody;
  reopen: ReopenIssueBody;
  invalid: InvalidIssueBody;
};

const issueMutationPaths: Record<IssueMutation, string> = {
  close: "/api/issues/{id}/close",
  reopen: "/api/issues/{id}/reopen",
  invalid: "/api/issues/{id}/invalid",
};
export function issueMutationPath(operation: IssueMutation, id: number): string {
  return issueMutationPaths[operation].replace("{id}", String(id));
}

export async function mutateIssue<K extends IssueMutation>(
  operation: K,
  id: number,
  body: IssueMutationBody[K],
): Promise<Issue> {
  if (operation === "close") {
    const result = await closeIssue({
      client: sdkClient,
      path: { id },
      body: body as CloseIssueBody,
      throwOnError: true,
    });
    return result.data.data;
  }
  if (operation === "reopen") {
    const result = await reopenIssue({
      client: sdkClient,
      path: { id },
      body: body as ReopenIssueBody,
      throwOnError: true,
    });
    return result.data.data;
  }
  const result = await invalidateIssue({
    client: sdkClient,
    path: { id },
    body: body as InvalidIssueBody,
    throwOnError: true,
  });
  return result.data.data;
}

export const issueOperations = {
  close: (id: number, body: CloseIssueBody) => mutateIssue("close", id, body),
  reopen: (id: number, body: ReopenIssueBody) => mutateIssue("reopen", id, body),
  invalid: (id: number, body: InvalidIssueBody) => mutateIssue("invalid", id, body),
} as const;

export async function fetchIssue(id: number): Promise<IssueItem> {
  const result = await getIssue({ client: sdkClient, path: { id }, throwOnError: true });
  return result.data.data as IssueItem;
}

export async function fetchIssuePage(
  query: NonNullable<ListIssuesData["query"]> | Record<string, unknown>,
): Promise<{ data: IssueItem[]; pagination: PaginationMeta }> {
  const result = await listIssues({
    client: sdkClient,
    query: query as NonNullable<ListIssuesData["query"]>,
    throwOnError: true,
  });
  return result.data as { data: IssueItem[]; pagination: PaginationMeta };
}

export type UpdateIssueBody = NonNullable<UpdateIssueData["body"]>;

export async function patchIssue(id: number, body: UpdateIssueBody): Promise<IssueItem> {
  const result = await updateIssue({
    client: sdkClient,
    path: { id },
    body,
    throwOnError: true,
  });
  return result.data.data as IssueItem;
}

export async function fetchLocations(): Promise<LocationItem[]> {
  const result = await listLocations({ client: sdkClient, throwOnError: true });
  return result.data.data as LocationItem[];
}

export async function fetchTags(): Promise<TagItem[]> {
  const result = await listTags({ client: sdkClient, throwOnError: true });
  return result.data.data.map((tag) => ({
    ...tag,
    tag_code: tag.code,
    label_vi: tag.name_vi,
    label_zh: tag.name_zh,
    label_en: tag.name_en,
  }));
}

export async function createTag(body: UpsertTagData["body"]): Promise<TagItem> {
  const result = await upsertTag({ client: sdkClient, body, throwOnError: true });
  return result.data.data;
}

export async function fetchLocationLeaderboard(): Promise<LocationHealthScore[]> {
  const result = await getLocationLeaderboard({ client: sdkClient, throwOnError: true });
  return result.data.data;
}

export async function fetchReporterLeaderboard(
  query?: GetReporterLeaderboardData["query"],
): Promise<ReporterLeaderboard[]> {
  const result = await getReporterLeaderboard({ client: sdkClient, query, throwOnError: true });
  return result.data.data as ReporterLeaderboard[];
}

export interface TagSuggestionResult {
  existing_tags: string[];
  proposed_tags: ProposedTagItem[];
}

export interface SuggestTagsInput {
  query: string;
  category?: string | null;
  description?: string;
}

/** AI tag suggestion; callers must gate on AI status before invoking. */
export async function suggestTags(input: SuggestTagsInput): Promise<TagSuggestionResult> {
  const result = await apiClient<TagSuggestionResult>("/api/ai/suggest-tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return {
    existing_tags: result?.existing_tags ?? [],
    proposed_tags: result?.proposed_tags ?? [],
  };
}

export type TagReviewAction = "APPROVE" | "REJECT" | "MERGE";

export async function reviewTag(
  code: string,
  action: TagReviewAction,
  mergedTagCode?: string,
): Promise<TagItem> {
  return apiClient<TagItem>(`/api/tags/${encodeURIComponent(code)}/review`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      action === "MERGE" ? { action, merged_tag_code: mergedTagCode } : { action },
    ),
  });
}
