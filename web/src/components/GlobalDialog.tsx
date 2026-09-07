import { useEffect, useRef } from "react";
import { useI18nStore } from "../i18n/index.ts";
import type { DialogOptions } from "../store/dialogStore.ts";
import { useDialogStore } from "../store/dialogStore.ts";
import { resolveI18n } from "../types/index.ts";
export interface GlobalDialogProps {
  isOpen?: boolean;
  options?: DialogOptions;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export function GlobalDialog(props: GlobalDialogProps = {}) {
  const { t } = useI18nStore();
  const currentLocale = useI18nStore.getState().locale;
  const store = useDialogStore();
  const isOpen = props.isOpen !== undefined ? props.isOpen : store.isOpen;
  const options = props.options !== undefined ? props.options : store.options;
  const handleConfirm = props.onConfirm || store.handleConfirm;
  const handleCancel = props.onCancel || store.handleCancel;

  const dialogRef = useRef<HTMLDivElement>(null);

  // Restore focus to the opener when the dialog closes or unmounts.
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    return () => previouslyFocused?.focus();
  }, [isOpen]);

  // Escape cancels; Tab cycles inside the dialog.
  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusables = () =>
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
    focusables()[0]?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        handleCancel();
        return;
      }
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialog.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, handleCancel]);

  if (!isOpen) return null;

  const isConfirm = options.type === "confirm";
  const isDestructive = options.destructive;

  const defaultTitle = isConfirm ? t("common.confirm") : t("common.error");
  const defaultCancelText = t("common.cancel");
  const defaultConfirmText = isConfirm ? t("common.confirm") : t("common.close");

  const titleText = options.title ? resolveI18n(options.title, currentLocale) : defaultTitle;
  const messageText = resolveI18n(options.message, currentLocale);
  const cancelText = options.cancelText
    ? resolveI18n(options.cancelText, currentLocale)
    : defaultCancelText;
  const confirmText = options.confirmText
    ? resolveI18n(options.confirmText, currentLocale)
    : defaultConfirmText;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="global-dialog-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
    >
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col">
        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800">
          <h3
            id="global-dialog-title"
            className={`text-lg font-bold ${
              isDestructive ? "text-red-600 dark:text-red-400" : "text-zinc-900 dark:text-zinc-100"
            }`}
          >
            {titleText}
          </h3>
        </div>

        <div className="p-5 text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed whitespace-pre-line">
          {messageText}
        </div>

        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex justify-end gap-2">
          {isConfirm && (
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            onClick={handleConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
              isDestructive ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
