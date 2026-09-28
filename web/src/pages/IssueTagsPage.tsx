import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/client.ts";
import { fetchTags, reviewTag } from "../api/operations.ts";
import { PageContainer } from "../components/PageContainer.tsx";
import { type SupportedLocale, useI18nStore } from "../i18n/index.ts";
import { modalDialog } from "../store/dialogStore.ts";
import { type TagItem, TagReviewAction, TagStatus } from "../types/index.ts";
import { haptics } from "../utils/haptics.ts";
import { goBack } from "../utils/navigation.ts";
import { searchTags } from "../utils/tagSearch.ts";
import { CreateTagModal, normalizeCode } from "./issue-tags/CreateTagModal.tsx";
import { PACKS, type PackKey } from "./issue-tags/industryPacks.ts";
import { TagCard } from "./issue-tags/TagCard.tsx";

type TagLocale = SupportedLocale;
type TagItemData = TagItem;
export function IssueTagsPage() {
  const { t, locale } = useI18nStore();
  const source = locale as TagLocale;

  const [tags, setTags] = useState<TagItemData[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [similarTags, setSimilarTags] = useState<TagItemData[]>([]);
  const [suggestedCode, setSuggestedCode] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<TagItemData | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | TagStatus>("ALL");
  const loadTags = async () => {
    setLoading(true);
    try {
      setTags((await apiClient<TagItemData[]>("/api/tags/all")) || []);
    } catch {
      try {
        setTags((await fetchTags()) || []);
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
      setSimilarTags(searchTags(tags, text));
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

  const handleReview = async (tag: TagItemData, action: TagReviewAction) => {
    if (!tag.code) return;
    try {
      const updated = await reviewTag(tag.code, action);
      haptics.success();
      setTags((prev) =>
        prev.map((item) => (item.code === tag.code ? { ...item, ...updated } : item)),
      );
      await modalDialog.success(
        t(
          action === TagReviewAction.APPROVE
            ? "admin.tag_approved_success"
            : "admin.tag_rejected_success",
        ),
      );
    } catch {
      haptics.errorOrConflict();
      await modalDialog.alert(t("admin.tag_status_error"));
    }
  };

  const pendingCount = useMemo(
    () => tags.filter((tag) => tag.status === TagStatus.PENDING).length,
    [tags],
  );
  const visibleTags = useMemo(
    () =>
      statusFilter === "ALL"
        ? tags
        : tags.filter((tag) => (tag.status || TagStatus.APPROVED) === statusFilter),
    [tags, statusFilter],
  );
  const applyPack = async (pack: PackKey) => {
    try {
      if (pack === "ALL") {
        await apiClient("/api/tags/batch-status", {
          method: "POST",
          body: JSON.stringify({ all: true, is_active: true }),
        });
      } else {
        const active = tags
          .filter((item) => item.code && PACKS[pack][item.code])
          .map((item) => item.code as string);
        const inactive = tags
          .filter((item) => item.code && !active.includes(item.code))
          .map((item) => item.code as string);
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
    await modalDialog.success(t("admin.industry_activated"));
  };

  const handleCreated = (tag: TagItemData) => {
    setTags((prev) => {
      const exists = prev.some((item) => item.code === tag.code);
      if (exists) {
        return prev.map((item) => (item.code === tag.code ? tag : item));
      }
      return [tag, ...prev];
    });
    setModalOpen(false);
    setEditingTag(null);
    setInput("");
    setSimilarTags([]);
    setSuggestedCode("");
  };

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-black text-zinc-900 dark:text-zinc-100 pb-28">
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
                      <TagCard
                        key={tag.code}
                        tag={tag}
                        compact
                        onEdit={(t) => {
                          setEditingTag(t);
                          setModalOpen(true);
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setEditingTag(null);
                  setModalOpen(true);
                }}
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
              {t("admin.tags_tab")} ({visibleTags.length})
            </h2>
            <button
              type="button"
              onClick={loadTags}
              className="text-xs font-bold text-blue-600 p-1"
            >
              ↻
            </button>
          </div>

          {/* Status Tabs (All / Pending / Approved) */}
          <div className="flex items-center gap-1.5 border-b border-zinc-100 dark:border-zinc-800 pb-2">
            <button
              type="button"
              onClick={() => setStatusFilter("ALL")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all min-h-[34px] ${
                statusFilter === "ALL"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm"
                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              {t("admin.tags_tab_all")} ({tags.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter(TagStatus.PENDING)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all min-h-[34px] flex items-center gap-1 ${
                statusFilter === TagStatus.PENDING
                  ? "bg-amber-500 text-white shadow-sm"
                  : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
              }`}
            >
              <span>⏳</span>
              <span>{t("admin.tags_tab_pending", { count: pendingCount })}</span>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter(TagStatus.APPROVED)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all min-h-[34px] ${
                statusFilter === TagStatus.APPROVED
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm"
                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              {t("admin.tags_tab_approved")}
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
          ) : visibleTags.length === 0 ? (
            <div className="text-sm text-zinc-400 py-6 text-center">{t("admin.empty_tags")}</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {visibleTags.map((tag) => (
                <TagCard
                  key={tag.code}
                  tag={tag}
                  showToggle
                  onToggle={toggleStatus}
                  onReview={handleReview}
                  onEdit={(t) => {
                    setEditingTag(t);
                    setModalOpen(true);
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </PageContainer>

      {modalOpen && (
        <CreateTagModal
          initialInput={input}
          initialCode={suggestedCode}
          editingTag={editingTag ?? undefined}
          onClose={() => {
            setModalOpen(false);
            setEditingTag(null);
          }}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
