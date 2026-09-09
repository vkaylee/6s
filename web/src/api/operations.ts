import { sdkClient } from "./client.ts";
import type { Issue } from "./generated/index.ts";
import { closeIssue, invalidateIssue, reopenIssue } from "./generated/index.ts";

export type IssueMutation = "close" | "reopen" | "invalid";

export type CloseIssueBody = {
  score_rating?: number;
};
export type ReopenIssueBody = {
  reject_reason: string;
};
export type InvalidIssueBody = {
  reason: string;
};
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
