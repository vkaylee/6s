import { apiClient } from "./client.ts";
import type { IssueItem } from "../types/index.ts";

/** Derived from openapi.yaml; transport/auth/error handling stays in apiClient. */
export type IssueMutation = "close" | "reopen" | "invalid";

export interface CloseIssueBody {
  score_rating?: number;
}

export interface ReopenIssueBody {
  reject_reason: string;
}

export interface InvalidIssueBody {
  reason: string;
}

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

export function mutateIssue<K extends IssueMutation>(
  operation: K,
  id: number,
  body: IssueMutationBody[K],
): Promise<IssueItem> {
  return apiClient<IssueItem>(issueMutationPath(operation, id), {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export const issueOperations = {
  close: (id: number, body: CloseIssueBody) => mutateIssue("close", id, body),
  reopen: (id: number, body: ReopenIssueBody) => mutateIssue("reopen", id, body),
  invalid: (id: number, body: InvalidIssueBody) => mutateIssue("invalid", id, body),
} as const;
