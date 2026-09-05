import { useEffect, useState } from "react";
import { apiClient } from "./api/client.ts";
import { ConflictModal } from "./components/ConflictModal.tsx";
import { GlobalDialog } from "./components/GlobalDialog.tsx";
import { HealthGauge } from "./components/HealthGauge.tsx";
import { IssueCard } from "./components/IssueCard.tsx";
import { OfflineOutboxDrawer } from "./components/OfflineOutboxDrawer.tsx";
import { type FacetKey, QuickFacets } from "./components/QuickFacets.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import type { DraftResolve } from "./db/indexeddb.ts";
import { useI18nStore } from "./i18n/index.ts";
import { AdminConfigModal } from "./pages/AdminConfigModal.tsx";
import { CreateIssueModal } from "./pages/CreateIssueModal.tsx";
import { IssueDetailModal } from "./pages/IssueDetailModal.tsx";
import { LoginModal } from "./pages/LoginModal.tsx";
import { SetupSuperadminModal } from "./pages/SetupSuperadminModal.tsx";
import { useAuthStore } from "./store/authStore.ts";
import { modalDialog } from "./store/dialogStore.ts";
import { syncEngine } from "./sync/syncEngine.ts";
import {
  IssueCategory,
  type IssueItem,
  IssueStatus,
  type LocationHealthScore,
  type LocationItem,
  type ReporterLeaderboard,
  type TagItem,
  UserRole,
} from "./types/index.ts";

export function App() {
  const { t } = useI18nStore();
  const { user, clearAuth, restoreSession } = useAuthStore();
  const [isDark, setIsDark] = useState(false);
  const [issues, setIssues] = useState<IssueItem[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [tags, setTags] = useState<TagItem[]>([]);
  const [locationHealth, setLocationHealth] = useState<LocationHealthScore[]>([]);
  const [reporters, setReporters] = useState<ReporterLeaderboard[]>([]);
  const [leaderboardTab, setLeaderboardTab] = useState<"LOCATIONS" | "REPORTERS">("LOCATIONS");
  const [activeFacet, setActiveFacet] = useState<FacetKey>("ALL");

  // Modals state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<IssueItem | null>(null);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [conflictItem, setConflictItem] = useState<DraftResolve | null>(null);
  const [isSetupOpen, setIsSetupOpen] = useState(false);

  useEffect(() => {
    restoreSession();
    syncEngine.start();
    loadMasterData();
    loadIssues();
    loadLeaderboards();
    checkSetupStatus();

    // Check system preference for dark mode
    if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
      setIsDark(true);
    }

    return () => {
      syncEngine.stop();
    };
  }, [restoreSession]);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  const loadMasterData = async () => {
    try {
      const [locData, tagData] = await Promise.all([
        apiClient<LocationItem[]>("/api/locations"),
        apiClient<TagItem[]>("/api/tags"),
      ]);
      setLocations(locData || []);
      setTags(tagData || []);
    } catch {
      // Offline fallback defaults
      setLocations([
        {
          code: "LINE_A1",
          name_vi: "Chuyền May A1",
          name_zh: "缝纫一拉",
          name_en: "Sewing Line A1",
          is_active: true,
        },
        {
          code: "LINE_A2",
          name_vi: "Chuyền May A2",
          name_zh: "缝纫二拉",
          name_en: "Sewing Line A2",
          is_active: true,
        },
        {
          code: "WAREHOUSE",
          name_vi: "Kho Nguyên Liệu",
          name_zh: "原料仓",
          name_en: "Raw Warehouse",
          is_active: true,
        },
      ]);
      setTags([
        { tag_code: "oil_leak", category: "3S", label_vi: "Rò rỉ dầu", label_zh: "漏油" },
        {
          tag_code: "safety_gear",
          category: "6S",
          label_vi: "Thiếu đồ bảo hộ",
          label_zh: "未穿戴劳保",
        },
      ]);
    }
  };

  const loadIssues = async () => {
    try {
      const data = await apiClient<IssueItem[]>("/api/issues");
      setIssues(data || []);
    } catch {
      // ignore
    }
  };

  const loadLeaderboards = async () => {
    try {
      const [locHealth, repLeader] = await Promise.all([
        apiClient<LocationHealthScore[]>("/api/leaderboard/locations"),
        apiClient<ReporterLeaderboard[]>("/api/leaderboard/reporters"),
      ]);
      setLocationHealth(locHealth || []);
      setReporters(repLeader || []);
    } catch {
      // ignore
    }
  };

  const checkSetupStatus = async () => {
    try {
      const res = await apiClient<{ needs_setup: boolean }>("/api/auth/setup-status", {
        skipAuth: true,
      });
      if (res?.needs_setup) {
        setIsSetupOpen(true);
      }
    } catch {
      // ignore offline or failed status checks
    }
  };

  // Filter issues according to quick facets (SPEC.md Section 9.8.A)
  const filteredIssues = issues.filter((iss) => {
    if (activeFacet === "MY_ISSUES") {
      return iss.creator_id === user?.id;
    }
    if (activeFacet === "MY_LINE") {
      return user?.assigned_location_code
        ? iss.location_code === user.assigned_location_code
        : true;
    }
    if (activeFacet === "SAFETY_6S") {
      return iss.category === IssueCategory.S6;
    }
    if (activeFacet === "OVERDUE_48H") {
      const isOverdue = Date.now() - new Date(iss.created_at).getTime() > 48 * 3600 * 1000;
      return iss.status === IssueStatus.OPEN && isOverdue;
    }
    if (activeFacet === "WAITING_MY_REVIEW") {
      return iss.status === IssueStatus.PENDING_REVIEW;
    }
    return true;
  });

  const overallScore =
    locationHealth.length > 0
      ? Math.round(
          locationHealth.reduce((acc, curr) => acc + curr.health_score, 0) / locationHealth.length,
        )
      : 100;

  const totalOpen = issues.filter((i) => i.status === IssueStatus.OPEN).length;
  const totalOverdue = issues.filter((i) => {
    const isOverdue = Date.now() - new Date(i.created_at).getTime() > 48 * 3600 * 1000;
    return i.status === IssueStatus.OPEN && isOverdue;
  }).length;

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-black text-zinc-900 dark:text-zinc-100 font-sans pb-28">
      {/* Top Status Bar with Network indicator */}
      <StatusBar
        onOpenDrawer={() => setIsDrawerOpen(true)}
        isDark={isDark}
        onToggleDark={() => setIsDark(!isDark)}
      />

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-4 pt-4 space-y-4">
        {/* User bar & Login trigger */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">
              {t("nav.title")}
            </h1>
            <p className="text-xs text-zinc-500">6S Issue Tracker</p>
          </div>
          <div>
            {user ? (
              <div className="flex items-center space-x-2">
                <div className="text-right">
                  <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                    {user.full_name}
                  </div>
                  <div className="text-[10px] text-zinc-400 font-medium">
                    {user.role} {user.assigned_location_code && `• ${user.assigned_location_code}`}
                  </div>
                </div>
                {user.role === UserRole.ADMIN && (
                  <button
                    type="button"
                    onClick={() => setIsAdminOpen(true)}
                    className="p-2 bg-zinc-200 dark:bg-zinc-800 rounded-lg text-xs font-bold min-h-[44px]"
                  >
                    ⚙️
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => clearAuth()}
                  className="text-xs text-rose-600 dark:text-rose-400 font-bold p-2 min-h-[44px]"
                >
                  {t("auth.logout")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsLoginOpen(true)}
                className="bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-xl min-h-[44px] shadow-sm"
              >
                {t("auth.login")}
              </button>
            )}
          </div>
        </div>

        {/* Health Gauge Ring Widget (SPEC.md Section 9.8.A) */}
        <HealthGauge
          score={overallScore}
          openCount={totalOpen}
          overdueCount={totalOverdue}
          onClick={() => setActiveFacet("ALL")}
        />

        {/* Leaderboards widget (Tabs) */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="flex space-x-2 border-b border-zinc-200 dark:border-zinc-800 pb-2 mb-3">
            <button
              type="button"
              onClick={() => setLeaderboardTab("LOCATIONS")}
              className={`text-xs font-black px-3 py-1.5 rounded-lg ${
                leaderboardTab === "LOCATIONS"
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                  : "text-zinc-500"
              }`}
            >
              Sức khỏe khu vực
            </button>
            <button
              type="button"
              onClick={() => setLeaderboardTab("REPORTERS")}
              className={`text-xs font-black px-3 py-1.5 rounded-lg ${
                leaderboardTab === "REPORTERS"
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                  : "text-zinc-500"
              }`}
            >
              Top Thợ săn 6S
            </button>
          </div>

          {leaderboardTab === "LOCATIONS" ? (
            <div className="space-y-2">
              {locationHealth.length === 0 ? (
                <div className="text-xs text-zinc-400 py-2 text-center">
                  Chưa có dữ liệu chấm điểm tuần
                </div>
              ) : (
                locationHealth.slice(0, 3).map((loc) => (
                  <div
                    key={loc.location_code}
                    className="flex items-center justify-between text-xs p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl"
                  >
                    <span className="font-bold">{loc.location_name || loc.location_code}</span>
                    <span className="font-black text-blue-600 dark:text-blue-400">
                      {loc.health_score} điểm
                    </span>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {reporters.length === 0 ? (
                <div className="text-xs text-zinc-400 py-2 text-center">
                  Chưa có dữ liệu vinh danh tháng
                </div>
              ) : (
                reporters.slice(0, 3).map((rep, idx) => (
                  <div
                    key={rep.user_id}
                    className="flex items-center justify-between text-xs p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl"
                  >
                    <span className="font-bold">
                      {idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉"} {rep.full_name}
                    </span>
                    <span className="font-black text-amber-600">
                      {rep.points} điểm ({rep.valid_count} lỗi)
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Quick Facets Bar */}
        <QuickFacets
          activeFacet={activeFacet}
          onSelectFacet={(f) => setActiveFacet(f)}
          pendingReviewCount={issues.filter((i) => i.status === IssueStatus.PENDING_REVIEW).length}
        />

        {/* Issue List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-zinc-500 uppercase px-1">
            <span>Danh sách vấn đề ({filteredIssues.length})</span>
            <button
              type="button"
              onClick={loadIssues}
              className="text-blue-600 min-h-[44px] flex items-center"
            >
              Làm mới ↻
            </button>
          </div>

          {filteredIssues.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800">
              <span className="text-4xl mb-2 block">📋</span>
              <p className="font-bold text-sm text-zinc-700 dark:text-zinc-300">
                {t("issue.no_issues")}
              </p>
            </div>
          ) : (
            filteredIssues.map((iss) => (
              <IssueCard key={iss.id} issue={iss} onClick={() => setSelectedIssue(iss)} />
            ))
          )}
        </div>
      </main>

      {/* Bottom Sticky Action Bar (Glove Friendly 64px, SPEC.md Section 9.1) */}
      <div className="fixed bottom-0 inset-x-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 p-4 z-30">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="flex-1 bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white font-black text-base py-4 px-6 rounded-2xl min-h-[64px] flex items-center justify-center space-x-2 shadow-xl shadow-rose-600/30 transition-transform"
          >
            <span className="text-xl">📸</span>
            <span>{t("issue.create").toUpperCase()}</span>
          </button>
        </div>
      </div>

      {/* Modals & Drawers */}
      <OfflineOutboxDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onResolveConflict={(r) => setConflictItem(r)}
      />

      <CreateIssueModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        locations={locations}
        tags={tags}
        onSuccess={() => {
          loadIssues();
          loadLeaderboards();
        }}
      />

      {selectedIssue && (
        <IssueDetailModal
          issue={selectedIssue}
          isOpen={true}
          onClose={() => setSelectedIssue(null)}
          onRefresh={() => {
            loadIssues();
            loadLeaderboards();
          }}
        />
      )}

      {conflictItem && (
        <ConflictModal
          resolveItem={conflictItem}
          serverVersion={2}
          onOverwrite={() => {
            modalDialog.alert("Đã gửi yêu cầu ghi đè");
            setConflictItem(null);
          }}
          onDiscard={() => {
            setConflictItem(null);
          }}
          onClose={() => setConflictItem(null)}
        />
      )}

      <AdminConfigModal isOpen={isAdminOpen} onClose={() => setIsAdminOpen(false)} />

      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />

      <SetupSuperadminModal
        isOpen={isSetupOpen}
        onSuccess={() => {
          setIsSetupOpen(false);
          loadMasterData();
          loadIssues();
        }}
      />

      <GlobalDialog />
    </div>
  );
}
