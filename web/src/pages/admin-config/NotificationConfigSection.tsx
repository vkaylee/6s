import { useEffect, useState } from "react";
import { apiClient } from "../../api/client.ts";
import { modalDialog } from "../../store/dialogStore.ts";
import { haptics } from "../../utils/haptics.ts";

type Translate = (key: string, params?: Record<string, string | number>) => string;

interface NotificationConfigSectionProps {
  active: boolean;
  t: Translate;
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

export function NotificationConfigSection({ active, t }: NotificationConfigSectionProps) {
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [notifHasToken, setNotifHasToken] = useState(false);
  const [notifAppToken, setNotifAppToken] = useState("");
  const [notifHasWebhook, setNotifHasWebhook] = useState(false);
  const [notifWebhookUrl, setNotifWebhookUrl] = useState("");
  const [notifBaseUrl, setNotifBaseUrl] = useState("https://6s.factory.lan");
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingNotif, setIsTestingNotif] = useState(false);
  const [notifTestResults, setNotifTestResults] = useState<TestNotifyResult[] | null>(null);

  useEffect(() => {
    void loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const data = await apiClient<NotificationConfigData>("/api/config/notifications");
      if (data) {
        setNotifEnabled(data.wxpusher_enabled);
        setNotifHasToken(data.has_app_token);
        setNotifHasWebhook(data.has_webhook_url);
        if (data.public_base_url) setNotifBaseUrl(data.public_base_url);
      }
    } catch {
      // ignore
    }
  };

  const handleSave = async () => {
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
      await modalDialog.success(t("admin.save_notify_success"));
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert(t("admin.save_notify_error"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
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

  if (!active) return null;

  return (
    <section className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
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
          <span className="block text-xs font-bold text-zinc-500">
            {t("admin.wxpusher_token_label")}
          </span>
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

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="block text-xs font-bold text-zinc-500">
            {t("admin.webhook_url_label")}
          </span>
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

      <div>
        <span className="block text-xs font-bold text-zinc-500 mb-1">
          {t("admin.base_url_label")}
        </span>
        <input
          type="text"
          value={notifBaseUrl}
          onChange={(e) => setNotifBaseUrl(e.target.value)}
          placeholder={t("admin.base_url_placeholder")}
          className="w-full p-2.5 rounded-xl border bg-zinc-50 dark:bg-zinc-800 text-sm font-mono min-h-[44px]"
        />
      </div>

      <div className="pt-2 flex flex-col gap-2">
        <button
          type="button"
          onClick={handleTest}
          disabled={isTestingNotif}
          className="w-full bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 text-zinc-800 dark:text-zinc-200 font-bold py-3 rounded-xl min-h-[44px] text-sm flex items-center justify-center transition-colors"
        >
          {isTestingNotif ? t("admin.testing_notify") : t("admin.test_notify_btn")}
        </button>

        {notifTestResults && (
          <div className="space-y-1.5 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700">
            {notifTestResults.map((result) => (
              <div key={result.channel} className="flex items-center justify-between text-xs">
                <span className="font-mono font-bold">{result.channel}</span>
                <span
                  className={`font-bold ${result.success ? "text-emerald-600" : "text-rose-600"}`}
                >
                  {result.success
                    ? `✓ ${t("common.ok")}`
                    : `✗ ${result.error || t("common.failed")}`}
                </span>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 px-6 rounded-2xl min-h-[56px] shadow-lg shadow-blue-600/30 transition-transform active:scale-[0.98] mt-2"
        >
          {isSaving ? t("admin.saving_btn") : t("admin.save_config_btn")}
        </button>
      </div>
    </section>
  );
}
