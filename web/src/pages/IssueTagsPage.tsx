import { useEffect, useState } from "react";
import { apiClient } from "../api/client.ts";
import { PageContainer } from "../components/PageContainer.tsx";
import { useI18nStore } from "../i18n/index.ts";
import { modalDialog } from "../store/dialogStore.ts";
import { IssueCategory, resolveI18n, S_CATEGORIES } from "../types/index.ts";
import { haptics } from "../utils/haptics.ts";
import { goBack } from "../utils/navigation.ts";

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

type PackKey = "ALL" | "GARMENT" | "MACHINERY" | "ELECTRONICS";

const PACKS: Record<Exclude<PackKey, "ALL">, Record<string, true>> = {
  GARMENT: Object.fromEntries(
    [
      "scrap_material",
      "broken_equipment",
      "blocked_aisle",
      "missing_demarcation",
      "wrong_tool_place",
      "tangled_cables",
      "dust_accumulation",
      "scattered_trash",
      "oil_leak",
      "dirty_light_fixtures",
      "missing_label",
      "ppe_violation",
      "safety_gear",
      "fire_hazard",
      "exposed_wire",
      "slippery_floor",
    ].map((code) => [code, true]),
  ),
  MACHINERY: Object.fromEntries(
    [
      "scrap_material",
      "unneeded_tools",
      "expired_chemical",
      "broken_equipment",
      "blocked_aisle",
      "missing_demarcation",
      "wrong_tool_place",
      "tangled_cables",
      "stack_too_high",
      "oil_leak",
      "dust_accumulation",
      "dirty_workstation",
      "stained_floor",
      "dirty_electrical_panel",
      "missing_label",
      "broken_gauge",
      "missing_calibration",
      "sop_noncompliance",
      "safety_gear",
      "fire_hazard",
      "exposed_wire",
      "slippery_floor",
      "missing_machine_guard",
      "chemical_spill",
      "emergency_stop_fault",
      "gas_cylinder_unsecured",
      "forklift_speeding",
    ].map((code) => [code, true]),
  ),
  ELECTRONICS: Object.fromEntries(
    [
      "scrap_material",
      "unneeded_tools",
      "stagnant_wip",
      "excess_inventory",
      "blocked_aisle",
      "missing_demarcation",
      "wrong_tool_place",
      "tangled_cables",
      "unlabeled_container",
      "dust_accumulation",
      "scattered_trash",
      "dirty_workstation",
      "dirty_light_fixtures",
      "missing_label",
      "broken_gauge",
      "missing_calibration",
      "faded_standard",
      "ppe_violation",
      "sop_noncompliance",
      "safety_gear",
      "fire_hazard",
      "exposed_wire",
      "missing_machine_guard",
      "chemical_spill",
      "emergency_stop_fault",
      "overloaded_socket",
    ].map((code) => [code, true]),
  ),
};

export function IssueTagsPage() {
  const { t, locale } = useI18nStore();
  const [tags, setTags] = useState<TagItemData[]>([]);
  const [isLoadingTags, setIsLoadingTags] = useState(false);
  const [tagCode, setTagCode] = useState("");
  const [tagCategory, setTagCategory] = useState<string>(IssueCategory.S1);
  const [tagNameVi, setTagNameVi] = useState("");
  const [tagNameZh, setTagNameZh] = useState("");
  const [tagNameEn, setTagNameEn] = useState("");
  const [isAddingTag, setIsAddingTag] = useState(false);

  useEffect(() => {
    loadTags();
  }, []);

  const loadTags = async () => {
    setIsLoadingTags(true);
    try {
      setTags((await apiClient<TagItemData[]>("/api/tags/all")) || []);
    } catch {
      try {
        setTags((await apiClient<TagItemData[]>("/api/tags")) || []);
      } catch {
        // keep empty
      }
    } finally {
      setIsLoadingTags(false);
    }
  };

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagCode.trim() || !tagNameVi.trim()) return;
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
      setTags((prev) => [saved, ...prev.filter((item) => item.code !== saved.code)]);
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

  const handleToggleTagStatus = async (code: string, currentStatus: boolean) => {
    try {
      const updated = await apiClient<TagItemData>(`/api/tags/${encodeURIComponent(code)}/status`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !currentStatus }),
      });
      haptics.success();
      setTags((prev) =>
        prev.map((item) => (item.code === code ? { ...item, is_active: updated.is_active } : item)),
      );
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert(t("admin.tag_status_error"));
    }
  };

  const handleApplyIndustryPack = async (packKey: PackKey) => {
    try {
      if (packKey === "ALL") {
        await apiClient("/api/tags/batch-status", {
          method: "POST",
          body: JSON.stringify({ all: true, is_active: true }),
        });
      } else {
        const activeCodes = tags
          .filter((item) => PACKS[packKey][item.code])
          .map((item) => item.code);
        const inactiveCodes = tags
          .filter((item) => !activeCodes.includes(item.code))
          .map((item) => item.code);
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
      // keep existing state; refresh below
    }
    await loadTags();
    haptics.success();
    modalDialog.alert(t("admin.industry_activated"));
  };

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-black text-zinc-900 dark:text-zinc-100 font-sans pb-28">
      {/* Page Heading */}
      <PageContainer className="pt-4">
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => goBack()}
            aria-label={t("common.back")}
            className="p-2 -ml-2 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-blue-600 min-h-[44px] min-w-[44px]"
          >
            ←
          </button>
          <h1 className="text-base font-black">{t("admin.tags_tab")}</h1>
        </div>
      </PageContainer>
      <PageContainer className="py-4 space-y-6">
        <section className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
          <h2 className="text-sm font-black uppercase tracking-wider text-zinc-500">
            {t("admin.add_tag_btn")}
          </h2>
          <form onSubmit={handleAddTag} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="tag-code" className="block text-xs font-bold text-zinc-500 mb-1">
                  {t("admin.tag_code_label")}
                </label>
                <input
                  id="tag-code"
                  type="text"
                  value={tagCode}
                  onChange={(e) => setTagCode(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
                  placeholder={t("admin.tag_code_placeholder")}
                  required
                  className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-mono min-h-[44px]"
                />
              </div>
              <div>
                <label
                  htmlFor="tag-category"
                  className="block text-xs font-bold text-zinc-500 mb-1"
                >
                  {t("admin.tag_category_label")}
                </label>
                <select
                  id="tag-category"
                  value={tagCategory}
                  onChange={(e) => setTagCategory(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-bold min-h-[44px]"
                >
                  {S_CATEGORIES.map((cat) => (
                    <option key={cat.key} value={cat.key}>
                      {cat.key} - {cat.name_i18n ? resolveI18n(cat.name_i18n, locale) : cat.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(
                [
                  ["tagNameVi", tagNameVi, setTagNameVi, "tag_name_vi", "tag_name_vi_placeholder"],
                  ["tagNameZh", tagNameZh, setTagNameZh, "tag_name_zh", "tag_name_zh_placeholder"],
                  ["tagNameEn", tagNameEn, setTagNameEn, "tag_name_en", "tag_name_en_placeholder"],
                ] as const
              ).map(([id, value, setter, label, placeholder]) => (
                <div key={id}>
                  <label htmlFor={id} className="block text-xs font-bold text-zinc-500 mb-1">
                    {t(`admin.${label}`)}
                  </label>
                  <input
                    id={id}
                    type="text"
                    value={value}
                    onChange={(e) => setter(e.target.value)}
                    placeholder={t(`admin.${placeholder}`)}
                    required={id === "tagNameVi"}
                    className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-bold min-h-[44px]"
                  />
                </div>
              ))}
            </div>
            <button
              type="submit"
              disabled={isAddingTag}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl min-h-[48px] disabled:opacity-50"
            >
              {isAddingTag ? t("admin.adding_tag_btn") : t("admin.add_tag_btn")}
            </button>
          </form>
        </section>
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
          <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 space-y-2">
            <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
              {t("admin.industry_packs_title")}
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["ALL", "industry_all", "✓"],
                  ["GARMENT", "industry_garment", "🧵"],
                  ["MACHINERY", "industry_machinery", "⚙️"],
                  ["ELECTRONICS", "industry_electronics", "🔌"],
                ] as const
              ).map(([key, label, icon]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleApplyIndustryPack(key)}
                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-bold hover:border-blue-500 min-h-[36px]"
                >
                  {icon} {t(`admin.${label}`)}
                </button>
              ))}
            </div>
          </div>
          {isLoadingTags ? (
            <div className="text-sm text-zinc-400 py-6 text-center">{t("admin.loading_tags")}</div>
          ) : tags.length === 0 ? (
            <div className="text-sm text-zinc-400 py-6 text-center">{t("admin.empty_tags")}</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {tags.map((tg) => {
                const isActive = tg.is_active ?? true;
                return (
                  <div
                    key={tg.code}
                    className={`p-3.5 rounded-2xl border flex items-start justify-between gap-3 ${isActive ? "border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40" : "border-zinc-200/50 dark:border-zinc-800/40 bg-zinc-100/50 dark:bg-zinc-900/40 opacity-60"}`}
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center space-x-2">
                        <span
                          className={`text-[10px] font-black px-2 py-0.5 rounded-full ${tg.category === IssueCategory.S6 ? "bg-rose-100 text-rose-800" : "bg-blue-100 text-blue-800"}`}
                        >
                          {tg.category}
                        </span>
                        <span className="font-mono text-xs font-bold">{tg.code}</span>
                        <span className="text-[10px] font-bold">
                          {isActive ? t("admin.active_status") : t("admin.inactive_status")}
                        </span>
                      </div>
                      <div className="text-sm font-bold">{tg.name_vi}</div>
                      {(tg.name_zh || tg.name_en) && (
                        <div className="text-xs text-zinc-400">
                          {tg.name_zh} {tg.name_en && `• ${tg.name_en}`}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleTagStatus(tg.code, isActive)}
                        className="text-xs font-bold px-3 py-1.5 rounded-xl min-h-[36px] border"
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
      </PageContainer>
    </div>
  );
}
