import { ArrowUpDown, RotateCw, Search, X } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { Link, Route, Switch, useLocation, useSearch } from "wouter";
import { apiClient } from "./api/client.ts";
import { ConflictModal } from "./components/ConflictModal.tsx";
import { GlobalDialog } from "./components/GlobalDialog.tsx";
import { HealthGauge } from "./components/HealthGauge.tsx";
import { IssueCard } from "./components/IssueCard.tsx";
import { IssueCardSkeleton } from "./components/IssueCardSkeleton.tsx";
import { OfflineOutboxDrawer } from "./components/OfflineOutboxDrawer.tsx";
import { PageContainer } from "./components/PageContainer.tsx";
import { ProtectedRoute } from "./components/ProtectedRoute.tsx";
import { type FacetKey, QuickFacets } from "./components/QuickFacets.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import type { DraftResolve } from "./db/indexeddb.ts";
import { useI18nStore } from "./i18n/index.ts";
import { CreateIssuePage } from "./pages/CreateIssuePage.tsx";
import { IssueDetailModal } from "./pages/IssueDetailModal.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";
import { ScoreLedgerPage } from "./pages/ScoreLedgerPage.tsx";
import { SetupSuperadminModal } from "./pages/SetupSuperadminModal.tsx";

import { useAuthStore } from "./store/authStore.ts";
import { modalDialog } from "./store/dialogStore.ts";
import { useThemeStore } from "./store/themeStore.ts";
import { syncEngine } from "./sync/syncEngine.ts";
import {
  IssueCategory,
  type IssueItem,
  IssueStatus,
  type LocationHealthScore,
  type LocationItem,
  type ReporterLeaderboard,
  type TagItem,
} from "./types/index.ts";

const AdminConfigPage = lazy(() =>
  import("./pages/AdminConfigPage.tsx").then((m) => ({ default: m.AdminConfigPage })),
);
const ReportsPage = lazy(() =>
  import("./pages/ReportsPage.tsx").then((m) => ({ default: m.ReportsPage })),
);

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo(0, 0);
    }
  }, [location]);
  return null;
}

export function App() {
  const { t } = useI18nStore();
  const { user, accessToken, restoreSession } = useAuthStore();
  const { initTheme } = useThemeStore();
  const [currentPath, setLocation] = useLocation();
  const searchString = useSearch();
  const [issues, setIssues] = useState<IssueItem[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [tags, setTags] = useState<TagItem[]>([]);
  const [locationHealth, setLocationHealth] = useState<LocationHealthScore[]>([]);
  const [reporters, setReporters] = useState<ReporterLeaderboard[]>([]);
  const [leaderboardTab, setLeaderboardTab] = useState<"LOCATIONS" | "REPORTERS">("LOCATIONS");
  const [activeFacet, setActiveFacetState] = useState<FacetKey>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("6s_active_facet");
      if (
        saved &&
        ["ALL", "MY_ISSUES", "MY_LINE", "SAFETY_6S", "OVERDUE_48H", "WAITING_MY_REVIEW"].includes(
          saved,
        )
      ) {
        return saved as FacetKey;
      }
    }
    return "ALL";
  });
  const setActiveFacet = (facet: FacetKey) => {
    setActiveFacetState(facet);
    if (typeof window !== "undefined") {
      localStorage.setItem("6s_active_facet", facet);
    }
  };
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrderState] = useState<"URGENT" | "NEWEST" | "OLDEST">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("6s_sort_order");
      if (saved && ["URGENT", "NEWEST", "OLDEST"].includes(saved)) {
        return saved as "URGENT" | "NEWEST" | "OLDEST";
      }
    }
    return "URGENT";
  });
  const setSortOrder = (order: "URGENT" | "NEWEST" | "OLDEST") => {
    setSortOrderState(order);
    if (typeof window !== "undefined") {
      localStorage.setItem("6s_sort_order", order);
    }
  };
  const [isLoadingIssues, setIsLoadingIssues] = useState(false);

  const [showAllLeaderboard, setShowAllLeaderboard] = useState(false);
  // Modals state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<IssueItem | null>(null);

  const [conflictItem, setConflictItem] = useState<DraftResolve | null>(null);
  const [isSetupOpen, setIsSetupOpen] = useState(false);

  useEffect(() => {
    initTheme();
    restoreSession();
    checkSetupStatus();
  }, [initTheme, restoreSession]);
  // Function to open an issue by ID (either from local state or fetch from server)
  const openIssueById = async (issueId: number) => {
    const existing = issues.find((i) => i.id === issueId);
    if (existing) {
      setSelectedIssue(existing);
      return;
    }
    try {
      const fetched = await apiClient<IssueItem>(`/api/issues/${issueId}`);
      if (fetched) {
        setSelectedIssue(fetched);
      }
    } catch {
      // ignore if not found
    }
  };

  // Support deep linking to issue via query param ?issue_id=123 (wouter reactive search)
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const issueIdStr = params.get("issue_id");
    if (issueIdStr) {
      openIssueById(Number(issueIdStr));
    }
  }, [searchString, issues]);
  useEffect(() => {
    if (!user) return;
    syncEngine.start();
    loadMasterData();
    loadIssues();
    loadLeaderboards();

    let wasSyncing = false;
    const unsub = syncEngine.subscribe((p) => {
      if (wasSyncing && !p.isSyncing) {
        loadIssues();
        loadLeaderboards();
      }
      wasSyncing = p.isSyncing;
    });
    let es: EventSource | null = null;
    let active = true;
    if (typeof window !== "undefined" && typeof EventSource !== "undefined" && accessToken) {
      apiClient<{ ticket: string }>("/api/auth/ticket", { method: "POST" })
        .then(({ ticket }) => {
          if (!active) return;
          es = new EventSource(`/api/issues/events?ticket=${encodeURIComponent(ticket)}`);
          es.addEventListener("issue", () => {
            loadIssues();
            loadLeaderboards();
          });
        })
        .catch(() => {
          // ponytail: fallback if ticket endpoint unavailable
          if (!active) return;
          es = new EventSource(`/api/issues/events?token=${encodeURIComponent(accessToken)}`);
          es.addEventListener("issue", () => {
            loadIssues();
            loadLeaderboards();
          });
        });
    }

    return () => {
      active = false;
      unsub();
      if (es) {
        es.close();
      }
      syncEngine.stop();
    };
  }, [user, accessToken]);

  const DEFAULT_TAGS: TagItem[] = [
    // 1S: Sàng lọc
    {
      tag_code: "scrap_material",
      category: IssueCategory.S1,
      label_vi: "Phế liệu / Rác thừa",
      label_zh: "多余废料 / 生产废品",
    },
    {
      tag_code: "unneeded_tools",
      category: IssueCategory.S1,
      label_vi: "Dụng cụ thừa",
      label_zh: "闲置工具 / 多余夹具",
    },
    {
      tag_code: "expired_chemical",
      category: IssueCategory.S1,
      label_vi: "Hóa chất quá hạn",
      label_zh: "过期化学品 / 胶水",
    },
    {
      tag_code: "broken_equipment",
      category: IssueCategory.S1,
      label_vi: "Máy móc / Pallet hỏng",
      label_zh: "损坏设备 / 报废托盘",
    },
    {
      tag_code: "stagnant_wip",
      category: IssueCategory.S1,
      label_vi: "Hàng ứ đọng",
      label_zh: "呆滞在制品 / 超量",
    },
    {
      tag_code: "excess_inventory",
      category: IssueCategory.S1,
      label_vi: "Vật tư quá định mức",
      label_zh: "物料超额积压 / 呆滞料",
    },
    {
      tag_code: "unused_furniture",
      category: IssueCategory.S1,
      label_vi: "Bàn ghế / Kệ cũ hỏng",
      label_zh: "闲置桌椅 / 破损货架",
    },
    {
      tag_code: "expired_sample",
      category: IssueCategory.S1,
      label_vi: "Mẫu cũ hết hạn",
      label_zh: "过期样板 / 作废样品",
    },
    {
      tag_code: "obsolete_documents",
      category: IssueCategory.S1,
      label_vi: "Tài liệu / Bản vẽ cũ",
      label_zh: "作废图纸 / 过期文件",
    },
    // 2S: Sắp xếp
    {
      tag_code: "blocked_aisle",
      category: IssueCategory.S2,
      label_vi: "Chắn lối đi",
      label_zh: "堵塞通道 / 逃生门",
    },
    {
      tag_code: "missing_demarcation",
      category: IssueCategory.S2,
      label_vi: "Mất vạch kẻ sàn",
      label_zh: "缺少定位线 / 标线",
    },
    {
      tag_code: "wrong_tool_place",
      category: IssueCategory.S2,
      label_vi: "Để đồ sai vị trí",
      label_zh: "工具未归位 / 乱放",
    },
    {
      tag_code: "tangled_cables",
      category: IssueCategory.S2,
      label_vi: "Dây cáp bừa bộn",
      label_zh: "线缆气管杂乱",
    },
    {
      tag_code: "unlabeled_container",
      category: IssueCategory.S2,
      label_vi: "Thùng chứa thiếu nhãn",
      label_zh: "周转箱无标识",
    },
    {
      tag_code: "stack_too_high",
      category: IssueCategory.S2,
      label_vi: "Xếp hàng quá cao",
      label_zh: "货物码放超高",
    },
    {
      tag_code: "mixed_materials",
      category: IssueCategory.S2,
      label_vi: "Vật tư lẫn lộn",
      label_zh: "不同物料混放 / 无隔离",
    },
    {
      tag_code: "no_max_min_mark",
      category: IssueCategory.S2,
      label_vi: "Thiếu vạch mức Max/Min",
      label_zh: "货架缺少高低限标识",
    },
    {
      tag_code: "cart_outside_parking",
      category: IssueCategory.S2,
      label_vi: "Xe đẩy đỗ sai vạch",
      label_zh: "手推车未停放在划线区",
    },
    {
      tag_code: "cleaning_tool_misplaced",
      category: IssueCategory.S2,
      label_vi: "Dụng cụ vệ sinh vứt bừa",
      label_zh: "清扫工具乱放 / 未悬挂",
    },
    // 3S: Sạch sẽ
    {
      tag_code: "oil_leak",
      category: IssueCategory.S3,
      label_vi: "Rò rỉ dầu mỡ",
      label_zh: "设备漏油 / 润滑油",
    },
    {
      tag_code: "dust_accumulation",
      category: IssueCategory.S3,
      label_vi: "Bụi bẩn tích tụ",
      label_zh: "设备积尘 / 管道积垢",
    },
    {
      tag_code: "trash_overflow",
      category: IssueCategory.S3,
      label_vi: "Thùng rác đầy tràn",
      label_zh: "垃圾桶溢出 / 乱扔",
    },
    {
      tag_code: "scattered_trash",
      category: IssueCategory.S3,
      label_vi: "Rác rơi vãi trên sàn",
      label_zh: "垃圾杂物散落 / 地面碎屑",
    },
    {
      tag_code: "water_leak",
      category: IssueCategory.S3,
      label_vi: "Rò rỉ nước",
      label_zh: "冷却水泄漏 / 渗水",
    },
    {
      tag_code: "dirty_workstation",
      category: IssueCategory.S3,
      label_vi: "Bàn làm việc bẩn",
      label_zh: "工作台脏污 / 残留",
    },
    {
      tag_code: "dirty_light_fixtures",
      category: IssueCategory.S3,
      label_vi: "Bóng đèn bám bụi mờ",
      label_zh: "灯具积灰 / 照度不足",
    },
    {
      tag_code: "stained_floor",
      category: IssueCategory.S3,
      label_vi: "Sàn ố bẩn / Vết bánh xe",
      label_zh: "地面油斑污迹 / 叉车印",
    },
    {
      tag_code: "dirty_electrical_panel",
      category: IssueCategory.S3,
      label_vi: "Tủ điện bám bụi bẩn",
      label_zh: "配电箱积尘 / 蛛网杂物",
    },
    {
      tag_code: "clogged_drain",
      category: IssueCategory.S3,
      label_vi: "Rãnh nước nghẹt rác",
      label_zh: "地沟堵塞 / 排水不畅",
    },
    // 4S: Săn sóc
    {
      tag_code: "missing_label",
      category: IssueCategory.S4,
      label_vi: "Mất nhãn thiết bị",
      label_zh: "缺少设备标牌 / 铭牌",
    },
    {
      tag_code: "broken_gauge",
      category: IssueCategory.S4,
      label_vi: "Đồng hồ đo hỏng/mờ",
      label_zh: "压力表损坏 / 仪表",
    },
    {
      tag_code: "outdated_notice",
      category: IssueCategory.S4,
      label_vi: "Bảng tin / Checklist cũ",
      label_zh: "点检表未更新 / 过期",
    },
    {
      tag_code: "faded_standard",
      category: IssueCategory.S4,
      label_vi: "Mất hướng dẫn SOP",
      label_zh: "缺少作业指导书",
    },
    {
      tag_code: "damaged_pipe_color",
      category: IssueCategory.S4,
      label_vi: "Màu sơn đường ống hỏng",
      label_zh: "管道色标脱落",
    },
    {
      tag_code: "missing_calibration",
      category: IssueCategory.S4,
      label_vi: "Thước đo quá hạn kiểm",
      label_zh: "量具过期未校验 / 缺绿标",
    },
    {
      tag_code: "torn_safety_sign",
      category: IssueCategory.S4,
      label_vi: "Biển cảnh báo rách",
      label_zh: "安全警示标识破损 / 缺失",
    },
    {
      tag_code: "unauthorized_mod",
      category: IssueCategory.S4,
      label_vi: "Tự ý câu dây / Sửa máy",
      label_zh: "私自拉线接线 / 擅改设备",
    },
    // 5S: Sẵn sàng
    {
      tag_code: "ppe_violation",
      category: IssueCategory.S5,
      label_vi: "Sai tác phong / Trang phục",
      label_zh: "未按规着装 / 穿戴",
    },
    {
      tag_code: "improper_storage",
      category: IssueCategory.S5,
      label_vi: "Không đậy nắp thùng",
      label_zh: "化学品未加盖 / 敞口",
    },
    {
      tag_code: "sop_noncompliance",
      category: IssueCategory.S5,
      label_vi: "Không tuân thủ SOP",
      label_zh: "违规作业 / 未按标准",
    },
    {
      tag_code: "eating_at_workstation",
      category: IssueCategory.S5,
      label_vi: "Ăn uống sai vị trí",
      label_zh: "工位吃喝 / 乱扔烟蒂",
    },
    {
      tag_code: "sleeping_on_shift",
      category: IssueCategory.S5,
      label_vi: "Ngủ trong giờ làm việc",
      label_zh: "上班睡觉 / 脱岗串岗",
    },
    {
      tag_code: "phone_use_operating",
      category: IssueCategory.S5,
      label_vi: "Dùng điện thoại khi chạy máy",
      label_zh: "操作设备时看手机",
    },
    {
      tag_code: "running_in_workshop",
      category: IssueCategory.S5,
      label_vi: "Chạy giỡn trong xưởng",
      label_zh: "车间内奔跑打闹",
    },
    // 6S: An toàn
    {
      tag_code: "safety_gear",
      category: IssueCategory.S6,
      label_vi: "Thiếu bảo hộ PPE",
      label_zh: "未穿戴必需劳保",
    },
    {
      tag_code: "fire_hazard",
      category: IssueCategory.S6,
      label_vi: "Chặn tủ cứu hỏa / Cháy",
      label_zh: "消防栓受阻 / 易燃",
    },
    {
      tag_code: "exposed_wire",
      category: IssueCategory.S6,
      label_vi: "Hở dây / Tủ điện mở",
      label_zh: "电线裸露 / 配电箱未锁",
    },
    {
      tag_code: "slippery_floor",
      category: IssueCategory.S6,
      label_vi: "Sàn trơn trượt",
      label_zh: "地面湿滑 / 易摔倒",
    },
    {
      tag_code: "missing_machine_guard",
      category: IssueCategory.S6,
      label_vi: "Mất nắp chắn an toàn",
      label_zh: "拆除防护罩 / 挡板",
    },
    {
      tag_code: "chemical_spill",
      category: IssueCategory.S6,
      label_vi: "Tràn đổ hóa chất",
      label_zh: "危险化学品泄漏",
    },
    {
      tag_code: "emergency_stop_fault",
      category: IssueCategory.S6,
      label_vi: "Nút dừng khẩn cấp hỏng",
      label_zh: "急停按钮失灵 / 卡死",
    },
    {
      tag_code: "broken_ladder_scaffold",
      category: IssueCategory.S6,
      label_vi: "Thang / Giàn giáo hỏng",
      label_zh: "损坏梯子 / 脚手架无护栏",
    },
    {
      tag_code: "gas_cylinder_unsecured",
      category: IssueCategory.S6,
      label_vi: "Bình khí không xích",
      label_zh: "气瓶未固定 / 倒地隐患",
    },
    {
      tag_code: "forklift_speeding",
      category: IssueCategory.S6,
      label_vi: "Xe nâng chạy quá tốc",
      label_zh: "叉车超速 / 转弯未鸣笛",
    },
    {
      tag_code: "overloaded_socket",
      category: IssueCategory.S6,
      label_vi: "Ổ điện cắm quá tải",
      label_zh: "插座超负荷 / 烧焦痕迹",
    },
  ];

  const loadMasterData = async () => {
    try {
      const [locData, tagData] = await Promise.all([
        apiClient<LocationItem[]>("/api/locations"),
        apiClient<Record<string, unknown>[]>("/api/tags"),
      ]);
      setLocations(locData || []);
      if (tagData && tagData.length > 0) {
        const normalized: TagItem[] = tagData.map((t) => ({
          tag_code: (t.code || t.tag_code || "") as string,
          category: (t.category || "") as string,
          label_vi: (t.name_vi || t.label_vi || "") as string,
          label_zh: (t.name_zh || t.label_zh || "") as string,
          label_en: (t.name_en || t.label_en || "") as string,
        }));
        setTags(normalized);
      } else {
        setTags(DEFAULT_TAGS);
      }
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
      setTags(DEFAULT_TAGS);
    }
  };

  const loadIssues = async () => {
    setIsLoadingIssues(true);
    try {
      const data = await apiClient<IssueItem[]>("/api/issues");
      const list = data || [];
      setIssues(list);
      setSelectedIssue((prev) => (prev ? list.find((i) => i.id === prev.id) || prev : null));
    } catch {
      // ignore
    } finally {
      setIsLoadingIssues(false);
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

  // Filter issues according to quick facets and search query (SPEC.md Section 9.8.A)
  const filteredIssues = issues.filter((iss) => {
    if (activeFacet === "MY_ISSUES" && iss.creator_id !== user?.id) {
      return false;
    }
    if (
      activeFacet === "MY_LINE" &&
      user?.assigned_location_code &&
      iss.location_code !== user.assigned_location_code
    ) {
      return false;
    }
    if (activeFacet === "SAFETY_6S" && iss.category !== IssueCategory.S6) {
      return false;
    }
    if (activeFacet === "OVERDUE_48H") {
      const isOverdue = Date.now() - new Date(iss.created_at).getTime() > 48 * 3600 * 1000;
      if (!(iss.status === IssueStatus.OPEN && isOverdue)) {
        return false;
      }
    }
    if (activeFacet === "WAITING_MY_REVIEW" && iss.status !== IssueStatus.PENDING_REVIEW) {
      return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchLocCode = iss.location_code?.toLowerCase().includes(q);
      const matchLocName = iss.location_name?.toLowerCase().includes(q);
      const matchDesc = iss.description?.toLowerCase().includes(q);
      const matchCreator = iss.creator_name?.toLowerCase().includes(q);
      const matchResolver = iss.resolver_name?.toLowerCase().includes(q);
      const matchTags = iss.tags?.some((t) => t.toLowerCase().includes(q));
      const matchCategory = iss.category?.toLowerCase().includes(q);
      if (
        !matchLocCode &&
        !matchLocName &&
        !matchDesc &&
        !matchCreator &&
        !matchResolver &&
        !matchTags &&
        !matchCategory
      ) {
        return false;
      }
    }

    return true;
  });

  // Sort issues according to selected order
  const sortedIssues = [...filteredIssues].sort((a, b) => {
    if (sortOrder === "NEWEST") {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
    if (sortOrder === "OLDEST") {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
    // Default URGENT: Safety 6S first, then Overdue 48h, then Pending Review, then oldest open
    const aIsSafety = a.category === IssueCategory.S6 && a.status === IssueStatus.OPEN ? 1 : 0;
    const bIsSafety = b.category === IssueCategory.S6 && b.status === IssueStatus.OPEN ? 1 : 0;
    if (aIsSafety !== bIsSafety) return bIsSafety - aIsSafety;

    const now = Date.now();
    const aOverdue =
      a.status === IssueStatus.OPEN && now - new Date(a.created_at).getTime() > 48 * 3600 * 1000
        ? 1
        : 0;
    const bOverdue =
      b.status === IssueStatus.OPEN && now - new Date(b.created_at).getTime() > 48 * 3600 * 1000
        ? 1
        : 0;
    if (aOverdue !== bOverdue) return bOverdue - aOverdue;

    const aPending = a.status === IssueStatus.PENDING_REVIEW ? 1 : 0;
    const bPending = b.status === IssueStatus.PENDING_REVIEW ? 1 : 0;
    if (aPending !== bPending) return bPending - aPending;

    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // Facet Counts
  const nowTime = Date.now();
  const facetCounts: Record<FacetKey, number> = {
    ALL: issues.length,
    MY_ISSUES: issues.filter((i) => i.creator_id === user?.id).length,
    MY_LINE: user?.assigned_location_code
      ? issues.filter((i) => i.location_code === user.assigned_location_code).length
      : issues.length,
    SAFETY_6S: issues.filter(
      (i) => i.category === IssueCategory.S6 && i.status === IssueStatus.OPEN,
    ).length,
    OVERDUE_48H: issues.filter(
      (i) =>
        i.status === IssueStatus.OPEN &&
        nowTime - new Date(i.created_at).getTime() > 48 * 3600 * 1000,
    ).length,
    WAITING_MY_REVIEW: issues.filter((i) => i.status === IssueStatus.PENDING_REVIEW).length,
  };

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
    <>
      <ScrollToTop />
      <Switch>
        <Route path="/login">
          <LoginPage />
        </Route>
        <Route path="/admin">
          <ProtectedRoute>
            <Suspense
              fallback={
                <div className="min-h-screen flex items-center justify-center bg-zinc-100 dark:bg-black">
                  <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              }
            >
              <AdminConfigPage />
            </Suspense>
          </ProtectedRoute>
        </Route>
        <Route path="/reports">
          <ProtectedRoute>
            <Suspense
              fallback={
                <div className="min-h-screen flex items-center justify-center bg-zinc-100 dark:bg-black">
                  <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              }
            >
              <ReportsPage />
            </Suspense>
          </ProtectedRoute>
        </Route>
        <Route path="/leaderboard/locations/:code">
          {(params) => (
            <ProtectedRoute>
              <ScoreLedgerPage
                targetType="LOCATION"
                id={params.code}
                onSelectIssue={(issueId) => {
                  openIssueById(issueId);
                  setLocation(`/?issue_id=${issueId}`, { replace: true });
                }}
              />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/leaderboard/reporters/:id">
          {(params) => (
            <ProtectedRoute>
              <ScoreLedgerPage
                targetType="USER"
                id={params.id}
                onSelectIssue={(issueId) => {
                  openIssueById(issueId);
                  setLocation(`/?issue_id=${issueId}`, { replace: true });
                }}
              />
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/issues/new">
          <ProtectedRoute>
            <CreateIssuePage
              locations={locations}
              tags={tags}
              onSuccess={() => {
                loadIssues();
                loadLeaderboards();
              }}
            />
          </ProtectedRoute>
        </Route>
        <Route path="/">
          <ProtectedRoute>
            <div className="min-h-screen bg-zinc-100 dark:bg-black text-zinc-900 dark:text-zinc-100 font-sans pb-28">
              {/* Top Unified Header & Status Bar */}
              <StatusBar
                onOpenDrawer={() => setIsDrawerOpen(true)}
                onNavigate={(path) => setLocation(path)}
              />

              {/* Main Container */}
              <main className="pt-4">
                <PageContainer className="space-y-4">
                  {/* Health Gauge Ring Widget (SPEC.md Section 9.8.A) */}
                  <HealthGauge
                    score={overallScore}
                    openCount={totalOpen}
                    overdueCount={totalOverdue}
                    onClick={() => setActiveFacet("ALL")}
                  />

                  {/* Leaderboards widget (Tabs) */}
                  <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-zinc-200 dark:border-zinc-800 shadow-sm">
                    <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2 mb-3">
                      <div className="flex space-x-2">
                        <button
                          type="button"
                          onClick={() => {
                            setLeaderboardTab("LOCATIONS");
                            setShowAllLeaderboard(false);
                          }}
                          className={`text-xs font-black px-3 py-1.5 rounded-lg ${
                            leaderboardTab === "LOCATIONS"
                              ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                              : "text-zinc-500"
                          }`}
                        >
                          {t("leaderboard.location_health")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setLeaderboardTab("REPORTERS");
                            setShowAllLeaderboard(false);
                          }}
                          className={`text-xs font-black px-3 py-1.5 rounded-lg ${
                            leaderboardTab === "REPORTERS"
                              ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                              : "text-zinc-500"
                          }`}
                        >
                          {t("leaderboard.top_reporters")}
                        </button>
                      </div>
                      <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800/60 px-2 py-0.5 rounded-md">
                        {leaderboardTab === "LOCATIONS"
                          ? t("leaderboard.cycle_weekly")
                          : t("leaderboard.cycle_monthly")}
                      </span>
                    </div>
                    {leaderboardTab === "LOCATIONS" ? (
                      <div className="space-y-2">
                        {locationHealth.length === 0 ? (
                          <div className="text-xs text-zinc-400 py-2 text-center">
                            {t("leaderboard.no_location_data")}
                          </div>
                        ) : (
                          (showAllLeaderboard ? locationHealth : locationHealth.slice(0, 3)).map(
                            (loc) => (
                              <Link
                                key={loc.location_code}
                                href={`/leaderboard/locations/${encodeURIComponent(loc.location_code)}`}
                                className="w-full flex items-center justify-between text-xs p-2.5 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors text-left group"
                              >
                                <div className="flex items-center space-x-2 min-w-0">
                                  <span className="font-bold text-zinc-800 dark:text-zinc-200 group-hover:text-blue-600 truncate">
                                    {loc.location_name || loc.location_code}
                                  </span>
                                  {loc.overdue_count > 0 && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-rose-600 text-white animate-pulse shrink-0">
                                      {loc.overdue_count}{" "}
                                      {t("health_gauge.overdue_count").split(":")[0]}
                                    </span>
                                  )}
                                  {loc.open_count > 0 && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 shrink-0">
                                      {loc.open_count} {t("status.OPEN")}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="font-black text-blue-600 dark:text-blue-400">
                                    {loc.health_score} {t("leaderboard.points_unit")}
                                  </span>
                                  <span className="text-[10px] text-zinc-400 font-medium group-hover:text-zinc-600">
                                    →
                                  </span>
                                </div>
                              </Link>
                            ),
                          )
                        )}
                        {locationHealth.length > 3 && (
                          <button
                            type="button"
                            onClick={() => setShowAllLeaderboard((prev) => !prev)}
                            className="w-full text-center py-1.5 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {showAllLeaderboard
                              ? t("common.collapse")
                              : t("leaderboard.view_all").replace(
                                  "{count}",
                                  String(locationHealth.length),
                                )}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {reporters.length === 0 ? (
                          <div className="text-xs text-zinc-400 py-2 text-center">
                            {t("leaderboard.no_reporter_data")}
                          </div>
                        ) : (
                          (showAllLeaderboard ? reporters : reporters.slice(0, 3)).map(
                            (rep, idx) => (
                              <Link
                                key={rep.user_id}
                                href={`/leaderboard/reporters/${encodeURIComponent(String(rep.user_id))}`}
                                className="w-full flex items-center justify-between text-xs p-2.5 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors text-left group"
                              >
                                <div className="flex items-center space-x-2">
                                  <span className="font-bold text-zinc-800 dark:text-zinc-200 group-hover:text-amber-600">
                                    {idx === 0
                                      ? "🥇"
                                      : idx === 1
                                        ? "🥈"
                                        : idx === 2
                                          ? "🥉"
                                          : `#${idx + 1}`}{" "}
                                    {rep.full_name}
                                  </span>
                                  <span className="text-[10px] text-zinc-400 font-medium">
                                    (🔍 {t("leaderboard.view_history")})
                                  </span>
                                </div>
                                <span className="font-black text-amber-600">
                                  {rep.points} {t("leaderboard.points_unit")} ({rep.valid_count}{" "}
                                  {t("leaderboard.issues_unit")})
                                </span>
                              </Link>
                            ),
                          )
                        )}
                        {reporters.length > 3 && (
                          <button
                            type="button"
                            onClick={() => setShowAllLeaderboard((prev) => !prev)}
                            className="w-full text-center py-1.5 text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:underline"
                          >
                            {showAllLeaderboard
                              ? t("common.collapse")
                              : t("leaderboard.view_all").replace(
                                  "{count}",
                                  String(reporters.length),
                                )}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Quick Facets Bar */}
                  <QuickFacets
                    activeFacet={activeFacet}
                    onSelectFacet={(f) => setActiveFacet(f)}
                    counts={facetCounts}
                  />
                  {/* Search Input Bar */}
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                      <Search className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t("app.search_placeholder")}
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-10 py-2.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-rose-500 shadow-xs"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        aria-label={t("app.search_clear")}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Issue List */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2 text-xs font-bold text-zinc-500 uppercase px-1">
                      <span>{t("app.issues_list", { count: sortedIssues.length })}</span>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg px-2 py-1 normal-case font-medium">
                          <ArrowUpDown className="w-3 h-3 text-zinc-400" />
                          <select
                            value={sortOrder}
                            onChange={(e) =>
                              setSortOrder(e.target.value as "URGENT" | "NEWEST" | "OLDEST")
                            }
                            className="bg-transparent text-xs font-semibold focus:outline-none cursor-pointer"
                          >
                            <option value="URGENT">{t("app.sort_urgent")}</option>
                            <option value="NEWEST">{t("app.sort_newest")}</option>
                            <option value="OLDEST">{t("app.sort_oldest")}</option>
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={loadIssues}
                          className="text-blue-600 dark:text-blue-400 min-h-[36px] flex items-center gap-1 hover:underline lowercase font-semibold"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                          <span>{t("app.refresh")}</span>
                        </button>
                      </div>
                    </div>
                    {isLoadingIssues ? (
                      <div className="space-y-3">
                        <IssueCardSkeleton />
                        <IssueCardSkeleton />
                        <IssueCardSkeleton />
                      </div>
                    ) : sortedIssues.length === 0 ? (
                      <div className="text-center py-12 px-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col items-center">
                        <span className="text-4xl mb-3 block">
                          {issues.length === 0 ? "🎉" : "🔍"}
                        </span>
                        <p className="font-bold text-sm text-zinc-800 dark:text-zinc-200">
                          {issues.length === 0 ? t("app.empty_all_clear") : t("issue.no_issues")}
                        </p>
                        <p className="text-xs text-zinc-400 mt-1 max-w-xs">
                          {issues.length === 0 ? "" : t("app.empty_search_desc")}
                        </p>
                        {(searchQuery || activeFacet !== "ALL") && (
                          <button
                            type="button"
                            onClick={() => {
                              setSearchQuery("");
                              setActiveFacet("ALL");
                            }}
                            className="mt-4 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-bold rounded-xl transition"
                          >
                            {t("app.empty_reset_btn")}
                          </button>
                        )}
                      </div>
                    ) : (
                      sortedIssues.map((iss) => (
                        <IssueCard key={iss.id} issue={iss} onClick={() => setSelectedIssue(iss)} />
                      ))
                    )}
                  </div>
                </PageContainer>
              </main>

              {/* Bottom Sticky Action Bar (Glove Friendly 64px, SPEC.md Section 9.1) */}
              <div className="fixed bottom-0 inset-x-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 p-4 z-30">
                <PageContainer className="flex items-center justify-between gap-3">
                  <Link
                    href="/issues/new"
                    className="flex-1 bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white font-black text-base py-4 px-6 rounded-2xl min-h-[64px] flex items-center justify-center space-x-2 shadow-xl shadow-rose-600/30 transition-transform"
                  >
                    <span className="text-xl">📸</span>
                    <span>{t("issue.create").toUpperCase()}</span>
                  </Link>
                </PageContainer>
              </div>

              {/* Modals & Drawers */}
              <OfflineOutboxDrawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                onResolveConflict={(r) => setConflictItem(r)}
              />

              {selectedIssue && (
                <IssueDetailModal
                  issue={selectedIssue}
                  isOpen={true}
                  onClose={() => {
                    setSelectedIssue(null);
                    const currentParams = new URLSearchParams(searchString);
                    if (currentParams.has("issue_id")) {
                      currentParams.delete("issue_id");
                      const newSearch = currentParams.toString();
                      setLocation(newSearch ? `${currentPath}?${newSearch}` : currentPath, {
                        replace: true,
                      });
                    }
                  }}
                  onRefresh={() => {
                    loadIssues();
                    loadLeaderboards();
                  }}
                  locations={locations}
                  tags={tags}
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

              <SetupSuperadminModal
                isOpen={isSetupOpen}
                onSuccess={() => {
                  setIsSetupOpen(false);
                  loadMasterData();
                  loadIssues();
                }}
              />
            </div>
          </ProtectedRoute>
        </Route>
        <Route>
          <NotFoundPage />
        </Route>
      </Switch>
      <GlobalDialog />
    </>
  );
}
