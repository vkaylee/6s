import { useEffect, useState } from "react";
import { apiClient } from "../api/client.ts";
import { NavActions } from "../components/NavActions.tsx";
import { PageContainer } from "../components/PageContainer.tsx";
import { useHeaderVisibility } from "../hooks/useHeaderVisibility.ts";
import { useI18nStore } from "../i18n/index.ts";
import { modalDialog } from "../store/dialogStore.ts";
import {
  type AIConfigData,
  type AIDNSTestResponse,
  type AITestResponse,
  IssueCategory,
  type LocationItem,
  resolveI18n,
  S_CATEGORIES,
} from "../types/index.ts";
import { haptics } from "../utils/haptics.ts";
import { goBack } from "../utils/navigation.ts";

interface ScoringRuleItem {
  rule_key: string;
  points: number;
  description: string;
}

interface NotificationConfigData {
  wxpusher_enabled: boolean;
  has_app_token: boolean;
  has_webhook_url: boolean;
  public_base_url: string;
  updated_at?: string;
}

interface TestNotifyResult {
  channel: string;
  success: boolean;
  error?: string;
}

interface TagItemData {
  code: string;
  name_vi: string;
  name_zh?: string;
  name_en?: string;
  category: string;
  use_count: number;
  is_preset?: boolean;
  is_active?: boolean;
}

export function AdminConfigPage() {
  const { t, locale } = useI18nStore();
  const isHeaderVisible = useHeaderVisibility();
  const [activeTab, setActiveTab] = useState<
    "LOCATIONS" | "SCORING" | "AD" | "NOTIFICATIONS" | "TAGS" | "AI"
  >("LOCATIONS");

  // Scoring config state
  const [rules, setRules] = useState<Record<string, number>>({});
  const [applyFrom, setApplyFrom] = useState("");
  const [reason, setReason] = useState("");
  const [isRetroactive, setIsRetroactive] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // AD config state
  const [adEnabled, setAdEnabled] = useState(false);
  const [adServer, setAdServer] = useState("ad.factory.lan");
  const [adPort, setAdPort] = useState(636);
  const [adUseTls, setAdUseTls] = useState(true);
  const [adBaseDn, setAdBaseDn] = useState("DC=factory,DC=lan");
  const [adBindDn, setAdBindDn] = useState("CN=svc_6s_auth,OU=Services,DC=factory,DC=lan");
  const [adBindPassword, setAdBindPassword] = useState("");
  const [adTestResult, setAdTestResult] = useState<string | null>(null);

  // Locations management state
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newNameVi, setNewNameVi] = useState("");
  const [newNameZh, setNewNameZh] = useState("");
  const [newNameEn, setNewNameEn] = useState("");
  const [newQr, setNewQr] = useState("");
  const [isAddingLocation, setIsAddingLocation] = useState(false);
  // Edit location state
  const [editingLocation, setEditingLocation] = useState<LocationItem | null>(null);
  const [editNameVi, setEditNameVi] = useState("");
  const [editNameZh, setEditNameZh] = useState("");
  const [editNameEn, setEditNameEn] = useState("");
  const [editQr, setEditQr] = useState("");
  const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);

  // Notification config state
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [notifHasToken, setNotifHasToken] = useState(false);
  const [notifAppToken, setNotifAppToken] = useState("");
  const [notifHasWebhook, setNotifHasWebhook] = useState(false);
  const [notifWebhookUrl, setNotifWebhookUrl] = useState("");
  const [notifBaseUrl, setNotifBaseUrl] = useState("https://6s.factory.lan");
  const [isTestingNotif, setIsTestingNotif] = useState(false);
  const [notifTestResults, setNotifTestResults] = useState<TestNotifyResult[] | null>(null);

  // AI config state
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiBaseUrl, setAiBaseUrl] = useState("");
  const [aiHasApiKey, setAiHasApiKey] = useState(false);
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiDefaultModel, setAiDefaultModel] = useState("");
  const [aiModelTranslate, setAiModelTranslate] = useState("");
  const [aiModelVision, setAiModelVision] = useState("");
  const [aiModelSummary, setAiModelSummary] = useState("");
  const [testingTarget, setTestingTarget] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, AITestResponse>>({});
  const [dnsTestResult, setDnsTestResult] = useState<AIDNSTestResponse | null>(null);

  // Tags management state
  const [tags, setTags] = useState<TagItemData[]>([]);
  const [isLoadingTags, setIsLoadingTags] = useState(false);
  const [tagCode, setTagCode] = useState("");
  const [tagCategory, setTagCategory] = useState<string>(IssueCategory.S1);
  const [tagNameVi, setTagNameVi] = useState("");
  const [tagNameZh, setTagNameZh] = useState("");
  const [tagNameEn, setTagNameEn] = useState("");
  const [isAddingTag, setIsAddingTag] = useState(false);

  useEffect(() => {
    loadLocations();
    loadScoringRules();
    loadADConfig();
    loadNotificationConfig();
    loadTags();
    loadAIConfig();
  }, []);

  const loadLocations = async () => {
    setIsLoadingLocations(true);
    try {
      const data = await apiClient<LocationItem[]>("/api/locations/all");
      setLocations(data || []);
    } catch {
      try {
        const fallback = await apiClient<LocationItem[]>("/api/locations");
        setLocations(fallback || []);
      } catch {
        // keep empty
      }
    } finally {
      setIsLoadingLocations(false);
    }
  };

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim() || !newNameVi.trim()) {
      return;
    }
    setIsAddingLocation(true);
    const qrCodeVal = newQr.trim() || `LOC:${newCode.trim().toUpperCase()}`;
    try {
      const added = await apiClient<LocationItem>("/api/locations", {
        method: "POST",
        body: JSON.stringify({
          code: newCode.trim().toUpperCase(),
          name_vi: newNameVi.trim(),
          name_zh: newNameZh.trim(),
          name_en: newNameEn.trim(),
          qr_code: qrCodeVal,
        }),
      });
      haptics.success();
      setLocations((prev) => [...prev.filter((l) => l.code !== added.code), added]);
      setNewCode("");
      setNewNameVi("");
      setNewNameZh("");
      setNewNameEn("");
      setNewQr("");
      await modalDialog.alert(t("admin.location_add_success"));
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert(t("admin.location_add_error"));
    } finally {
      setIsAddingLocation(false);
    }
  };

  const handleOpenEditLocation = (loc: LocationItem) => {
    setEditingLocation(loc);
    setEditNameVi(loc.name_vi);
    setEditNameZh(loc.name_zh || "");
    setEditNameEn(loc.name_en || "");
    setEditQr(loc.qr_code || `LOC:${loc.code}`);
  };

  const handleSaveEditLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLocation || !editNameVi.trim()) {
      return;
    }
    setIsUpdatingLocation(true);
    const qrCodeVal = editQr.trim() || `LOC:${editingLocation.code}`;
    try {
      const updated = await apiClient<LocationItem>(
        `/api/locations/${encodeURIComponent(editingLocation.code)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            name_vi: editNameVi.trim(),
            name_zh: editNameZh.trim(),
            name_en: editNameEn.trim(),
            qr_code: qrCodeVal,
          }),
        },
      );
      haptics.success();
      setLocations((prev) => prev.map((l) => (l.code === updated.code ? { ...l, ...updated } : l)));
      setEditingLocation(null);
      await modalDialog.alert(t("admin.location_update_success"));
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert(t("admin.location_update_error"));
    } finally {
      setIsUpdatingLocation(false);
    }
  };

  const handleToggleLocation = async (code: string, currentStatus: boolean) => {
    try {
      const updated = await apiClient<LocationItem>(
        `/api/locations/${encodeURIComponent(code)}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ is_active: !currentStatus }),
        },
      );
      haptics.success();
      setLocations((prev) =>
        prev.map((l) => (l.code === code ? { ...l, is_active: updated.is_active } : l)),
      );
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert(t("admin.location_status_error"));
    }
  };

  const loadScoringRules = async () => {
    try {
      const data = await apiClient<ScoringRuleItem[]>("/api/config/scoring");
      const map: Record<string, number> = {};
      for (const item of data) {
        map[item.rule_key] = item.points;
      }
      setRules(map);
    } catch {
      setRules({
        penalty_normal: -3,
        penalty_safety: -20,
        penalty_overdue: -5,
        bonus_kaizen: 10,
        reward_reporter_normal: 2,
        reward_reporter_safety: 5,
        penalty_reporter_invalid: -5,
      });
    }
  };

  const loadADConfig = async () => {
    try {
      const data = await apiClient<{
        is_enabled: boolean;
        server: string;
        port: number;
        use_tls: boolean;
        base_dn: string;
        bind_dn: string;
      }>("/api/config/ad");
      if (data) {
        setAdEnabled(data.is_enabled);
        setAdServer(data.server);
        setAdPort(data.port);
        setAdUseTls(data.use_tls);
        setAdBaseDn(data.base_dn);
        setAdBindDn(data.bind_dn);
      }
    } catch {
      // ignore
    }
  };

  const loadNotificationConfig = async () => {
    try {
      const data = await apiClient<NotificationConfigData>("/api/config/notifications");
      if (data) {
        setNotifEnabled(data.wxpusher_enabled);
        setNotifHasToken(data.has_app_token);
        setNotifHasWebhook(data.has_webhook_url);
        if (data.public_base_url) {
          setNotifBaseUrl(data.public_base_url);
        }
      }
    } catch {
      // ignore
    }
  };
  const loadAIConfig = async () => {
    try {
      const data = await apiClient<AIConfigData>("/api/config/ai");
      if (data) {
        setAiEnabled(data.is_enabled);
        setAiBaseUrl(data.base_url || "");
        setAiHasApiKey(data.has_api_key);
        setAiDefaultModel(data.default_model || "");
        setAiModelTranslate(data.model_translate || "");
        setAiModelVision(data.model_vision || "");
        setAiModelSummary(data.model_summary || "");
      }
    } catch {
      // ignore
    }
  };

  const loadTags = async () => {
    setIsLoadingTags(true);
    try {
      const data = await apiClient<TagItemData[]>("/api/tags/all");
      setTags(data || []);
    } catch {
      try {
        const fallback = await apiClient<TagItemData[]>("/api/tags");
        setTags(fallback || []);
      } catch {
        // ignore
      }
    } finally {
      setIsLoadingTags(false);
    }
  };

  const handleToggleTagStatus = async (code: string, currentStatus: boolean) => {
    try {
      const updated = await apiClient<TagItemData>(`/api/tags/${encodeURIComponent(code)}/status`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !currentStatus }),
      });
      haptics.success();
      setTags((prev) =>
        prev.map((tItem) =>
          tItem.code === code ? { ...tItem, is_active: updated.is_active } : tItem,
        ),
      );
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert(t("admin.tag_status_error"));
    }
  };

  const handleApplyIndustryPack = async (
    packKey: "ALL" | "GARMENT" | "MACHINERY" | "ELECTRONICS",
  ) => {
    const garmentCodes: Record<string, true> = {
      scrap_material: true,
      broken_equipment: true,
      blocked_aisle: true,
      missing_demarcation: true,
      wrong_tool_place: true,
      tangled_cables: true,
      dust_accumulation: true,
      scattered_trash: true,
      oil_leak: true,
      dirty_light_fixtures: true,
      missing_label: true,
      ppe_violation: true,
      safety_gear: true,
      fire_hazard: true,
      exposed_wire: true,
      slippery_floor: true,
    };
    const machineryCodes: Record<string, true> = {
      scrap_material: true,
      unneeded_tools: true,
      expired_chemical: true,
      broken_equipment: true,
      blocked_aisle: true,
      missing_demarcation: true,
      wrong_tool_place: true,
      tangled_cables: true,
      stack_too_high: true,
      oil_leak: true,
      dust_accumulation: true,
      dirty_workstation: true,
      stained_floor: true,
      dirty_electrical_panel: true,
      missing_label: true,
      broken_gauge: true,
      missing_calibration: true,
      sop_noncompliance: true,
      safety_gear: true,
      fire_hazard: true,
      exposed_wire: true,
      slippery_floor: true,
      missing_machine_guard: true,
      chemical_spill: true,
      emergency_stop_fault: true,
      gas_cylinder_unsecured: true,
      forklift_speeding: true,
    };
    const electronicsCodes: Record<string, true> = {
      scrap_material: true,
      unneeded_tools: true,
      stagnant_wip: true,
      excess_inventory: true,
      blocked_aisle: true,
      missing_demarcation: true,
      wrong_tool_place: true,
      tangled_cables: true,
      unlabeled_container: true,
      dust_accumulation: true,
      scattered_trash: true,
      dirty_workstation: true,
      dirty_light_fixtures: true,
      missing_label: true,
      broken_gauge: true,
      missing_calibration: true,
      faded_standard: true,
      ppe_violation: true,
      sop_noncompliance: true,
      safety_gear: true,
      fire_hazard: true,
      exposed_wire: true,
      missing_machine_guard: true,
      chemical_spill: true,
      emergency_stop_fault: true,
      overloaded_socket: true,
    };

    try {
      if (packKey === "ALL") {
        await apiClient("/api/tags/batch-status", {
          method: "POST",
          body: JSON.stringify({ all: true, is_active: true }),
        });
      } else {
        const activeCodes = tags
          .filter((tg) => {
            if (packKey === "GARMENT") return Boolean(garmentCodes[tg.code]);
            if (packKey === "MACHINERY") return Boolean(machineryCodes[tg.code]);
            if (packKey === "ELECTRONICS") return Boolean(electronicsCodes[tg.code]);
            return false;
          })
          .map((tg) => tg.code);

        const inactiveCodes = tags
          .filter((tg) => !activeCodes.includes(tg.code))
          .map((tg) => tg.code);

        await Promise.all([
          apiClient("/api/tags/batch-status", {
            method: "POST",
            body: JSON.stringify({ codes: activeCodes, is_active: true }),
          }),
          apiClient("/api/tags/batch-status", {
            method: "POST",
            body: JSON.stringify({ codes: inactiveCodes, is_active: false }),
          }),
        ]);
      }
    } catch {
      // fallback or error handling
    }

    await loadTags();
    haptics.success();
    modalDialog.alert(t("admin.industry_activated"));
  };

  const handleStepPoint = (ruleKey: string, delta: number) => {
    haptics.success();
    setRules((prev) => ({
      ...prev,
      [ruleKey]: (prev[ruleKey] ?? 0) + delta,
    }));
  };

  const handleSaveScoring = async () => {
    if (isRetroactive && (!applyFrom || !reason.trim())) {
      modalDialog.alert(t("admin.retroactive_required"));
      return;
    }

    setIsSaving(true);
    try {
      await apiClient("/api/config/scoring", {
        method: "PUT",
        body: JSON.stringify({
          rules,
          is_retroactive: isRetroactive,
          apply_from: isRetroactive ? applyFrom : undefined,
          reason: isRetroactive ? reason : undefined,
        }),
      });
      haptics.success();
      await modalDialog.alert(t("admin.save_success"));
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert(t("admin.save_error"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestAD = async () => {
    setAdTestResult(t("admin.testing_connection"));
    try {
      const res = await apiClient<{ success: boolean; message: string }>("/api/config/ad/test", {
        method: "POST",
        body: JSON.stringify({
          server: adServer,
          port: adPort,
          use_tls: adUseTls,
          base_dn: adBaseDn,
          bind_dn: adBindDn,
          bind_password: adBindPassword,
        }),
      });
      setAdTestResult(res.message || "OK");
      haptics.success();
    } catch {
      setAdTestResult(t("admin.connection_failed"));
    }
  };

  const handleSaveAD = async () => {
    setIsSaving(true);
    try {
      await apiClient("/api/config/ad", {
        method: "PUT",
        body: JSON.stringify({
          is_enabled: adEnabled,
          server: adServer,
          port: adPort,
          use_tls: adUseTls,
          base_dn: adBaseDn,
          bind_dn: adBindDn,
          bind_password: adBindPassword || undefined,
        }),
      });
      haptics.success();
      modalDialog.alert(t("admin.save_ad_success"));
    } catch {
      modalDialog.alert(t("admin.save_ad_error"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveNotification = async () => {
    setIsSaving(true);
    try {
      await apiClient("/api/config/notifications", {
        method: "PUT",
        body: JSON.stringify({
          wxpusher_enabled: notifEnabled,
          wxpusher_app_token: notifAppToken.trim() || undefined,
          lan_webhook_url: notifWebhookUrl.trim() || undefined,
          public_base_url: notifBaseUrl.trim(),
        }),
      });
      haptics.success();
      if (notifAppToken.trim()) {
        setNotifHasToken(true);
        setNotifAppToken("");
      }
      if (notifWebhookUrl.trim()) {
        setNotifHasWebhook(true);
        setNotifWebhookUrl("");
      }
      await modalDialog.alert(t("admin.save_notify_success"));
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert(t("admin.save_notify_error"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestNotification = async () => {
    setIsTestingNotif(true);
    setNotifTestResults(null);
    try {
      const results = await apiClient<TestNotifyResult[]>("/api/config/notifications/test", {
        method: "POST",
      });
      setNotifTestResults(results || []);
      haptics.success();
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert(t("admin.test_notify_no_channel"));
    } finally {
      setIsTestingNotif(false);
    }
  };
  const handleSaveAI = async () => {
    setIsSaving(true);
    try {
      await apiClient("/api/config/ai", {
        method: "PUT",
        body: JSON.stringify({
          is_enabled: aiEnabled,
          base_url: aiBaseUrl,
          api_key: aiApiKey,
          default_model: aiDefaultModel,
          model_translate: aiModelTranslate,
          model_vision: aiModelVision,
          model_summary: aiModelSummary,
        }),
      });
      haptics.success();
      setAiApiKey("");
      await loadAIConfig();
      await modalDialog.alert(t("admin.save_ai_success"));
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert(t("admin.save_ai_error"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestAI = async (
    target: "api_key" | "default" | "translate" | "vision" | "summary",
  ) => {
    setTestingTarget(target);
    try {
      let model = "";
      if (target === "default") model = aiDefaultModel;
      else if (target === "translate") model = aiModelTranslate;
      else if (target === "vision") model = aiModelVision;
      else if (target === "summary") model = aiModelSummary;

      const res = await apiClient<AITestResponse>("/api/config/ai/test", {
        method: "POST",
        body: JSON.stringify({
          base_url: aiBaseUrl,
          api_key: aiApiKey,
          model,
          purpose: target === "api_key" ? "default" : target,
        }),
      });
      setTestResults((prev) => ({ ...prev, [target]: res }));
      if (res.success) {
        haptics.success();
      } else {
        haptics.errorOrConflict();
      }
    } catch (err: unknown) {
      haptics.errorOrConflict();
      const msg = err instanceof Error ? err.message : t("admin.ai_test_error");
      setTestResults((prev) => ({ ...prev, [target]: { success: false, error: msg } }));
    } finally {
      setTestingTarget(null);
    }
  };

  const handleTestDNS = async () => {
    setTestingTarget("dns");
    try {
      const res = await apiClient<AIDNSTestResponse>("/api/config/ai/test-dns", {
        method: "POST",
        body: JSON.stringify({
          base_url: aiBaseUrl,
        }),
      });
      setDnsTestResult(res);
      if (res.success) {
        haptics.success();
      } else {
        haptics.errorOrConflict();
      }
    } catch (err: unknown) {
      haptics.errorOrConflict();
      const msg = err instanceof Error ? err.message : t("admin.ai_dns_test_error");
      setDnsTestResult({ success: false, error: msg });
    } finally {
      setTestingTarget(null);
    }
  };

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagCode.trim() || !tagNameVi.trim()) {
      return;
    }
    setIsAddingTag(true);
    try {
      const saved = await apiClient<TagItemData>("/api/tags", {
        method: "POST",
        body: JSON.stringify({
          code: tagCode.trim().toLowerCase(),
          category: tagCategory,
          name_vi: tagNameVi.trim(),
          name_zh: tagNameZh.trim(),
          name_en: tagNameEn.trim(),
          is_preset: false,
        }),
      });
      haptics.success();
      setTags((prev) => [saved, ...prev.filter((tItem) => tItem.code !== saved.code)]);
      setTagCode("");
      setTagNameVi("");
      setTagNameZh("");
      setTagNameEn("");
      await modalDialog.alert(t("admin.tag_add_success"));
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert(t("admin.tag_add_error"));
    } finally {
      setIsAddingTag(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-black text-zinc-900 dark:text-zinc-100 font-sans pb-28">
      {/* Header */}
      <header
        className={`sticky top-0 z-30 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 transition-transform duration-300 ${
          isHeaderVisible ? "translate-y-0" : "-translate-y-full"
        }`}
      >
        <PageContainer className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={() => goBack("/")}
              className="p-2 -ml-2 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center text-lg font-bold"
              aria-label={t("admin.back_to_dashboard")}
            >
              ←
            </button>
            <div className="flex items-center space-x-2">
              <span className="text-xl">⚙️</span>
              <h1 className="text-lg font-black text-zinc-900 dark:text-zinc-100">
                {t("admin.system_admin")}
              </h1>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <NavActions />
          </div>
        </PageContainer>
      </header>

      {/* Main Content */}
      <main className="py-4">
        <PageContainer className="space-y-6">
          {/* Tab Navigation */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 bg-zinc-200 dark:bg-zinc-800 p-1.5 rounded-2xl">
            <button
              type="button"
              onClick={() => setActiveTab("LOCATIONS")}
              className={`py-2.5 px-2 rounded-xl font-bold text-xs min-h-[44px] transition-colors ${
                activeTab === "LOCATIONS"
                  ? "bg-white dark:bg-zinc-900 text-blue-600 shadow-sm"
                  : "text-zinc-600 dark:text-zinc-400"
              }`}
            >
              {t("admin.locations_tab")}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("TAGS");
                loadTags();
              }}
              className={`py-2.5 px-2 rounded-xl font-bold text-xs min-h-[44px] transition-colors ${
                activeTab === "TAGS"
                  ? "bg-white dark:bg-zinc-900 text-blue-600 shadow-sm"
                  : "text-zinc-600 dark:text-zinc-400"
              }`}
            >
              {t("admin.tags_tab")}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("SCORING")}
              className={`py-2.5 px-2 rounded-xl font-bold text-xs min-h-[44px] transition-colors ${
                activeTab === "SCORING"
                  ? "bg-white dark:bg-zinc-900 text-blue-600 shadow-sm"
                  : "text-zinc-600 dark:text-zinc-400"
              }`}
            >
              {t("admin.score_6s_tab")}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("AD")}
              className={`py-2.5 px-2 rounded-xl font-bold text-xs min-h-[44px] transition-colors ${
                activeTab === "AD"
                  ? "bg-white dark:bg-zinc-900 text-blue-600 shadow-sm"
                  : "text-zinc-600 dark:text-zinc-400"
              }`}
            >
              {t("admin.ad_tab")}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("NOTIFICATIONS")}
              className={`py-2.5 px-2 rounded-xl font-bold text-xs min-h-[44px] transition-colors ${
                activeTab === "NOTIFICATIONS"
                  ? "bg-white dark:bg-zinc-900 text-blue-600 shadow-sm"
                  : "text-zinc-600 dark:text-zinc-400"
              }`}
            >
              {t("admin.notify_tab")}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("AI");
                loadAIConfig();
              }}
              className={`py-2.5 px-2 rounded-xl font-bold text-xs min-h-[44px] transition-colors ${
                activeTab === "AI"
                  ? "bg-white dark:bg-zinc-900 text-blue-600 shadow-sm"
                  : "text-zinc-600 dark:text-zinc-400"
              }`}
            >
              {t("admin.ai_tab")}
            </button>
          </div>
          {/* TAB 1: LOCATIONS MANAGEMENT */}
          {activeTab === "LOCATIONS" && (
            <div className="space-y-6">
              <section className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
                <h2 className="text-sm font-black uppercase tracking-wider text-zinc-500">
                  {t("admin.add_location_btn")}
                </h2>
                <form onSubmit={handleAddLocation} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 mb-1">
                        {t("admin.location_code_label")}
                      </label>
                      <input
                        type="text"
                        value={newCode}
                        onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                        placeholder={t("admin.location_code_placeholder")}
                        required
                        className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-bold min-h-[44px]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 mb-1">
                        {t("admin.location_name_vi")}
                      </label>
                      <input
                        type="text"
                        value={newNameVi}
                        onChange={(e) => setNewNameVi(e.target.value)}
                        placeholder={t("admin.location_name_vi_placeholder")}
                        required
                        className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-bold min-h-[44px]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 mb-1">
                        {t("admin.location_name_zh")}
                      </label>
                      <input
                        type="text"
                        value={newNameZh}
                        onChange={(e) => setNewNameZh(e.target.value)}
                        placeholder={t("admin.location_name_zh_placeholder")}
                        className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-bold min-h-[44px]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 mb-1">
                        {t("admin.location_name_en")}
                      </label>
                      <input
                        type="text"
                        value={newNameEn}
                        onChange={(e) => setNewNameEn(e.target.value)}
                        placeholder={t("admin.location_name_en_placeholder")}
                        className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-bold min-h-[44px]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-500 mb-1">
                      {t("admin.location_qr_label")}
                    </label>
                    <input
                      type="text"
                      value={newQr}
                      onChange={(e) => setNewQr(e.target.value)}
                      placeholder={t("admin.location_qr_placeholder")}
                      className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-mono min-h-[44px]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isAddingLocation}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl min-h-[48px] flex items-center justify-center transition-colors shadow-sm disabled:opacity-50"
                  >
                    {isAddingLocation
                      ? t("admin.adding_location_btn")
                      : t("admin.add_location_btn")}
                  </button>
                </form>
              </section>

              {/* List Locations */}
              <section className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-black uppercase tracking-wider text-zinc-500">
                    {t("admin.locations_tab")} ({locations.length})
                  </h2>
                  <button
                    type="button"
                    onClick={loadLocations}
                    className="text-xs font-bold text-blue-600 hover:underline p-1"
                  >
                    🔄
                  </button>
                </div>

                {isLoadingLocations ? (
                  <div className="text-sm text-zinc-400 py-6 text-center">
                    {t("admin.loading_locations")}
                  </div>
                ) : locations.length === 0 ? (
                  <div className="text-sm text-zinc-400 py-6 text-center">
                    {t("admin.empty_locations")}
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {locations.map((loc) => (
                      <div key={loc.code} className="py-3 flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-bold text-sm text-zinc-900 dark:text-zinc-100">
                              {loc.code}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                loc.is_active
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                  : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                              }`}
                            >
                              {loc.is_active
                                ? t("admin.active_status")
                                : t("admin.inactive_status")}
                            </span>
                          </div>
                          <div className="text-xs text-zinc-600 dark:text-zinc-300 font-medium truncate mt-0.5">
                            {loc.name_vi} {loc.name_zh && `• ${loc.name_zh}`}{" "}
                            {loc.name_en && `• ${loc.name_en}`}
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => handleOpenEditLocation(loc)}
                            className="text-xs font-bold px-3 py-2 rounded-xl min-h-[44px] transition-colors border bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700"
                          >
                            ✏️ {t("admin.edit_location_btn")}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleLocation(loc.code, loc.is_active)}
                            className={`text-xs font-bold px-3 py-2 rounded-xl min-h-[44px] transition-colors border ${
                              loc.is_active
                                ? "bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900 hover:bg-rose-100"
                                : "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900 hover:bg-emerald-100"
                            }`}
                          >
                            {loc.is_active ? t("admin.inactive_status") : t("admin.active_status")}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Modal Edit Location */}
              {editingLocation && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
                  <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-2xl w-full max-w-md space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
                      <div>
                        <h3 className="text-base font-black text-zinc-900 dark:text-zinc-100">
                          {t("admin.edit_location_title")}
                        </h3>
                        <p className="text-xs text-zinc-500 font-mono mt-0.5">
                          {editingLocation.code}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingLocation(null)}
                        className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1.5 rounded-lg text-lg"
                      >
                        ✕
                      </button>
                    </div>

                    <form onSubmit={handleSaveEditLocation} className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-zinc-500 mb-1">
                          {t("admin.location_code_label")}
                        </label>
                        <input
                          type="text"
                          value={editingLocation.code}
                          disabled
                          className="w-full bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-mono text-zinc-500 min-h-[44px] cursor-not-allowed"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-zinc-500 mb-1">
                          {t("admin.location_name_vi")}
                        </label>
                        <input
                          type="text"
                          value={editNameVi}
                          onChange={(e) => setEditNameVi(e.target.value)}
                          placeholder={t("admin.location_name_vi_placeholder")}
                          required
                          className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-bold min-h-[44px]"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-zinc-500 mb-1">
                            {t("admin.location_name_zh")}
                          </label>
                          <input
                            type="text"
                            value={editNameZh}
                            onChange={(e) => setEditNameZh(e.target.value)}
                            placeholder={t("admin.location_name_zh_placeholder")}
                            className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-bold min-h-[44px]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-zinc-500 mb-1">
                            {t("admin.location_name_en")}
                          </label>
                          <input
                            type="text"
                            value={editNameEn}
                            onChange={(e) => setEditNameEn(e.target.value)}
                            placeholder={t("admin.location_name_en_placeholder")}
                            className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-bold min-h-[44px]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-zinc-500 mb-1">
                          {t("admin.location_qr_label")}
                        </label>
                        <input
                          type="text"
                          value={editQr}
                          onChange={(e) => setEditQr(e.target.value)}
                          placeholder={t("admin.location_qr_placeholder")}
                          className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-mono min-h-[44px]"
                        />
                      </div>

                      <div className="flex items-center space-x-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setEditingLocation(null)}
                          className="flex-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold py-3 px-4 rounded-xl min-h-[48px] transition-colors"
                        >
                          {t("admin.cancel_edit_btn")}
                        </button>
                        <button
                          type="submit"
                          disabled={isUpdatingLocation}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl min-h-[48px] flex items-center justify-center transition-colors shadow-sm disabled:opacity-50"
                        >
                          {isUpdatingLocation
                            ? t("admin.saving_location_btn")
                            : t("admin.save_location_btn")}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: TAGS MANAGEMENT */}
          {activeTab === "TAGS" && (
            <div className="space-y-6">
              {/* Form Add Tag */}
              <section className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
                <h2 className="text-sm font-black uppercase tracking-wider text-zinc-500">
                  {t("admin.add_tag_btn")}
                </h2>
                <form onSubmit={handleAddTag} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 mb-1">
                        {t("admin.tag_code_label")}
                      </label>
                      <input
                        type="text"
                        value={tagCode}
                        onChange={(e) =>
                          setTagCode(e.target.value.toLowerCase().replace(/\s+/g, "_"))
                        }
                        placeholder={t("admin.tag_code_placeholder")}
                        required
                        className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-mono min-h-[44px]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 mb-1">
                        {t("admin.tag_category_label")}
                      </label>
                      <select
                        value={tagCategory}
                        onChange={(e) => setTagCategory(e.target.value)}
                        className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-bold min-h-[44px]"
                      >
                        {S_CATEGORIES.map((cat) => (
                          <option key={cat.key} value={cat.key}>
                            {cat.key} -{" "}
                            {cat.name_i18n ? resolveI18n(cat.name_i18n, locale) : cat.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 mb-1">
                        {t("admin.tag_name_vi")}
                      </label>
                      <input
                        type="text"
                        value={tagNameVi}
                        onChange={(e) => setTagNameVi(e.target.value)}
                        placeholder={t("admin.tag_name_vi_placeholder")}
                        required
                        className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-bold min-h-[44px]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 mb-1">
                        {t("admin.tag_name_zh")}
                      </label>
                      <input
                        type="text"
                        value={tagNameZh}
                        onChange={(e) => setTagNameZh(e.target.value)}
                        placeholder={t("admin.tag_name_zh_placeholder")}
                        className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-bold min-h-[44px]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 mb-1">
                        {t("admin.tag_name_en")}
                      </label>
                      <input
                        type="text"
                        value={tagNameEn}
                        onChange={(e) => setTagNameEn(e.target.value)}
                        placeholder={t("admin.tag_name_en_placeholder")}
                        className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-bold min-h-[44px]"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isAddingTag}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl min-h-[48px] flex items-center justify-center transition-colors shadow-sm disabled:opacity-50"
                  >
                    {isAddingTag ? t("admin.adding_tag_btn") : t("admin.add_tag_btn")}
                  </button>
                </form>
              </section>

              {/* List Tags with Quick Industry Presets & Status Toggles */}
              <section className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-black uppercase tracking-wider text-zinc-500">
                    {t("admin.tags_tab")} ({tags.length})
                  </h2>
                  <button
                    type="button"
                    onClick={loadTags}
                    className="text-xs font-bold text-blue-600 hover:underline p-1"
                  >
                    🔄
                  </button>
                </div>

                {/* Industry Preset Buttons */}
                <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 space-y-2">
                  <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                    {t("admin.industry_packs_title")}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleApplyIndustryPack("ALL")}
                      className="px-3 py-1.5 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-bold shadow-sm hover:opacity-90 min-h-[36px]"
                    >
                      ✓ {t("admin.industry_all")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyIndustryPack("GARMENT")}
                      className="px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-bold hover:border-blue-500 min-h-[36px]"
                    >
                      🧵 {t("admin.industry_garment")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyIndustryPack("MACHINERY")}
                      className="px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-bold hover:border-blue-500 min-h-[36px]"
                    >
                      ⚙️ {t("admin.industry_machinery")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyIndustryPack("ELECTRONICS")}
                      className="px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-bold hover:border-blue-500 min-h-[36px]"
                    >
                      🔌 {t("admin.industry_electronics")}
                    </button>
                  </div>
                </div>

                {isLoadingTags ? (
                  <div className="text-sm text-zinc-400 py-6 text-center">
                    {t("admin.loading_tags")}
                  </div>
                ) : tags.length === 0 ? (
                  <div className="text-sm text-zinc-400 py-6 text-center">
                    {t("admin.empty_tags")}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {tags.map((tg) => {
                      const isActive = tg.is_active ?? true;
                      return (
                        <div
                          key={tg.code}
                          className={`p-3.5 rounded-2xl border transition-colors flex items-start justify-between gap-3 ${
                            isActive
                              ? "border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40"
                              : "border-zinc-200/50 dark:border-zinc-800/40 bg-zinc-100/50 dark:bg-zinc-900/40 opacity-60"
                          }`}
                        >
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center space-x-2">
                              <span
                                className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                  tg.category === IssueCategory.S6
                                    ? "bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300"
                                    : "bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300"
                                }`}
                              >
                                {tg.category}
                              </span>
                              <span className="font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100">
                                {tg.code}
                              </span>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  isActive
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                    : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                                }`}
                              >
                                {isActive ? t("admin.active_status") : t("admin.inactive_status")}
                              </span>
                            </div>
                            <div className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                              {tg.name_vi}
                            </div>
                            {(tg.name_zh || tg.name_en) && (
                              <div className="text-xs text-zinc-400 font-medium">
                                {tg.name_zh} {tg.name_en && `• ${tg.name_en}`}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleToggleTagStatus(tg.code, isActive)}
                              className={`text-xs font-bold px-3 py-1.5 rounded-xl min-h-[36px] transition-colors border ${
                                isActive
                                  ? "bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900 hover:bg-rose-100"
                                  : "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900 hover:bg-emerald-100"
                              }`}
                            >
                              {isActive ? t("admin.tag_btn_disable") : t("admin.tag_btn_enable")}
                            </button>
                            <span className="text-[10px] font-semibold text-zinc-400">
                              {t("admin.tag_use_count").replace("{count}", String(tg.use_count))}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* TAB 3: SCORING RULES */}
          {activeTab === "SCORING" && (
            <div className="space-y-4">
              <section className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
                <p className="text-xs text-zinc-500">{t("admin.stepper_hint")}</p>

                {Object.keys(rules).map((ruleKey) => (
                  <div
                    key={ruleKey}
                    className="flex items-center justify-between p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 min-h-[56px]"
                  >
                    <div className="font-mono text-xs font-bold text-zinc-800 dark:text-zinc-200">
                      {ruleKey}
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => handleStepPoint(ruleKey, -1)}
                        className="w-10 h-10 rounded-xl bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-black text-lg flex items-center justify-center hover:bg-zinc-300 dark:hover:bg-zinc-600 min-h-[44px] min-w-[44px]"
                      >
                        -
                      </button>
                      <span className="w-12 text-center font-black text-base font-mono">
                        {rules[ruleKey] > 0 ? `+${rules[ruleKey]}` : rules[ruleKey]}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleStepPoint(ruleKey, 1)}
                        className="w-10 h-10 rounded-xl bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-black text-lg flex items-center justify-center hover:bg-zinc-300 dark:hover:bg-zinc-600 min-h-[44px] min-w-[44px]"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </section>

              {/* Retroactive option */}
              <section className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-3xl p-5 space-y-3">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isRetroactive}
                    onChange={(e) => setIsRetroactive(e.target.checked)}
                    className="w-5 h-5 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="font-bold text-sm text-amber-900 dark:text-amber-200">
                    {t("admin.retroactive_label")}
                  </span>
                </label>

                {isRetroactive && (
                  <div className="space-y-3 pt-2">
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 mb-1">
                        {t("admin.apply_from_label")}
                      </label>
                      <input
                        type="date"
                        value={applyFrom}
                        onChange={(e) => setApplyFrom(e.target.value)}
                        className="w-full p-2.5 rounded-xl border bg-white dark:bg-zinc-800 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 mb-1">
                        {t("admin.reason_label")}
                      </label>
                      <input
                        type="text"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder={t("admin.reason_placeholder")}
                        className="w-full p-2.5 rounded-xl border bg-white dark:bg-zinc-800 text-sm"
                      />
                    </div>
                  </div>
                )}
              </section>

              <button
                type="button"
                onClick={handleSaveScoring}
                disabled={isSaving}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 px-6 rounded-2xl min-h-[56px] shadow-lg shadow-blue-600/30 transition-transform active:scale-[0.98]"
              >
                {isSaving ? t("admin.saving_btn") : t("admin.save_config_btn")}
              </button>
            </div>
          )}

          {/* TAB 4: AD/LDAP CONFIG */}
          {activeTab === "AD" && (
            <section className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
              <label className="flex items-center space-x-2 cursor-pointer border-b pb-3 dark:border-zinc-800">
                <input
                  type="checkbox"
                  checked={adEnabled}
                  onChange={(e) => setAdEnabled(e.target.checked)}
                  className="w-5 h-5 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                  {t("admin.enable_ad_label")}
                </span>
              </label>

              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1">
                  {t("admin.server_host_label")}
                </label>
                <input
                  type="text"
                  value={adServer}
                  onChange={(e) => setAdServer(e.target.value)}
                  className="w-full p-2.5 rounded-xl border bg-zinc-50 dark:bg-zinc-800 text-sm font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">
                    {t("admin.port_label")}
                  </label>
                  <input
                    type="number"
                    value={adPort}
                    onChange={(e) => setAdPort(Number(e.target.value))}
                    className="w-full p-2.5 rounded-xl border bg-zinc-50 dark:bg-zinc-800 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">
                    {t("admin.tls_label")}
                  </label>
                  <button
                    type="button"
                    onClick={() => setAdUseTls(!adUseTls)}
                    className={`w-full p-2.5 rounded-xl border text-sm font-bold min-h-[44px] ${
                      adUseTls
                        ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                        : "bg-zinc-100 text-zinc-500"
                    }`}
                  >
                    {adUseTls ? t("admin.on") : t("admin.off")}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1">
                  {t("admin.base_dn_label")}
                </label>
                <input
                  type="text"
                  value={adBaseDn}
                  onChange={(e) => setAdBaseDn(e.target.value)}
                  className="w-full p-2.5 rounded-xl border bg-zinc-50 dark:bg-zinc-800 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1">
                  {t("admin.bind_dn_label")}
                </label>
                <input
                  type="text"
                  value={adBindDn}
                  onChange={(e) => setAdBindDn(e.target.value)}
                  className="w-full p-2.5 rounded-xl border bg-zinc-50 dark:bg-zinc-800 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1">
                  {t("admin.bind_pw_label")}
                </label>
                <input
                  type="password"
                  value={adBindPassword}
                  onChange={(e) => setAdBindPassword(e.target.value)}
                  placeholder={t("admin.bind_pw_placeholder")}
                  className="w-full p-2.5 rounded-xl border bg-zinc-50 dark:bg-zinc-800 text-sm font-mono"
                />
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleTestAD}
                  className="w-full bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 text-zinc-800 dark:text-zinc-200 font-bold py-3 rounded-xl min-h-[44px] text-sm"
                >
                  {t("admin.test_ad_btn")}
                </button>
                {adTestResult && (
                  <div className="text-xs p-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 font-mono text-center">
                    {adTestResult}
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleSaveAD}
                  disabled={isSaving}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 px-6 rounded-2xl min-h-[56px] shadow-lg shadow-blue-600/30 transition-transform active:scale-[0.98] mt-2"
                >
                  {isSaving ? t("admin.saving_btn") : t("admin.save_config_btn")}
                </button>
              </div>
            </section>
          )}

          {/* TAB 5: NOTIFICATIONS CONFIG */}
          {activeTab === "NOTIFICATIONS" && (
            <section className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
              {/* WxPusher Toggle & Token */}
              <label className="flex items-center space-x-2 cursor-pointer border-b pb-3 dark:border-zinc-800">
                <input
                  type="checkbox"
                  checked={notifEnabled}
                  onChange={(e) => setNotifEnabled(e.target.checked)}
                  className="w-5 h-5 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                  {t("admin.wxpusher_enable_label")}
                </span>
              </label>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-zinc-500">
                    {t("admin.wxpusher_token_label")}
                  </label>
                  {notifHasToken && (
                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                      {t("admin.has_token_hint")}
                    </span>
                  )}
                </div>
                <input
                  type="password"
                  value={notifAppToken}
                  onChange={(e) => setNotifAppToken(e.target.value)}
                  placeholder={notifHasToken ? t("admin.wxpusher_token_placeholder") : "AT_..."}
                  className="w-full p-2.5 rounded-xl border bg-zinc-50 dark:bg-zinc-800 text-sm font-mono min-h-[44px]"
                />
              </div>

              {/* LAN Webhook */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-zinc-500">
                    {t("admin.webhook_url_label")}
                  </label>
                  {notifHasWebhook && (
                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                      {t("admin.has_webhook_hint")}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={notifWebhookUrl}
                  onChange={(e) => setNotifWebhookUrl(e.target.value)}
                  placeholder={t("admin.webhook_url_placeholder")}
                  className="w-full p-2.5 rounded-xl border bg-zinc-50 dark:bg-zinc-800 text-sm font-mono min-h-[44px]"
                />
              </div>

              {/* Public Base URL */}
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1">
                  {t("admin.base_url_label")}
                </label>
                <input
                  type="text"
                  value={notifBaseUrl}
                  onChange={(e) => setNotifBaseUrl(e.target.value)}
                  placeholder={t("admin.base_url_placeholder")}
                  className="w-full p-2.5 rounded-xl border bg-zinc-50 dark:bg-zinc-800 text-sm font-mono min-h-[44px]"
                />
              </div>

              {/* Test Ping action */}
              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleTestNotification}
                  disabled={isTestingNotif}
                  className="w-full bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 text-zinc-800 dark:text-zinc-200 font-bold py-3 rounded-xl min-h-[44px] text-sm flex items-center justify-center transition-colors"
                >
                  {isTestingNotif ? t("admin.testing_notify") : t("admin.test_notify_btn")}
                </button>

                {notifTestResults && (
                  <div className="space-y-1.5 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700">
                    {notifTestResults.map((r) => (
                      <div key={r.channel} className="flex items-center justify-between text-xs">
                        <span className="font-mono font-bold">{r.channel}</span>
                        <span
                          className={`font-bold ${
                            r.success ? "text-emerald-600" : "text-rose-600"
                          }`}
                        >
                          {r.success ? "✓ OK" : `✗ ${r.error || "Failed"}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Save button */}
                <button
                  type="button"
                  onClick={handleSaveNotification}
                  disabled={isSaving}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 px-6 rounded-2xl min-h-[56px] shadow-lg shadow-blue-600/30 transition-transform active:scale-[0.98] mt-2"
                >
                  {isSaving ? t("admin.saving_btn") : t("admin.save_config_btn")}
                </button>
              </div>
            </section>
          )}
          {/* TAB 6: AI CONFIG */}
          {activeTab === "AI" && (
            <section className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
              {/* AI Enable Toggle */}
              <label className="flex items-center space-x-2 cursor-pointer border-b pb-3 dark:border-zinc-800">
                <input
                  type="checkbox"
                  checked={aiEnabled}
                  onChange={(e) => setAiEnabled(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-5 h-5"
                />
                <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                  {t("admin.ai_enable_label")}
                </span>
              </label>

              {/* Base URL */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold uppercase text-zinc-500">
                    {t("admin.ai_base_url_label")}
                  </label>
                  <button
                    type="button"
                    onClick={handleTestDNS}
                    disabled={testingTarget !== null}
                    className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800"
                  >
                    {testingTarget === "dns" ? t("admin.ai_testing") : t("admin.ai_test_dns_btn")}
                  </button>
                </div>
                <input
                  type="text"
                  value={aiBaseUrl}
                  onChange={(e) => setAiBaseUrl(e.target.value)}
                  placeholder={t("admin.ai_base_url_placeholder")}
                  className="w-full px-4 py-3 border border-zinc-200 dark:border-zinc-700 rounded-2xl bg-zinc-50 dark:bg-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
                {dnsTestResult && (
                  <div
                    className={`mt-1.5 p-2 rounded-xl text-xs font-medium border ${
                      dnsTestResult.success
                        ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                        : "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
                    }`}
                  >
                    {dnsTestResult.success
                      ? t("admin.ai_dns_test_success", {
                          host: dnsTestResult.host || "",
                          ips: dnsTestResult.ips?.join(", ") || "",
                          ms: String(dnsTestResult.latency_ms || 0),
                        })
                      : `✗ ${dnsTestResult.error}`}
                  </div>
                )}
              </div>

              {/* API Key */}
              <div>
                <label className="block text-xs font-bold uppercase text-zinc-500 mb-1">
                  {t("admin.ai_api_key_label")}
                </label>
                <input
                  type="password"
                  value={aiApiKey}
                  onChange={(e) => setAiApiKey(e.target.value)}
                  placeholder={t("admin.ai_api_key_placeholder")}
                  className="w-full px-4 py-3 border border-zinc-200 dark:border-zinc-700 rounded-2xl bg-zinc-50 dark:bg-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex items-center justify-between mt-1.5">
                  <div>
                    {aiHasApiKey && !aiApiKey && (
                      <p className="text-xs text-emerald-600 font-bold">
                        {t("admin.has_api_key_hint")}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTestAI("api_key")}
                    disabled={testingTarget !== null}
                    className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800 transition-colors"
                  >
                    {testingTarget === "api_key"
                      ? t("admin.ai_testing")
                      : t("admin.ai_test_key_btn")}
                  </button>
                </div>
                {testResults.api_key && (
                  <div
                    className={`mt-2 p-2.5 rounded-xl text-xs font-medium border ${
                      testResults.api_key.success
                        ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                        : "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
                    }`}
                  >
                    {testResults.api_key.success
                      ? t("admin.ai_test_success", {
                          ms: String(testResults.api_key.latency_ms || 0),
                          model: testResults.api_key.model_used || "",
                        })
                      : `✗ ${testResults.api_key.error}`}
                  </div>
                )}
              </div>

              {/* Default Model */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold uppercase text-zinc-500">
                    {t("admin.ai_default_model_label")}
                  </label>
                  <button
                    type="button"
                    onClick={() => handleTestAI("default")}
                    disabled={testingTarget !== null}
                    className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800"
                  >
                    {testingTarget === "default" ? t("admin.ai_testing") : t("admin.ai_test_btn")}
                  </button>
                </div>
                <input
                  type="text"
                  value={aiDefaultModel}
                  onChange={(e) => setAiDefaultModel(e.target.value)}
                  placeholder={t("admin.ai_default_model_placeholder")}
                  className="w-full px-4 py-3 border border-zinc-200 dark:border-zinc-700 rounded-2xl bg-zinc-50 dark:bg-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
                {testResults.default && (
                  <div
                    className={`mt-1.5 p-2 rounded-xl text-xs font-medium border ${
                      testResults.default.success
                        ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                        : "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
                    }`}
                  >
                    {testResults.default.success
                      ? t("admin.ai_test_success", {
                          ms: String(testResults.default.latency_ms || 0),
                          model: testResults.default.model_used || "",
                        })
                      : `✗ ${testResults.default.error}`}
                  </div>
                )}
              </div>

              {/* Purpose-specific models */}
              <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 space-y-3">
                <h3 className="text-xs font-black uppercase text-zinc-400 tracking-wider">
                  {t("admin.ai_specialized_models_title")}
                </h3>

                {/* Translate Model */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold uppercase text-zinc-500">
                      {t("admin.ai_model_translate_label")}
                    </label>
                    <button
                      type="button"
                      onClick={() => handleTestAI("translate")}
                      disabled={testingTarget !== null}
                      className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800"
                    >
                      {testingTarget === "translate"
                        ? t("admin.ai_testing")
                        : t("admin.ai_test_btn")}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={aiModelTranslate}
                    onChange={(e) => setAiModelTranslate(e.target.value)}
                    placeholder={t("admin.ai_model_translate_placeholder")}
                    className="w-full px-4 py-3 border border-zinc-200 dark:border-zinc-700 rounded-2xl bg-zinc-50 dark:bg-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                  {testResults.translate && (
                    <div
                      className={`mt-1.5 p-2 rounded-xl text-xs font-medium border ${
                        testResults.translate.success
                          ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                          : "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
                      }`}
                    >
                      {testResults.translate.success
                        ? t("admin.ai_test_success", {
                            ms: String(testResults.translate.latency_ms || 0),
                            model: testResults.translate.model_used || "",
                          })
                        : `✗ ${testResults.translate.error}`}
                    </div>
                  )}
                </div>

                {/* Vision Model */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold uppercase text-zinc-500">
                      {t("admin.ai_model_vision_label")}
                    </label>
                    <button
                      type="button"
                      onClick={() => handleTestAI("vision")}
                      disabled={testingTarget !== null}
                      className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800"
                    >
                      {testingTarget === "vision" ? t("admin.ai_testing") : t("admin.ai_test_btn")}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={aiModelVision}
                    onChange={(e) => setAiModelVision(e.target.value)}
                    placeholder={t("admin.ai_model_vision_placeholder")}
                    className="w-full px-4 py-3 border border-zinc-200 dark:border-zinc-700 rounded-2xl bg-zinc-50 dark:bg-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                  {testResults.vision && (
                    <div
                      className={`mt-1.5 p-2 rounded-xl text-xs font-medium border ${
                        testResults.vision.success
                          ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                          : "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
                      }`}
                    >
                      {testResults.vision.success
                        ? t("admin.ai_test_success", {
                            ms: String(testResults.vision.latency_ms || 0),
                            model: testResults.vision.model_used || "",
                          })
                        : `✗ ${testResults.vision.error}`}
                    </div>
                  )}
                </div>

                {/* Summary Model */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold uppercase text-zinc-500">
                      {t("admin.ai_model_summary_label")}
                    </label>
                    <button
                      type="button"
                      onClick={() => handleTestAI("summary")}
                      disabled={testingTarget !== null}
                      className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800"
                    >
                      {testingTarget === "summary" ? t("admin.ai_testing") : t("admin.ai_test_btn")}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={aiModelSummary}
                    onChange={(e) => setAiModelSummary(e.target.value)}
                    placeholder={t("admin.ai_model_summary_placeholder")}
                    className="w-full px-4 py-3 border border-zinc-200 dark:border-zinc-700 rounded-2xl bg-zinc-50 dark:bg-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                  {testResults.summary && (
                    <div
                      className={`mt-1.5 p-2 rounded-xl text-xs font-medium border ${
                        testResults.summary.success
                          ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                          : "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
                      }`}
                    >
                      {testResults.summary.success
                        ? t("admin.ai_test_success", {
                            ms: String(testResults.summary.latency_ms || 0),
                            model: testResults.summary.model_used || "",
                          })
                        : `✗ ${testResults.summary.error}`}
                    </div>
                  )}
                </div>
              </div>

              {/* Save Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleSaveAI}
                  disabled={isSaving}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 px-6 rounded-2xl min-h-[56px] shadow-lg shadow-blue-600/30 transition-transform active:scale-[0.98] mt-2"
                >
                  {isSaving ? t("admin.saving_btn") : t("admin.save_config_btn")}
                </button>
              </div>
            </section>
          )}
        </PageContainer>
      </main>
    </div>
  );
}
