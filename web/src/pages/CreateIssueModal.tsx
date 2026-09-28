import { Check, ShieldAlert, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { LocationCombobox } from "../components/LocationCombobox.tsx";
import { ResponsibilityPicker } from "../components/ResponsibilityPicker.tsx";
import { useI18nStore } from "../i18n/index.ts";
import { IssueCategory, type IssueItem, type LocationItem, type TagItem } from "../types/index.ts";
import { IssueCategorySection } from "./create-issue/IssueCategorySection.tsx";
import { IssueMediaAttachments } from "./create-issue/IssueMediaAttachments.tsx";
import { IssueTaxonomySection } from "./create-issue/IssueTaxonomySection.tsx";
import { useIssueForm } from "./create-issue/useIssueForm.ts";

interface CreateIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  locations: LocationItem[];
  tags: TagItem[];
  onSuccess: (updatedIssue?: IssueItem) => void;
  initialIssue?: IssueItem | null;
}

export function CreateIssueModal({
  isOpen,
  onClose,
  onSuccess,
  locations,
  tags,
  initialIssue,
}: CreateIssueModalProps) {
  const { t, locale: storeLocale } = useI18nStore();
  const locale = typeof window === "undefined" ? useI18nStore.getState().locale : storeLocale;
  const form = useIssueForm({ locations, tags, initialIssue });
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusables = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("aria-hidden"));
    focusables()[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeDialog = (document.activeElement as HTMLElement | null)?.closest(
        '[role="dialog"]',
      );
      const eventDialog = (event.target as HTMLElement | null)?.closest('[role="dialog"]');
      if ((activeDialog && activeDialog !== dialog) || (eventDialog && eventDialog !== dialog))
        return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  const translate = (key: string, params?: Record<string, string>) => t(key, params);
  const handleSubmit = async () => {
    const saved = await form.submitIssue(onSuccess, !initialIssue);
    if (saved) onClose();
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-issue-modal-title"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm animate-fade-in overflow-y-auto"
    >
      <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden my-auto flex flex-col h-[94dvh] sm:h-auto sm:max-h-[90vh]">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-rose-600 animate-pulse" />
            <h2
              id="create-issue-modal-title"
              className="text-lg font-black text-zinc-900 dark:text-zinc-100"
            >
              {initialIssue ? t("issue.edit_title") : t("issue.create_title")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 font-bold min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-5">
          <IssueCategorySection
            category={form.category}
            causeType={form.causeType}
            tags={form.availableTags}
            selectedTags={form.selectedTags}
            locale={locale}
            onSelectCategory={form.selectCategory}
            onToggleTag={form.toggleTag}
            onCauseTypeChange={form.setCauseType}
            translate={translate}
            compact
          />
          <div>
            <span className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
              {t("issue.step_location")}
            </span>
            <LocationCombobox
              locations={locations}
              value={form.locationCode}
              onChange={form.setLocationCode}
            />
          </div>
          {initialIssue && (
            <ResponsibilityPicker
              locationCode={form.locationCode}
              assetId={form.assetId}
              assignedTeamId={form.assignedTeamId}
              assigneeId={form.assigneeId}
              onAssetChange={form.setAssetId}
              onTeamChange={form.setAssignedTeamId}
              onAssigneeChange={form.setAssigneeId}
              disabled={form.isSubmitting}
            />
          )}
          <div>
            <span className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
              {t("issue.step_photos")}
            </span>
            <IssueMediaAttachments
              causeType={form.causeType}
              previewBefore={form.previewBefore}
              previewDetail={form.previewDetail}
              translate={translate}
              onCapture={form.handleCapturePhoto}
              compact
            />
          </div>
          <IssueTaxonomySection
            tags={form.filteredTags}
            selectedTags={form.selectedTags}
            locale={locale}
            onToggleTag={form.toggleTag}
            translate={translate}
            category={form.category}
            compact
          />
          <div>
            <span className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
              {t("issue.step_description")}
            </span>
            <textarea
              id="create-issue-description"
              aria-label={t("issue.step_description")}
              rows={2}
              value={form.description}
              onChange={(event) => form.setDescription(event.target.value)}
              placeholder={t("issue.description_placeholder")}
              className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-base"
            />
          </div>
        </div>
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <button
            type="button"
            disabled={form.isSubmitting}
            onClick={handleSubmit}
            className={`w-full font-black text-base py-4 px-6 rounded-2xl min-h-[64px] flex items-center justify-center space-x-2.5 shadow-xl active:scale-[0.98] transition-transform ${form.category === IssueCategory.S6 ? "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/30 ring-4 ring-rose-500/20 animate-pulse" : "bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 shadow-zinc-900/20"}`}
          >
            {form.category === IssueCategory.S6 ? (
              <ShieldAlert className="w-5 h-5" />
            ) : (
              <Check className="w-5 h-5" />
            )}
            <span>
              {form.isSubmitting
                ? t("issue.saving")
                : initialIssue
                  ? t("issue.save_changes")
                  : form.category === IssueCategory.S6
                    ? t("issue.submit_safety")
                    : t("issue.submit_standard")}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
