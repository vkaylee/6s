import { useState } from "react";
import { PageContainer } from "../components/PageContainer.tsx";
import { useI18nStore } from "../i18n/index.ts";
import { goBack } from "../utils/navigation.ts";
import { ActiveDirectoryConfigSection } from "./admin-config/ActiveDirectoryConfigSection.tsx";
import { AIConfigSection } from "./admin-config/AIConfigSection.tsx";
import { NotificationConfigSection } from "./admin-config/NotificationConfigSection.tsx";
import { ScoringConfigSection } from "./admin-config/ScoringConfigSection.tsx";
import { TimezoneConfigSection } from "./admin-config/TimezoneConfigSection.tsx";

const TABS = [
  { id: "SCORING", labelKey: "admin.score_6s_tab" },
  { id: "AD", labelKey: "admin.ad_tab" },
  { id: "NOTIFICATIONS", labelKey: "admin.notify_tab" },
  { id: "AI", labelKey: "admin.ai_tab" },
  { id: "FACTORY", labelKey: "admin.factory_timezone_tab" },
] as const;

type ConfigTab = (typeof TABS)[number]["id"];

export function AdminConfigPage() {
  const { t } = useI18nStore();
  const [activeTab, setActiveTab] = useState<ConfigTab>("SCORING");

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-black text-zinc-900 dark:text-zinc-100 pb-28">
      <PageContainer className="pt-4">
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
      </PageContainer>
      <main className="py-4">
        <PageContainer className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 bg-zinc-200 dark:bg-zinc-800 p-1.5 rounded-2xl">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`py-2.5 px-2 rounded-xl font-bold text-xs min-h-[44px] transition-colors ${
                  activeTab === tab.id
                    ? "bg-white dark:bg-zinc-900 text-blue-600 shadow-sm"
                    : "text-zinc-600 dark:text-zinc-400"
                }`}
              >
                {t(tab.labelKey)}
              </button>
            ))}
          </div>

          <ScoringConfigSection active={activeTab === "SCORING"} t={t} />
          <ActiveDirectoryConfigSection active={activeTab === "AD"} t={t} />
          <NotificationConfigSection active={activeTab === "NOTIFICATIONS"} t={t} />
          <AIConfigSection active={activeTab === "AI"} t={t} />
          <TimezoneConfigSection active={activeTab === "FACTORY"} t={t} />
        </PageContainer>
      </main>
    </div>
  );
}
