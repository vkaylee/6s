import { type DBSchema, type IDBPDatabase, openDB } from "idb";

export interface DraftIssue {
  client_uuid: string;
  category: string;
  cause_type?: string;
  location_code: string;
  tags: string[];
  description: string;
  photo_before_blob: Blob;
  photo_detail_blob?: Blob;
  created_at: number;
  sync_status: "PENDING" | "SYNCING" | "FAILED";
}

export interface DraftResolve {
  resolved_client_uuid: string;
  issue_id: number;
  expected_version: number;
  photo_after_blob: Blob;
  resolved_at: number;
  sync_status: "PENDING" | "SYNCING" | "FAILED" | "CONFLICT";
}

export interface AuthSession {
  id: string; // "current"
  refresh_token: string;
  user: {
    id: number;
    username: string;
    full_name: string;
    role: string;
    capabilities?: string[];
    assigned_location_code?: string;
  };
  updated_at: number;
}

export interface SixSDatabase extends DBSchema {
  draft_issues: {
    key: string;
    value: DraftIssue;
    indexes: { "by-status": string };
  };
  draft_resolves: {
    key: string;
    value: DraftResolve;
    indexes: { "by-status": string };
  };
  auth_session: {
    key: string;
    value: AuthSession;
  };
}

const DB_NAME = "6s_local_db";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<SixSDatabase>> | null = null;

export function getLocalDB(): Promise<IDBPDatabase<SixSDatabase>> {
  if (!dbPromise) {
    dbPromise = openDB<SixSDatabase>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("draft_issues")) {
          const issueStore = db.createObjectStore("draft_issues", {
            keyPath: "client_uuid",
          });
          issueStore.createIndex("by-status", "sync_status");
        }
        if (!db.objectStoreNames.contains("draft_resolves")) {
          const resolveStore = db.createObjectStore("draft_resolves", {
            keyPath: "resolved_client_uuid",
          });
          resolveStore.createIndex("by-status", "sync_status");
        }
        if (!db.objectStoreNames.contains("auth_session")) {
          db.createObjectStore("auth_session", { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

// Helper methods for draft_issues
export async function saveDraftIssue(issue: DraftIssue): Promise<void> {
  const db = await getLocalDB();
  await db.put("draft_issues", issue);
}

export async function getDraftIssue(clientUuid: string): Promise<DraftIssue | undefined> {
  const db = await getLocalDB();
  return db.get("draft_issues", clientUuid);
}

export async function getAllDraftIssues(): Promise<DraftIssue[]> {
  const db = await getLocalDB();
  return db.getAll("draft_issues");
}

export async function deleteDraftIssue(clientUuid: string): Promise<void> {
  const db = await getLocalDB();
  await db.delete("draft_issues", clientUuid);
}

// Helper methods for draft_resolves
export async function saveDraftResolve(resolve: DraftResolve): Promise<void> {
  const db = await getLocalDB();
  await db.put("draft_resolves", resolve);
}

export async function getDraftResolve(resolvedUuid: string): Promise<DraftResolve | undefined> {
  const db = await getLocalDB();
  return db.get("draft_resolves", resolvedUuid);
}

export async function getAllDraftResolves(): Promise<DraftResolve[]> {
  const db = await getLocalDB();
  return db.getAll("draft_resolves");
}

export async function deleteDraftResolve(resolvedUuid: string): Promise<void> {
  const db = await getLocalDB();
  await db.delete("draft_resolves", resolvedUuid);
}

// Helper methods for auth_session
export async function saveAuthSession(session: AuthSession): Promise<void> {
  const db = await getLocalDB();
  await db.put("auth_session", session);
}

export async function getAuthSession(): Promise<AuthSession | undefined> {
  const db = await getLocalDB();
  return db.get("auth_session", "current");
}

export async function clearAuthSession(): Promise<void> {
  const db = await getLocalDB();
  await db.delete("auth_session", "current");
}
