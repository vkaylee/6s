import { useEffect, useState } from "react";
import { apiClient } from "../api/client.ts";
import { PageContainer } from "../components/PageContainer.tsx";
import { type SupportedLocale, useI18nStore } from "../i18n/index.ts";
import { modalDialog } from "../store/dialogStore.ts";
import { IssueCategory, resolveI18n, S_CATEGORIES } from "../types/index.ts";
import { haptics } from "../utils/haptics.ts";
import { goBack } from "../utils/navigation.ts";

type TagLocale = SupportedLocale;
type TagItemData = {
  code: string;
  name_vi: string;
  name_zh?: string;
  name_en?: string;
  category: string;
  use_count: number;
  is_preset?: boolean;
  is_active?: boolean;
};
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
      "overloaded_socket",
    ].map((code) => [code, true]),
  ),
};
function TagCard({
  tag,
  compact = false,
  showToggle = false,
  onToggle,
}: {
  tag: TagItemData;
  compact?: boolean;
  showToggle?: boolean;
  onToggle?: (code: string, active: boolean) => void;
}) {
  const { t } = useI18nStore();
  const active = tag.is_active ?? true;
  return (
    <div
      className={`p-3.5 rounded-2xl border flex items-start justify-between gap-3 ${
        active
          ? "border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40"
          : "border-zinc-200/50 dark:border-zinc-800/40 bg-zinc-100/50 dark:bg-zinc-900/40 opacity-60"
      }`}
    >
      <div className="space-y-1 flex-1 min-w-0">
        <div className="flex items-center flex-wrap gap-2">
          <span
            className={`text-[10px] font-black px-2 py-0.5 rounded-full ${tag.category === IssueCategory.S6 ? "bg-rose-100 text-rose-800" : "bg-blue-100 text-blue-800"}`}
          >
            {tag.category}
          </span>
          <span className="font-mono text-xs font-bold">{tag.code}</span>
          {!compact && (
            <span className="text-[10px] font-bold">
              {active ? t("admin.active_status") : t("admin.inactive_status")}
            </span>
          )}
        </div>
        <div className="text-sm font-bold">{tag.name_vi}</div>
        {(tag.name_zh || tag.name_en) && (
          <div className="text-xs text-zinc-400">
            {tag.name_zh} {tag.name_en && `• ${tag.name_en}`}
          </div>
        )}
        {!compact && (
          <div className="text-[10px] font-semibold text-zinc-400">
            {t("admin.tag_use_count").replace("{count}", String(tag.use_count))}
          </div>
        )}
      </div>
      {showToggle && onToggle && (
        <button
          type="button"
          onClick={() => onToggle(tag.code, active)}
          className="text-xs font-bold px-3 py-1.5 rounded-xl min-h-[44px] border shrink-0"
        >
          {active ? t("admin.tag_btn_disable") : t("admin.tag_btn_enable")}
        </button>
      )}
    </div>
  );
}

// ─── Create Tag Modal ────────────────────────────────────────────────────────

function normalizeCode(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

// ─── Create Tag Modal ────────────────────────────────────────────────────────

interface CreateTagModalProps {
  initialInput: string;
  initialCode: string;
  onClose: () => void;
  onCreated: (tag: TagItemData) => void;
}

function CreateTagModal({ initialInput, initialCode, onClose, onCreated }: CreateTagModalProps) {
  const { t, locale } = useI18nStore();
  const source = locale as TagLocale;

  const [code, setCode] = useState(initialCode);
  const [category, setCategory] = useState<string>(IssueCategory.S1);
  const [names, setNames] = useState<Record<TagLocale, string> | null>(null);
  const [editable, setEditable] = useState<Partial<Record<TagLocale, boolean>>>({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiFailed, setAiFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const translateNames = async () => {
    const text = initialInput.trim();
    if (!text) return;
    setAiLoading(true);
    setAiFailed(false);
    try {
      const targets = (["vi", "en", "zh"] as TagLocale[]).filter((lang) => lang !== source);
      const translated = await Promise.all(
        targets.map(
          async (targetLang) =>
            [
              targetLang,
              (
                await apiClient<{ translated_text: string }>("/api/ai/translate", {
                  method: "POST",
                  body: JSON.stringify({ text, target_lang: targetLang }),
                })
              ).translated_text,
            ] as const,
        ),
      );
      const pick = (lang: TagLocale) =>
        lang === source ? text : (translated.find(([l]) => l === lang)?.[1] ?? "");
      setNames({ vi: pick("vi"), en: pick("en"), zh: pick("zh") });
      setEditable({});
    } catch {
      setAiFailed(true);
      setNames({
        vi: source === "vi" ? text : "",
        en: source === "en" ? text : "",
        zh: source === "zh" ? text : "",
      });
      setEditable({ vi: true, en: true, zh: true });
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    void translateNames();
  }, []);

  const editName = async (lang: TagLocale) => {
    if (editable[lang] || aiFailed) return;
    if (await modalDialog.confirm(t("admin.tag_ai_edit_confirm")))
      setEditable((prev) => ({ ...prev, [lang]: true }));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!code.trim() || !names?.vi.trim() || !names.en.trim() || !names.zh.trim()) return;
    setSaving(true);
    try {
      const saved = await apiClient<TagItemData>("/api/tags", {
        method: "POST",
        body: JSON.stringify({
          code: code.trim().toLowerCase(),
          category,
          name_vi: names.vi.trim(),
          name_zh: names.zh.trim(),
          name_en: names.en.trim(),
          is_preset: false,
        }),
      });
      haptics.success();
      onCreated(saved);
      await modalDialog.alert(t("admin.tag_add_success"), t("common.success"));
    } catch {
      haptics.errorOrConflict();
      await modalDialog.alert(t("admin.tag_add_error"));
    } finally {
      setSaving(false);
    }
  };

  const nameField = (lang: TagLocale, label: string) => (
    <div>
      <label htmlFor={`modal-name-${lang}`} className="block text-xs font-bold text-zinc-500 mb-1">
        {label}
        {!editable[lang] && !aiFailed && names && <span className="ml-1 text-blue-500">· AI</span>}
      </label>
      <input
        id={`modal-name-${lang}`}
        value={names?.[lang] ?? ""}
        readOnly={!editable[lang] && !aiFailed}
        onClick={() => editName(lang)}
        onChange={(e) => setNames((prev) => (prev ? { ...prev, [lang]: e.target.value } : prev))}
        required
        className={`w-full bg-zinc-50 dark:bg-zinc-800 border rounded-xl p-3 text-sm font-bold min-h-[44px] ${!editable[lang] && !aiFailed && names ? "border-blue-200 dark:border-blue-800 cursor-pointer" : "border-zinc-200 dark:border-zinc-700"}`}
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl max-h-[90dvh] overflow-y-auto">
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black">{t("admin.tag_create_modal_title")}</h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 min-h-[44px] min-w-[44px]"
              aria-label={t("common.cancel")}
            >
              ✕
            </button>
          </div>

          {/* Source name */}
          <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-800 px-4 py-3">
            <div className="text-xs font-bold text-zinc-400 mb-1">
              {t(`admin.tag_name_${source}`)}
            </div>
            <div className="text-sm font-bold">{initialInput}</div>
          </div>
          <form onSubmit={handleSave} className="space-y-3">
            {/* Code + Category */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="modal-tag-code"
                  className="block text-xs font-bold text-zinc-500 mb-1"
                >
                  {t("admin.tag_code_label")}
                </label>
                <input
                  id="modal-tag-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
                  placeholder={t("admin.tag_code_placeholder")}
                  required
                  className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-mono min-h-[44px]"
                />
              </div>
              <div>
                <label
                  htmlFor="modal-tag-category"
                  className="block text-xs font-bold text-zinc-500 mb-1"
                >
                  {t("admin.tag_category_label")}
                </label>
                <select
                  id="modal-tag-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
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

            {/* Translations */}
            {!names && !aiLoading && (
              <button
                type="button"
                onClick={translateNames}
                className="w-full border border-blue-600 text-blue-600 font-bold py-3 px-4 rounded-xl min-h-[48px]"
              >
                {t("admin.tag_translate_btn")}
              </button>
            )}
            {aiLoading && (
              <div className="text-sm text-zinc-500 text-center py-2">
                {t("admin.tag_ai_translating")}
              </div>
            )}
            {names && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                    {t("admin.tag_translations_label")}
                  </span>
                  <button
                    type="button"
                    onClick={translateNames}
                    disabled={aiLoading}
                    className="text-xs font-bold text-blue-600 hover:underline disabled:opacity-40"
                  >
                    {t("admin.tag_retranslate_btn")}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {nameField("vi", t("admin.tag_name_vi"))}
                  {nameField("zh", t("admin.tag_name_zh"))}
                  {nameField("en", t("admin.tag_name_en"))}
                </div>
              </div>
            )}
            {aiFailed && (
              <div className="text-sm text-amber-700 dark:text-amber-400">
                {t("admin.tag_manual_fallback")}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold py-3 px-4 rounded-xl min-h-[48px]"
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={saving || aiLoading || !names}
                className="flex-1 bg-blue-600 text-white font-bold py-3 px-4 rounded-xl min-h-[48px] disabled:opacity-50"
              >
                {saving ? t("admin.adding_tag_btn") : t("admin.tag_save_btn")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function IssueTagsPage() {
  const { t, locale } = useI18nStore();
  const source = locale as TagLocale;

  const [tags, setTags] = useState<TagItemData[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [similarTags, setSimilarTags] = useState<TagItemData[]>([]);
  const [suggestedCode, setSuggestedCode] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const loadTags = async () => {
    setLoading(true);
    try {
      setTags((await apiClient<TagItemData[]>("/api/tags/all")) || []);
    } catch {
      try {
        setTags((await apiClient<TagItemData[]>("/api/tags")) || []);
      } catch {
        /* keep current */
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTags();
  }, []);

  useEffect(() => {
    const text = input.trim();
    const timer = window.setTimeout(() => {
      if (!text) {
        setSimilarTags([]);
        setSuggestedCode("");
        return;
      }
      const normalized = text.toLocaleLowerCase();
      setSimilarTags(
        tags.filter((tag) =>
          [tag.name_vi, tag.name_en, tag.name_zh].some((name) => {
            if (!name) return false;
            const n = name.toLocaleLowerCase();
            return n.includes(normalized) || normalized.includes(n);
          }),
        ),
      );
      setSuggestedCode(normalizeCode(text));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [input, tags]);

  const toggleStatus = async (tagCode: string, active: boolean) => {
    try {
      const updated = await apiClient<TagItemData>(
        `/api/tags/${encodeURIComponent(tagCode)}/status`,
        { method: "PATCH", body: JSON.stringify({ is_active: !active }) },
      );
      haptics.success();
      setTags((prev) =>
        prev.map((item) =>
          item.code === tagCode ? { ...item, is_active: updated.is_active } : item,
        ),
      );
    } catch {
      haptics.errorOrConflict();
      await modalDialog.alert(t("admin.tag_status_error"));
    }
  };

  const applyPack = async (pack: PackKey) => {
    try {
      if (pack === "ALL") {
        await apiClient("/api/tags/batch-status", {
          method: "POST",
          body: JSON.stringify({ all: true, is_active: true }),
        });
      } else {
        const active = tags.filter((item) => PACKS[pack][item.code]).map((item) => item.code);
        const inactive = tags
          .filter((item) => !active.includes(item.code))
          .map((item) => item.code);
        await Promise.all([
          apiClient("/api/tags/batch-status", {
            method: "POST",
            body: JSON.stringify({ codes: active, is_active: true }),
          }),
          apiClient("/api/tags/batch-status", {
            method: "POST",
            body: JSON.stringify({ codes: inactive, is_active: false }),
          }),
        ]);
      }
    } catch {
      /* refresh reflects server state */
    }
    await loadTags();
    haptics.success();
    await modalDialog.alert(t("admin.industry_activated"));
  };

  const handleCreated = (tag: TagItemData) => {
    setTags((prev) => [tag, ...prev.filter((item) => item.code !== tag.code)]);
    setModalOpen(false);
    setInput("");
    setSimilarTags([]);
    setSuggestedCode("");
  };

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-black text-zinc-900 dark:text-zinc-100 font-sans pb-28">
      <PageContainer className="pt-4">
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => goBack()}
            aria-label={t("common.back")}
            className="p-2 -ml-2 rounded-xl min-h-[44px] min-w-[44px]"
          >
            ←
          </button>
          <h1 className="text-base font-black">{t("admin.tags_tab")}</h1>
        </div>
      </PageContainer>

      <PageContainer className="py-4 space-y-6">
        {/* Search + Create section */}
        <section className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
          <h2 className="text-sm font-black uppercase tracking-wider text-zinc-500">
            {t("admin.tag_search_title")}
          </h2>
          <div>
            <label
              htmlFor="tag-search-input"
              className="block text-xs font-bold text-zinc-500 mb-1"
            >
              {t(`admin.tag_name_${source}`)}
            </label>
            <input
              id="tag-search-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t(`admin.tag_name_${source}_placeholder`)}
              className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-bold min-h-[44px]"
            />
          </div>

          {/* Similarity result — always show when user has typed */}
          {input.trim() && (
            <div className="space-y-2">
              {similarTags.length === 0 ? (
                <div className="text-sm text-zinc-400 italic">{t("admin.tag_no_similar")}</div>
              ) : (
                <div className="space-y-1">
                  <div className="text-xs font-bold text-amber-700 dark:text-amber-400">
                    {t("admin.tag_similar_found")}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {similarTags.map((tag) => (
                      <TagCard key={tag.code} tag={tag} compact />
                    ))}
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl min-h-[48px]"
              >
                {t("admin.add_tag_btn")}
              </button>
            </div>
          )}
        </section>

        {/* Tag list section */}
        <section className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-wider text-zinc-500">
              {t("admin.tags_tab")} ({tags.length})
            </h2>
            <button
              type="button"
              onClick={loadTags}
              className="text-xs font-bold text-blue-600 p-1"
            >
              ↻
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
                  onClick={() => applyPack(key)}
                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-bold hover:border-blue-500 min-h-[36px]"
                >
                  {icon} {t(`admin.${label}`)}
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <div className="text-sm text-zinc-400 py-6 text-center">{t("admin.loading_tags")}</div>
          ) : tags.length === 0 ? (
            <div className="text-sm text-zinc-400 py-6 text-center">{t("admin.empty_tags")}</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {tags.map((tag) => (
                <TagCard key={tag.code} tag={tag} showToggle onToggle={toggleStatus} />
              ))}
            </div>
          )}
        </section>
      </PageContainer>

      {modalOpen && (
        <CreateTagModal
          initialInput={input}
          initialCode={suggestedCode}
          onClose={() => setModalOpen(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
