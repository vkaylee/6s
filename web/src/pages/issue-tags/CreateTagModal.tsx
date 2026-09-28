import { useEffect, useState } from "react";
import { apiClient } from "../../api/client.ts";
import { createTag } from "../../api/operations.ts";
import { useAiStatus } from "../../hooks/useAiStatus.ts";
import { type SupportedLocale, useI18nStore } from "../../i18n/index.ts";
import { modalDialog } from "../../store/dialogStore.ts";
import { IssueCategory, resolveI18n, S_CATEGORIES, type TagItem } from "../../types/index.ts";
import { haptics } from "../../utils/haptics.ts";

export type TagLocale = SupportedLocale;

export function normalizeCode(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export interface CreateTagModalProps {
  initialInput: string;
  initialCode: string;
  editingTag?: TagItem;
  onClose: () => void;
  onCreated: (tag: TagItem) => void;
}

export function CreateTagModal({
  initialInput,
  initialCode,
  editingTag,
  onClose,
  onCreated,
}: CreateTagModalProps) {
  const { t, locale } = useI18nStore();
  const source = locale as TagLocale;

  const [code, setCode] = useState(editingTag?.code ?? initialCode);
  const [category, setCategory] = useState<string>(editingTag?.category ?? IssueCategory.S1);
  const [names, setNames] = useState<Record<TagLocale, string> | null>(
    editingTag
      ? {
          vi: editingTag.name_vi || editingTag.label_vi || "",
          zh: editingTag.name_zh || editingTag.label_zh || "",
          en: editingTag.name_en || editingTag.label_en || "",
        }
      : null,
  );
  const [editable, setEditable] = useState<Partial<Record<TagLocale, boolean>>>(
    editingTag ? { vi: true, zh: true, en: true } : {},
  );
  const [aiLoading, setAiLoading] = useState(false);
  const [aiFailed, setAiFailed] = useState(false);
  const aiEnabled = useAiStatus();
  const [saving, setSaving] = useState(false);

  const translateNames = async () => {
    if (aiEnabled !== true) return;
    const text = initialInput.trim();
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
    if (editingTag || aiEnabled === null) return;
    if (aiEnabled) {
      void translateNames();
      return;
    }
    // AI off: seed source language and let user type remaining names.
    const text = initialInput.trim();
    setNames({
      vi: source === "vi" ? text : "",
      en: source === "en" ? text : "",
      zh: source === "zh" ? text : "",
    });
    setEditable({ vi: true, en: true, zh: true });
  }, [editingTag, aiEnabled, initialInput, source]);

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
      const saved = await createTag({
        code: code.trim().toLowerCase(),
        category: category as "1S" | "2S" | "3S" | "4S" | "5S" | "6S",
        name_vi: names.vi.trim(),
        name_zh: names.zh.trim(),
        name_en: names.en.trim(),
      });
      haptics.success();
      onCreated(saved);
      await modalDialog.success(
        t(editingTag ? "admin.tag_update_success" : "admin.tag_add_success"),
      );
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
            <h2 className="text-base font-black">
              {t(editingTag ? "admin.tag_edit_modal_title" : "admin.tag_create_modal_title")}
            </h2>
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
          {!editingTag && (
            <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-800 px-4 py-3">
              <div className="text-xs font-bold text-zinc-400 mb-1">
                {t(`admin.tag_name_${source}`)}
              </div>
              <div className="text-sm font-bold">{initialInput}</div>
            </div>
          )}
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
                  readOnly={Boolean(editingTag)}
                  onChange={(e) => setCode(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
                  placeholder={t("admin.tag_code_placeholder")}
                  required
                  className={`w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm font-mono min-h-[44px] ${editingTag ? "opacity-75 cursor-not-allowed" : ""}`}
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
            {!editingTag && aiEnabled !== false && (
              <button
                type="button"
                onClick={translateNames}
                disabled={aiEnabled !== true || aiLoading}
                aria-disabled={aiEnabled !== true}
                className="w-full border border-blue-600 text-blue-600 font-bold py-3 px-4 rounded-xl min-h-[48px] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t("admin.tag_translate_btn")}
              </button>
            )}
            {aiEnabled === false && (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                {t("admin.ai_disabled_reason")}
              </p>
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
                  {aiEnabled !== false && (
                    <button
                      type="button"
                      onClick={translateNames}
                      disabled={aiEnabled !== true || aiLoading}
                      aria-disabled={aiEnabled !== true}
                      className="text-xs font-bold text-blue-600 hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {t("admin.tag_retranslate_btn")}
                    </button>
                  )}
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
                disabled={saving || aiLoading}
                className="flex-1 bg-blue-600 text-white font-bold py-3 px-4 rounded-xl min-h-[48px] disabled:opacity-50"
              >
                {saving
                  ? t("admin.adding_tag_btn")
                  : t(editingTag ? "admin.tag_update_btn" : "admin.tag_save_btn")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
