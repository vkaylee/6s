import { useState } from "react";
import { apiClient } from "../api/client.ts";
import { useI18nStore } from "../i18n/index.ts";
import { type UserProfile, useAuthStore } from "../store/authStore.ts";
import { haptics } from "../utils/haptics.ts";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const { t } = useI18nStore();
  const { setAuth } = useAuthStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!isOpen) {
    return null;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setErrorMsg(t("auth.required_fields"));
      return;
    }

    setIsLoading(true);
    setErrorMsg("");

    try {
      const res = await apiClient<{
        access_token: string;
        refresh_token: string;
        user: UserProfile;
      }>("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim(),
        }),
        skipAuth: true,
      });

      haptics.success();
      await setAuth(res.user, res.access_token, res.refresh_token);
      onClose();
    } catch (err: unknown) {
      haptics.errorOrConflict();
      if (typeof err === "object" && err !== null && "message" in err) {
        setErrorMsg((err as { message: string }).message);
      } else {
        setErrorMsg(t("auth.login_failed"));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 text-center">
          <div className="w-12 h-12 bg-rose-600 text-white rounded-2xl mx-auto flex items-center justify-center font-black text-xl mb-3 shadow-lg shadow-rose-600/30">
            6S
          </div>
          <h2 className="text-xl font-black text-zinc-900 dark:text-zinc-100">{t("auth.login")}</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Hỗ trợ tài khoản nội bộ & Active Directory (AD)
          </p>
        </div>

        <form onSubmit={handleLogin} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs font-bold text-rose-700 dark:text-rose-300">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
              {t("auth.username")} *
            </label>
            <input
              type="text"
              autoCapitalize="none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="VD: admin, CN0012, worker01"
              className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3.5 text-base text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[52px]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
              {t("auth.password")} *
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3.5 text-base text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[52px]"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-black text-base py-4 rounded-xl shadow-lg min-h-[56px] transition-transform flex items-center justify-center"
          >
            {isLoading ? t("common.loading") : t("auth.login").toUpperCase()}
          </button>
        </form>
      </div>
    </div>
  );
}
