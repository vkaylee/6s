import { useEffect, useState } from "react";
import { ApiError, apiClient } from "../../api/client.ts";
import { modalDialog } from "../../store/dialogStore.ts";
import { haptics } from "../../utils/haptics.ts";

type Translate = (key: string, params?: Record<string, string | number>) => string;

interface ActiveDirectoryConfigSectionProps {
  active: boolean;
  t: Translate;
}

interface ADConfigData {
  is_enabled: boolean;
  server: string;
  port: number;
  use_tls: boolean;
  skip_tls_verify: boolean;
  base_dn: string;
  bind_dn: string;
  user_filter: string;
  group_admin_dn?: string;
  group_safety_dn?: string;
  group_leader_dn?: string;
}

export function ActiveDirectoryConfigSection({ active, t }: ActiveDirectoryConfigSectionProps) {
  const [adEnabled, setAdEnabled] = useState(false);
  const [adServer, setAdServer] = useState("ad.factory.lan");
  const [adPort, setAdPort] = useState(636);
  const [adUseTls, setAdUseTls] = useState(true);
  const [adSkipTlsVerify, setAdSkipTlsVerify] = useState(false);
  const [adBaseDn, setAdBaseDn] = useState("DC=factory,DC=lan");
  const [adBindDn, setAdBindDn] = useState("CN=svc_6s_auth,OU=Services,DC=factory,DC=lan");
  const [adBindPassword, setAdBindPassword] = useState("");
  const [adUserFilter, setAdUserFilter] = useState("");
  const [adGroupAdminDn, setAdGroupAdminDn] = useState("");
  const [adGroupSafetyDn, setAdGroupSafetyDn] = useState("");
  const [adGroupLeaderDn, setAdGroupLeaderDn] = useState("");
  const [adTestResult, setAdTestResult] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void loadConfig();
  }, []);

  const applyConfig = (data: ADConfigData) => {
    setAdEnabled(data.is_enabled);
    setAdServer(data.server);
    setAdPort(data.port);
    setAdUseTls(data.use_tls);
    setAdSkipTlsVerify(data.skip_tls_verify);
    setAdBaseDn(data.base_dn);
    setAdBindDn(data.bind_dn);
    setAdUserFilter(data.user_filter);
    setAdGroupAdminDn(data.group_admin_dn || "");
    setAdGroupSafetyDn(data.group_safety_dn || "");
    setAdGroupLeaderDn(data.group_leader_dn || "");
  };

  const loadConfig = async () => {
    try {
      const data = await apiClient<ADConfigData>("/api/config/ad");
      if (data) applyConfig(data);
    } catch {
      // ignore
    }
  };

  const handleTest = async () => {
    setAdTestResult(t("admin.testing_connection"));
    try {
      const res = await apiClient<{ success: boolean; message: string }>("/api/config/ad/test", {
        method: "POST",
        body: JSON.stringify({
          server: adServer,
          port: adPort,
          use_tls: adUseTls,
          skip_tls_verify: adSkipTlsVerify,
          base_dn: adBaseDn,
          bind_dn: adBindDn,
          bind_password: adBindPassword,
          user_filter: adUserFilter,
        }),
      });
      setAdTestResult(res.message || t("common.ok"));
      haptics.success();
    } catch (error) {
      setAdTestResult(error instanceof ApiError ? error.message : t("admin.connection_failed"));
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const saved = await apiClient<ADConfigData>("/api/config/ad", {
        method: "PUT",
        body: JSON.stringify({
          is_enabled: adEnabled,
          server: adServer,
          port: adPort,
          use_tls: adUseTls,
          skip_tls_verify: adSkipTlsVerify,
          base_dn: adBaseDn,
          bind_dn: adBindDn,
          bind_password: adBindPassword || undefined,
          user_filter: adUserFilter,
          group_admin_dn: adGroupAdminDn,
          group_safety_dn: adGroupSafetyDn,
          group_leader_dn: adGroupLeaderDn,
        }),
      });
      applyConfig(saved);
      setAdBindPassword("");
      haptics.success();
      await modalDialog.success(t("admin.save_ad_success"));
    } catch {
      modalDialog.alert(t("admin.save_ad_error"));
    } finally {
      setIsSaving(false);
    }
  };

  if (!active) return null;

  return (
    <section className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
      <label className="flex items-center space-x-2 cursor-pointer border-b pb-3 dark:border-zinc-800">
        <input
          type="checkbox"
          checked={adEnabled}
          onChange={(e) => setAdEnabled(e.target.checked)}
          className="w-5 h-5 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
          {t("admin.enable_ad_label")}
        </span>
      </label>

      <div>
        <span className="block text-xs font-bold text-zinc-500 mb-1">
          {t("admin.server_host_label")}
        </span>
        <input
          type="text"
          value={adServer}
          onChange={(e) => setAdServer(e.target.value)}
          className="w-full p-2.5 rounded-xl border bg-zinc-50 dark:bg-zinc-800 text-sm font-mono"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="block text-xs font-bold text-zinc-500 mb-1">
            {t("admin.port_label")}
          </span>
          <input
            type="number"
            value={adPort}
            onChange={(e) => setAdPort(Number(e.target.value))}
            className="w-full p-2.5 rounded-xl border bg-zinc-50 dark:bg-zinc-800 text-sm font-mono"
          />
        </div>
        <div>
          <span className="block text-xs font-bold text-zinc-500 mb-1">{t("admin.tls_label")}</span>
          <button
            type="button"
            onClick={() => setAdUseTls(!adUseTls)}
            className={`w-full p-2.5 rounded-xl border text-sm font-bold min-h-[44px] ${
              adUseTls
                ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                : "bg-zinc-100 text-zinc-500"
            }`}
          >
            {adUseTls ? t("admin.on") : t("admin.off")}
          </button>
        </div>
      </div>

      <label className="flex items-center space-x-2 cursor-pointer">
        <input
          type="checkbox"
          checked={adSkipTlsVerify}
          onChange={(e) => setAdSkipTlsVerify(e.target.checked)}
          className="w-5 h-5 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm font-bold">{t("admin.skip_tls_verify_label")}</span>
      </label>

      <div>
        <span className="block text-xs font-bold text-zinc-500 mb-1">
          {t("admin.user_filter_label")}
        </span>
        <input
          type="text"
          value={adUserFilter}
          onChange={(e) => setAdUserFilter(e.target.value)}
          className="w-full p-2.5 rounded-xl border bg-zinc-50 dark:bg-zinc-800 text-sm font-mono"
        />
      </div>

      <div className="grid grid-cols-1 gap-3">
        <input
          type="text"
          aria-label={t("admin.group_admin_dn_label")}
          value={adGroupAdminDn}
          onChange={(e) => setAdGroupAdminDn(e.target.value)}
          placeholder={t("admin.group_admin_dn_label")}
          className="w-full p-2.5 rounded-xl border bg-zinc-50 dark:bg-zinc-800 text-sm font-mono"
        />
        <input
          type="text"
          aria-label={t("admin.group_safety_dn_label")}
          value={adGroupSafetyDn}
          onChange={(e) => setAdGroupSafetyDn(e.target.value)}
          placeholder={t("admin.group_safety_dn_label")}
          className="w-full p-2.5 rounded-xl border bg-zinc-50 dark:bg-zinc-800 text-sm font-mono"
        />
        <input
          type="text"
          aria-label={t("admin.group_leader_dn_label")}
          value={adGroupLeaderDn}
          onChange={(e) => setAdGroupLeaderDn(e.target.value)}
          placeholder={t("admin.group_leader_dn_label")}
          className="w-full p-2.5 rounded-xl border bg-zinc-50 dark:bg-zinc-800 text-sm font-mono"
        />
      </div>

      <div>
        <span className="block text-xs font-bold text-zinc-500 mb-1">
          {t("admin.base_dn_label")}
        </span>
        <input
          type="text"
          value={adBaseDn}
          onChange={(e) => setAdBaseDn(e.target.value)}
          className="w-full p-2.5 rounded-xl border bg-zinc-50 dark:bg-zinc-800 text-sm font-mono"
        />
      </div>

      <div>
        <span className="block text-xs font-bold text-zinc-500 mb-1">
          {t("admin.bind_dn_label")}
        </span>
        <input
          type="text"
          value={adBindDn}
          onChange={(e) => setAdBindDn(e.target.value)}
          className="w-full p-2.5 rounded-xl border bg-zinc-50 dark:bg-zinc-800 text-sm font-mono"
        />
      </div>

      <div>
        <span className="block text-xs font-bold text-zinc-500 mb-1">
          {t("admin.bind_pw_label")}
        </span>
        <input
          type="password"
          value={adBindPassword}
          onChange={(e) => setAdBindPassword(e.target.value)}
          placeholder={t("admin.bind_pw_placeholder")}
          className="w-full p-2.5 rounded-xl border bg-zinc-50 dark:bg-zinc-800 text-sm font-mono"
        />
      </div>

      <div className="pt-2 flex flex-col gap-2">
        <button
          type="button"
          onClick={handleTest}
          className="w-full bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 text-zinc-800 dark:text-zinc-200 font-bold py-3 rounded-xl min-h-[44px] text-sm"
        >
          {t("admin.test_ad_btn")}
        </button>
        {adTestResult && (
          <div className="text-xs p-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 font-mono text-center">
            {adTestResult}
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
