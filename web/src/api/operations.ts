import type { IssueItem } from "../types/index.ts";
import { buildSdkTransport } from "./client.ts";
import { closeIssue, invalidateIssue, reopenIssue } from "./generated/index.ts";

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

// The adapter's post() routes through apiClient, which already unwraps the
// { data } envelope, so the SDK result's .data is the IssueItem itself.
async function unwrap(result: Promise<unknown>): Promise<IssueItem> {
  const response = (await result) as { data: IssueItem };
  return response.data;
}

const sdkTransport = buildSdkTransport();

export function mutateIssue<K extends IssueMutation>(
  operation: K,
  id: number,
  body: IssueMutationBody[K],
): Promise<IssueItem> {
  switch (operation) {
    case "close":
      return unwrap(
        closeIssue({ client: sdkTransport, path: { id }, body: body as CloseIssueBody }),
      );
    case "reopen":
      return unwrap(
        reopenIssue({ client: sdkTransport, path: { id }, body: body as ReopenIssueBody }),
      );
    case "invalid":
      return unwrap(
        invalidateIssue({ client: sdkTransport, path: { id }, body: body as InvalidIssueBody }),
      );
  }
  throw new Error(`Unsupported issue mutation: ${operation}`);
}

export const issueOperations = {
  close: (id: number, body: CloseIssueBody) => mutateIssue("close", id, body),
  reopen: (id: number, body: ReopenIssueBody) => mutateIssue("reopen", id, body),
  invalid: (id: number, body: InvalidIssueBody) => mutateIssue("invalid", id, body),
} as const;
