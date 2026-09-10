import { useState } from "react";
import { usePWAInstall } from "../hooks/usePWAInstall.ts";
import { useI18nStore } from "../i18n/index.ts";

export function InstallPrompt() {
  const { canInstall, isIOS, isInstalled, promptInstall } = usePWAInstall();
  const { t } = useI18nStore();
  const [showIOSModal, setShowIOSModal] = useState(false);

  if (isInstalled || !canInstall) {
    return null;
  }

  const handleClick = async () => {
    if (isIOS) {
      setShowIOSModal(true);
      return;
    }
    await promptInstall();
  };

  return (
    <>
      <button
        type="button"
        data-testid="pwa-install-btn"
        onClick={handleClick}
        className="px-2 py-1 h-8 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 text-xs font-bold flex items-center space-x-1 border border-red-200 dark:border-red-900/50 transition-colors"
        title={t("pwa.install_tooltip")}
      >
        <span>📲</span>
        <span className="hidden sm:inline text-[11px]">{t("pwa.install_app")}</span>
      </button>

      {showIOSModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-ios-install-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-zinc-200 dark:border-zinc-800 space-y-4 animate-fade-in">
            <div className="flex justify-between items-start">
              <h3
                id="pwa-ios-install-title"
                className="text-base font-bold text-zinc-900 dark:text-zinc-100"
              >
                {t("pwa.ios_title")}
              </h3>
              <button
                type="button"
                onClick={() => setShowIOSModal(false)}
                aria-label={t("common.close")}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <ol className="text-sm text-zinc-600 dark:text-zinc-300 space-y-2 list-decimal list-inside">
              <li>{t("pwa.ios_step1")}</li>
              <li>{t("pwa.ios_step2")}</li>
              <li>{t("pwa.ios_step3")}</li>
            </ol>

            <button
              type="button"
              onClick={() => setShowIOSModal(false)}
              className="w-full py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold transition-colors"
            >
              {t("common.close")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
