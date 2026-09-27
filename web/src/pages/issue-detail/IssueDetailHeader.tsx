import { Archive, MoreHorizontal, Pencil, X } from "lucide-react";
import type React from "react";
import { LocationCombobox } from "../../components/LocationCombobox.tsx";
import type { SupportedLocale } from "../../i18n/index.ts";
import {
  type IssueCategory,
  type IssueItem,
  type LocationItem,
  resolveI18n,
  S_CATEGORIES,
} from "../../types/index.ts";
import type { ConfirmAction, ModalTab } from "./types.ts";

export interface IssueDetailHeaderView {
  currentIssue: IssueItem;
  t: (path: string, params?: Record<string, string | number>) => string;
  canEdit: boolean;
  setIsEditingCategory: React.Dispatch<React.SetStateAction<boolean>>;
  setIsEditingLocation: React.Dispatch<React.SetStateAction<boolean>>;
  isEditingCategory: boolean;
  locations: LocationItem[];
  isEditingLocation: boolean;
  handleQuickChangeCategory: (newCategory: IssueCategory) => Promise<void>;
  handleQuickChangeLocation: (newLocationCode: string) => Promise<void>;
  locale: string;
  resolvedLocationName: string;
  isDeleted: boolean;
  canDeleteIssue: boolean;
  canRestoreIssue: boolean;
  actionMenuRef: React.RefObject<HTMLDivElement | null>;
  isActionMenuOpen: boolean;
  setIsActionMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  mutationsOnline: boolean;
  isSubmitting: boolean;
  recoveryPending: boolean;
  setShowConfirmAction: React.Dispatch<React.SetStateAction<ConfirmAction | null>>;
  setIsEditingFull: React.Dispatch<React.SetStateAction<boolean>>;
  onClose: () => void;
  activeTab: ModalTab;
  setActiveTab: React.Dispatch<React.SetStateAction<ModalTab>>;
}
export function IssueDetailHeader({ view }: { view: IssueDetailHeaderView }) {
  const {
    currentIssue,
    t,
    canEdit,
    setIsEditingCategory,
    setIsEditingLocation,
    isEditingCategory,
    locations,
    isEditingLocation,
    handleQuickChangeCategory,
    handleQuickChangeLocation,
    locale,
    resolvedLocationName,
    isDeleted,
    canDeleteIssue,
    canRestoreIssue,
    actionMenuRef,
    isActionMenuOpen,
    setIsActionMenuOpen,
    mutationsOnline,
    isSubmitting,
    recoveryPending,
    setShowConfirmAction,
    setIsEditingFull,
    onClose,
    activeTab,
    setActiveTab,
  } = view;

  return (
    <>
      <header className="sticky top-0 z-20 shrink-0 border-b border-zinc-200/80 bg-white/95 px-3.5 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 sm:pt-2.5 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-900/95 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="shrink-0 font-mono text-xs font-semibold tracking-tight text-zinc-400 dark:text-zinc-500">
            #{currentIssue.id}
          </span>
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                if (canEdit) {
                  setIsEditingCategory((prev) => !prev);
                  setIsEditingLocation(false);
                }
              }}
              disabled={!canEdit}
              aria-expanded={isEditingCategory}
              title={canEdit ? t("issue_detail.quick_edit_category") : undefined}
              className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold transition ${
                canEdit
                  ? "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 cursor-pointer"
                  : "bg-zinc-100 dark:bg-zinc-800 cursor-default"
              } text-zinc-700 dark:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
            >
              <span>{currentIssue.category}</span>
              {canEdit && <Pencil className="h-2.5 w-2.5 opacity-60" aria-hidden="true" />}
            </button>
            {isEditingCategory && (
              <div className="absolute left-0 top-full mt-1.5 z-30 p-2 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-xl grid grid-cols-3 gap-1.5 w-72 sm:w-80 animate-fade-in">
                {S_CATEGORIES.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => handleQuickChangeCategory(s.key)}
                    className={`p-2 rounded-xl text-xs font-black min-h-[40px] border transition ${
                      currentIssue.category === s.key
                        ? "bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100"
                        : "bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                    }`}
                  >
                    {s.key} (
                    {s.name_i18n ? resolveI18n(s.name_i18n, locale as SupportedLocale) : s.name})
                  </button>
                ))}
              </div>
            )}
          </div>
          <span aria-hidden="true" className="shrink-0 text-zinc-300 dark:text-zinc-700">
            /
          </span>
          <div className="relative min-w-0 flex-1">
            <button
              type="button"
              onClick={() => {
                if (canEdit && locations && locations.length > 0) {
                  setIsEditingLocation((prev) => !prev);
                  setIsEditingCategory(false);
                }
              }}
              disabled={!canEdit || !locations || locations.length === 0}
              aria-expanded={isEditingLocation}
              title={canEdit ? t("issue_detail.quick_edit_location") : undefined}
              className={`w-full text-left truncate text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-sm ${
                canEdit ? "hover:underline cursor-pointer" : ""
              }`}
            >
              {resolvedLocationName}
            </button>
            {isEditingLocation && locations && locations.length > 0 && (
              <div className="absolute left-0 top-full mt-1.5 z-30 p-2.5 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-xl w-80 max-w-[calc(100vw-2rem)] animate-fade-in">
                <LocationCombobox
                  locations={locations}
                  value={currentIssue.location_code}
                  onChange={handleQuickChangeLocation}
                />
              </div>
            )}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {isDeleted && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-zinc-200 px-2 py-1 text-[10px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                <Archive className="h-3 w-3" aria-hidden="true" />
                {t("issue_detail.deleted_badge")}
              </span>
            )}
            {(canDeleteIssue || canRestoreIssue) && (
              <div ref={actionMenuRef as React.RefObject<HTMLDivElement>} className="relative">
                <button
                  type="button"
                  aria-label={t("common.actions")}
                  aria-haspopup="true"
                  aria-expanded={isActionMenuOpen}
                  aria-controls="issue-actions-menu"
                  title={t("common.actions")}
                  onClick={() => setIsActionMenuOpen((open) => !open)}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </button>
                {isActionMenuOpen && (
                  <div
                    id="issue-actions-menu"
                    role="menu"
                    aria-label={t("common.actions")}
                    className="absolute right-0 top-full z-40 mt-1.5 min-w-44 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl animate-fade-in dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    {canDeleteIssue && (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={!mutationsOnline || isSubmitting || recoveryPending}
                        onClick={() => {
                          setIsActionMenuOpen(false);
                          setShowConfirmAction("DELETE");
                        }}
                        className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-bold text-rose-700 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-40 dark:text-rose-300 dark:hover:bg-rose-950/40"
                      >
                        <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{t("issue_detail.delete_action")}</span>
                      </button>
                    )}
                    {canRestoreIssue && (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={!mutationsOnline || isSubmitting || recoveryPending}
                        onClick={() => {
                          setIsActionMenuOpen(false);
                          setShowConfirmAction("RESTORE");
                        }}
                        className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-40 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                      >
                        <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{t("issue_detail.restore_action")}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => setIsEditingFull(true)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                title={t("issue.edit")}
                aria-label={t("issue.edit")}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              aria-label={t("common.close")}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>
      <nav
        aria-label={t("issue_detail.modal_tabs_label")}
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-zinc-200 bg-white px-3 pt-2 dark:border-zinc-800 dark:bg-zinc-900 sm:px-5"
      >
        {(
          [
            ["overview", "issue_detail.modal_tab_overview"],
            ["ai", "issue_detail.modal_tab_ai"],
            ["history", "issue_detail.modal_tab_history"],
          ] as const
        ).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            role="tab"
            onClick={() => setActiveTab(tab)}
            aria-selected={activeTab === tab}
            className={`min-h-11 shrink-0 border-b-2 px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset sm:px-4 ${
              activeTab === tab
                ? "border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300"
                : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-200"
            }`}
          >
            {t(label)}
          </button>
        ))}
      </nav>
    </>
  );
}
