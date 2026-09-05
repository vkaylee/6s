import { useEffect, useState } from "react";
import { apiClient } from "../api/client.ts";
import { modalDialog } from "../store/dialogStore.ts";
import { haptics } from "../utils/haptics.ts";

interface AdminConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ScoringRuleItem {
  rule_key: string;
  points: number;
  description: string;
}

export function AdminConfigModal({ isOpen, onClose }: AdminConfigModalProps) {
  const [activeTab, setActiveTab] = useState<"SCORING" | "AD" | "NOTIFY">("SCORING");
  const [rules, setRules] = useState<Record<string, number>>({});
  const [applyFrom, setApplyFrom] = useState("");
  const [reason, setReason] = useState("");
  const [isRetroactive, setIsRetroactive] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // AD config state
  const [adEnabled, setAdEnabled] = useState(false);
  const [adServer, setAdServer] = useState("ad.factory.lan");
  const [adPort, setAdPort] = useState(636);
  const [adUseTls, setAdUseTls] = useState(true);
  const [adBaseDn, setAdBaseDn] = useState("DC=factory,DC=lan");
  const [adBindDn, setAdBindDn] = useState("CN=svc_6s_auth,OU=Services,DC=factory,DC=lan");
  const [adBindPassword, setAdBindPassword] = useState("");
  const [adTestResult, setAdTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadScoringRules();
      loadADConfig();
    }
  }, [isOpen]);

  const loadScoringRules = async () => {
    try {
      const data = await apiClient<ScoringRuleItem[]>("/api/config/scoring");
      const map: Record<string, number> = {};
      for (const item of data) {
        map[item.rule_key] = item.points;
      }
      setRules(map);
    } catch {
      // default fallbacks
      setRules({
        penalty_normal: -3,
        penalty_safety: -20,
        penalty_overdue: -5,
        bonus_kaizen: 10,
        reward_reporter_normal: 2,
        reward_reporter_safety: 5,
        penalty_reporter_invalid: -5,
      });
    }
  };

  const loadADConfig = async () => {
    try {
      const data = await apiClient<{
        is_enabled: boolean;
        server: string;
        port: number;
        use_tls: boolean;
        base_dn: string;
        bind_dn: string;
      }>("/api/config/ad");
      if (data) {
        setAdEnabled(data.is_enabled);
        setAdServer(data.server);
        setAdPort(data.port);
        setAdUseTls(data.use_tls);
        setAdBaseDn(data.base_dn);
        setAdBindDn(data.bind_dn);
      }
    } catch {
      // ignore
    }
  };

  if (!isOpen) {
    return null;
  }

  const handleStepPoint = (key: string, delta: number) => {
    haptics.success();
    setRules((prev) => ({
      ...prev,
      [key]: (prev[key] ?? 0) + delta,
    }));
  };

  const handleSaveScoring = async () => {
    if (isRetroactive && (!applyFrom || !reason.trim())) {
      modalDialog.alert("Bắt buộc chọn mốc ngày và nhập lý do khi áp dụng hồi tố điểm!");
      return;
    }

    setIsSaving(true);
    try {
      await apiClient("/api/config/scoring", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rules,
          apply_from: isRetroactive ? new Date(applyFrom).toISOString() : undefined,
          reason: isRetroactive ? reason.trim() : undefined,
        }),
      });
      haptics.success();
      await modalDialog.alert("Đã cập nhật quy tắc chấm điểm thành công!");
      onClose();
    } catch {
      haptics.errorOrConflict();
      modalDialog.alert("Cập nhật thất bại");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestAD = async () => {
    setAdTestResult("Đang kiểm tra kết nối...");
    try {
      const res = await apiClient<{ success: boolean; message: string }>("/api/config/ad/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          server: adServer,
          port: Number(adPort),
          use_tls: adUseTls,
          base_dn: adBaseDn,
          bind_dn: adBindDn,
          bind_password: adBindPassword,
        }),
      });
      setAdTestResult(`✅ ${res.message}`);
    } catch {
      setAdTestResult("❌ Kết nối thất bại");
    }
  };

  const handleSaveAD = async () => {
    setIsSaving(true);
    try {
      await apiClient("/api/config/ad", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_enabled: adEnabled,
          server: adServer,
          port: Number(adPort),
          use_tls: adUseTls,
          skip_tls_verify: false,
          base_dn: adBaseDn,
          bind_dn: adBindDn,
          bind_password: adBindPassword || undefined,
        }),
      });
      haptics.success();
      modalDialog.alert("Đã lưu cấu hình AD / LDAP!");
    } catch {
      modalDialog.alert("Lỗi lưu cấu hình AD");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden my-auto flex flex-col max-h-[92vh]">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100">
            Quản trị hệ thống (Admin)
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-600 font-bold min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="p-2 border-b border-zinc-200 dark:border-zinc-800 flex space-x-2 bg-zinc-50 dark:bg-zinc-800/50">
          <button
            type="button"
            onClick={() => setActiveTab("SCORING")}
            className={`flex-1 py-2.5 rounded-xl font-bold text-xs min-h-[44px] ${
              activeTab === "SCORING"
                ? "bg-white dark:bg-zinc-900 text-blue-600 shadow-sm"
                : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            Điểm số 6S
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("AD")}
            className={`flex-1 py-2.5 rounded-xl font-bold text-xs min-h-[44px] ${
              activeTab === "AD"
                ? "bg-white dark:bg-zinc-900 text-blue-600 shadow-sm"
                : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            Active Directory
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeTab === "SCORING" && (
            <div className="space-y-3">
              <p className="text-xs text-zinc-500">
                Chạm [-] [+] để tăng giảm bước nhảy 1 điểm (Quick Stepper)
              </p>

              {Object.keys(rules).map((ruleKey) => (
                <div
                  key={ruleKey}
                  className="p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700 flex items-center justify-between"
                >
                  <div>
                    <div className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                      {ruleKey}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => handleStepPoint(ruleKey, -1)}
                      className="w-10 h-10 rounded-lg bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-black text-lg flex items-center justify-center min-w-[44px]"
                    >
                      -
                    </button>
                    <span className="w-12 text-center font-black text-base text-zinc-900 dark:text-zinc-100">
                      {rules[ruleKey]}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleStepPoint(ruleKey, 1)}
                      className="w-10 h-10 rounded-lg bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-black text-lg flex items-center justify-center min-w-[44px]"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}

              {/* Retroactive Controls */}
              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-2xl border border-amber-200 dark:border-amber-800 space-y-3">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isRetroactive}
                    onChange={(e) => setIsRetroactive(e.target.checked)}
                    className="w-5 h-5 rounded text-blue-600"
                  />
                  <span className="font-bold text-sm text-amber-900 dark:text-amber-200">
                    Áp dụng hồi tố cho quá khứ (Retroactive)
                  </span>
                </label>

                {isRetroactive && (
                  <div className="space-y-2 pt-2">
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 mb-1">
                        Áp dụng từ ngày (apply_from) *
                      </label>
                      <input
                        type="date"
                        value={applyFrom}
                        onChange={(e) => setApplyFrom(e.target.value)}
                        className="w-full p-2.5 rounded-xl border bg-white dark:bg-zinc-800 text-sm font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 mb-1">
                        Lý do điều chỉnh (bắt buộc) *
                      </label>
                      <input
                        type="text"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="VD: Chỉ đạo tăng điểm phạt 6S..."
                        className="w-full p-2.5 rounded-xl border bg-white dark:bg-zinc-800 text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "AD" && (
            <div className="space-y-3">
              <label className="flex items-center space-x-2 cursor-pointer p-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
                <input
                  type="checkbox"
                  checked={adEnabled}
                  onChange={(e) => setAdEnabled(e.target.checked)}
                  className="w-5 h-5 rounded text-blue-600"
                />
                <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                  Bật xác thực Active Directory / LDAP
                </span>
              </label>

              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1">
                  Server Host / IP
                </label>
                <input
                  type="text"
                  value={adServer}
                  onChange={(e) => setAdServer(e.target.value)}
                  className="w-full p-2.5 rounded-xl border bg-zinc-50 dark:bg-zinc-800 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">Port</label>
                  <input
                    type="number"
                    value={adPort}
                    onChange={(e) => setAdPort(Number(e.target.value))}
                    className="w-full p-2.5 rounded-xl border bg-zinc-50 dark:bg-zinc-800 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 mb-1">TLS (LDAPS)</label>
                  <button
                    type="button"
                    onClick={() => setAdUseTls(!adUseTls)}
                    className="w-full p-2.5 rounded-xl border font-bold text-sm min-h-[44px]"
                  >
                    {adUseTls ? "BẬT" : "TẮT"}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1">Base DN</label>
                <input
                  type="text"
                  value={adBaseDn}
                  onChange={(e) => setAdBaseDn(e.target.value)}
                  className="w-full p-2.5 rounded-xl border bg-zinc-50 dark:bg-zinc-800 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1">Bind DN</label>
                <input
                  type="text"
                  value={adBindDn}
                  onChange={(e) => setAdBindDn(e.target.value)}
                  className="w-full p-2.5 rounded-xl border bg-zinc-50 dark:bg-zinc-800 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1">Bind Password</label>
                <input
                  type="password"
                  value={adBindPassword}
                  onChange={(e) => setAdBindPassword(e.target.value)}
                  placeholder="Nhập nếu muốn đổi..."
                  className="w-full p-2.5 rounded-xl border bg-zinc-50 dark:bg-zinc-800 text-sm"
                />
              </div>

              <button
                type="button"
                onClick={handleTestAD}
                className="w-full bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-bold py-3 rounded-xl min-h-[48px] text-xs"
              >
                Kiểm tra kết nối AD (Test Bind)
              </button>

              {adTestResult && (
                <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl text-xs font-bold text-center">
                  {adTestResult}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <button
            type="button"
            disabled={isSaving}
            onClick={activeTab === "SCORING" ? handleSaveScoring : handleSaveAD}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 px-6 rounded-2xl min-h-[56px] text-sm shadow-lg"
          >
            {isSaving ? "Đang lưu..." : "LƯU CẤU HÌNH"}
          </button>
        </div>
      </div>
    </div>
  );
}
