import { apiClient } from "../api/client.ts";
import {
  type DraftIssue,
  type DraftResolve,
  deleteDraftIssue,
  deleteDraftResolve,
  getAllDraftIssues,
  getAllDraftResolves,
  saveDraftIssue,
  saveDraftResolve,
} from "../db/indexeddb.ts";
import { useAuthStore } from "../store/authStore.ts";

export interface SyncProgress {
  total: number;
  completed: number;
  currentName: string;
  percent: number;
  isSyncing: boolean;
  conflictCount: number;
}

type ProgressListener = (progress: SyncProgress) => void;

class SyncEngine {
  private isRunning = false;
  private timer: number | null = null;
  private listeners: ProgressListener[] = [];
  private progress: SyncProgress = {
    total: 0,
    completed: 0,
    currentName: "",
    percent: 0,
    isSyncing: false,
    conflictCount: 0,
  };

  public subscribe(listener: ProgressListener): () => void {
    this.listeners.push(listener);
    listener(this.progress);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    for (const l of this.listeners) {
      l({ ...this.progress });
    }
  }

  /**
   * Starts online event listener and 30s health probe polling.
   */
  public start() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => {
        this.triggerSync();
      });
    }

    if (!this.timer) {
      this.timer = Number(
        setInterval(() => {
          this.probeAndSync();
        }, 30000),
      );
    }

    // Trigger initial sync attempt
    this.triggerSync();
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Health probe check via /api/health
   */
  public async probeAndSync() {
    try {
      const res = await fetch("/api/health", { method: "HEAD" });
      if (res.ok) {
        await this.triggerSync();
      } else {
        useAuthStore.getState().enableOfflineGrace();
      }
    } catch {
      useAuthStore.getState().enableOfflineGrace();
    }
  }

  /**
   * Executes two-step sync:
   * Step 1: Sync new draft issues via POST /api/issues/sync (multipart)
   * Step 2: Sync draft resolves via POST /api/issues/{id}/resolve (expected_version)
   */
  public async triggerSync(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      const draftIssues = await getAllDraftIssues();
      const draftResolves = await getAllDraftResolves();

      const pendingIssues = draftIssues.filter((i) => i.sync_status !== "SYNCING");
      const pendingResolves = draftResolves.filter(
        (r) => r.sync_status === "PENDING" || r.sync_status === "FAILED",
      );
      const conflictResolves = draftResolves.filter((r) => r.sync_status === "CONFLICT");

      const totalTasks = pendingIssues.length + pendingResolves.length;
      if (totalTasks === 0) {
        this.progress = {
          total: 0,
          completed: 0,
          currentName: "",
          percent: 100,
          isSyncing: false,
          conflictCount: conflictResolves.length,
        };
        this.notify();
        return;
      }

      let completedTasks = 0;
      this.progress = {
        total: totalTasks,
        completed: 0,
        currentName: "Bắt đầu đồng bộ...",
        percent: 0,
        isSyncing: true,
        conflictCount: conflictResolves.length,
      };
      this.notify();

      // Step 1: Sync Draft Issues
      for (const issue of pendingIssues) {
        this.progress.currentName = `Tải lên báo cáo: ${issue.category} - ${issue.location_code}`;
        this.notify();

        issue.sync_status = "SYNCING";
        await saveDraftIssue(issue);

        const success = await this.syncOneIssue(issue);
        if (success) {
          await deleteDraftIssue(issue.client_uuid);
        } else {
          issue.sync_status = "FAILED";
          await saveDraftIssue(issue);
        }

        completedTasks++;
        this.progress.completed = completedTasks;
        this.progress.percent = Math.round((completedTasks / totalTasks) * 100);
        this.notify();
      }

      // Step 2: Sync Draft Resolves
      for (const resolveItem of pendingResolves) {
        this.progress.currentName = `Đồng bộ khắc phục issue #${resolveItem.issue_id}`;
        this.notify();

        resolveItem.sync_status = "SYNCING";
        await saveDraftResolve(resolveItem);

        const result = await this.syncOneResolve(resolveItem);
        if (result === "SUCCESS") {
          await deleteDraftResolve(resolveItem.resolved_client_uuid);
        } else if (result === "CONFLICT") {
          resolveItem.sync_status = "CONFLICT";
          await saveDraftResolve(resolveItem);
          this.progress.conflictCount++;
        } else {
          resolveItem.sync_status = "FAILED";
          await saveDraftResolve(resolveItem);
        }

        completedTasks++;
        this.progress.completed = completedTasks;
        this.progress.percent = Math.round((completedTasks / totalTasks) * 100);
        this.notify();
      }
    } finally {
      this.isRunning = false;
      this.progress.isSyncing = false;
      this.notify();
    }
  }

  private async syncOneIssue(issue: DraftIssue): Promise<boolean> {
    try {
      const formData = new FormData();
      formData.append("client_uuid", issue.client_uuid);
      formData.append("category", issue.category);
      formData.append("location_code", issue.location_code);
      formData.append("description", issue.description);
      formData.append("tags", JSON.stringify(issue.tags));
      formData.append("created_at", new Date(issue.created_at).toISOString());
      formData.append("photo_before", issue.photo_before_blob, "before.jpg");

      if (issue.photo_detail_blob) {
        formData.append("photo_detail", issue.photo_detail_blob, "detail.jpg");
      }

      await apiClient("/api/issues/sync", {
        method: "POST",
        body: formData,
      });

      return true;
    } catch {
      return false;
    }
  }

  private async syncOneResolve(
    resolveItem: DraftResolve,
  ): Promise<"SUCCESS" | "CONFLICT" | "FAILED"> {
    try {
      const formData = new FormData();
      formData.append("resolved_client_uuid", resolveItem.resolved_client_uuid);
      formData.append("expected_version", String(resolveItem.expected_version));
      formData.append("photo_after", resolveItem.photo_after_blob, "after.jpg");
      await apiClient(`/api/issues/${resolveItem.issue_id}/resolve`, {
        method: "POST",
        body: formData,
      });

      return "SUCCESS";
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "status" in err &&
        (err as { status: number }).status === 409
      ) {
        return "CONFLICT";
      }
      return "FAILED";
    }
  }
}

export const syncEngine = new SyncEngine();
