import type { Issue } from "./generated/index.ts";
import { sdkClient } from "./client.ts";
import { closeIssue, invalidateIssue, reopenIssue } from "./generated/index.ts";

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

export async function mutateIssue<K extends IssueMutation>(
  operation: K,
  id: number,
  body: IssueMutationBody[K],
): Promise<Issue> {
  switch (operation) {
    case "close":
      return (await closeIssue({ client: sdkClient, path: { id }, body: body as CloseIssueBody, throwOnError: true })).data.data;
    case "reopen":
      return (await reopenIssue({ client: sdkClient, path: { id }, body: body as ReopenIssueBody, throwOnError: true })).data.data;
    case "invalid":
      return (await invalidateIssue({ client: sdkClient, path: { id }, body: body as InvalidIssueBody, throwOnError: true })).data.data;
  }
  throw new Error(`Unsupported issue mutation: ${operation}`);
}

export const issueOperations = {
  close: (id: number, body: CloseIssueBody) => mutateIssue("close", id, body),
  reopen: (id: number, body: ReopenIssueBody) => mutateIssue("reopen", id, body),
  invalid: (id: number, body: InvalidIssueBody) => mutateIssue("invalid", id, body),
} as const;
