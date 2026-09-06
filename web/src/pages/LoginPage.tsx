import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { apiClient } from "../api/client.ts";
import { NavActions } from "../components/NavActions.tsx";
import { useI18nStore } from "../i18n/index.ts";
import {
  clearRememberedUser,
  getRememberedUser,
  type UserProfile,
  useAuthStore,
} from "../store/authStore.ts";
import { haptics } from "../utils/haptics.ts";
import { goBack } from "../utils/navigation.ts";
export function LoginPage() {
  const { t } = useI18nStore();
  const [, setLocation] = useLocation();
  const { user, setAuth } = useAuthStore();
  const [rememberedUser, setRememberedUser] = useState(getRememberedUser);
  const [username, setUsername] = useState(() => getRememberedUser()?.username ?? "");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (user) {
      setLocation("/", { replace: true });
    }
  }, [user, setLocation]);
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
      setLocation("/", { replace: true });
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
    <div className="h-dvh bg-zinc-100 dark:bg-black text-zinc-900 dark:text-zinc-100 font-sans flex flex-col overflow-hidden overscroll-none">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 px-4 py-3">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {user ? (
              <>
                <button
                  type="button"
                  onClick={() => goBack("/")}
                  className="p-2 -ml-2 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center text-lg font-bold"
                  aria-label="Back"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => goBack("/")}
                  className="text-xs font-bold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 px-2 py-1"
                >
                  {t("common.cancel")}
                </button>
              </>
            ) : (
              <div className="text-xs font-bold text-zinc-400">6S Workplace Security</div>
            )}
          </div>
          <NavActions />
        </div>
      </header>

      {/* Main Login Form Container */}
      <main className="flex-1 flex items-center justify-center p-4 overflow-y-auto">
        <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl shadow-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col">
          <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 text-center">
            <div className="w-12 h-12 bg-rose-600 text-white rounded-2xl mx-auto flex items-center justify-center font-black text-xl mb-3 shadow-lg shadow-rose-600/30">
              6S
            </div>
            <h1 className="text-xl font-black text-zinc-900 dark:text-zinc-100">
              {t("auth.login")}
            </h1>
            <p className="text-xs text-zinc-500 mt-1">Active Directory (AD) & Local</p>
          </div>

          <form onSubmit={handleLogin} className="p-6 space-y-4">
            {errorMsg && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs font-bold text-rose-700 dark:text-rose-300">
                {errorMsg}
              </div>
            )}

            {rememberedUser ? (
              <div className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 rounded-2xl">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center shrink-0 text-base uppercase">
                    {rememberedUser.full_name?.[0] || rememberedUser.username[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                      {rememberedUser.full_name || rememberedUser.username}
                    </div>
                    <div className="text-xs text-zinc-500 truncate">@{rememberedUser.username}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    clearRememberedUser();
                    setRememberedUser(null);
                    setUsername("");
                    setPassword("");
                  }}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 p-2 shrink-0"
                >
                  {t("auth.switch_account")}
                </button>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                  {t("auth.username")} *
                </label>
                <input
                  type="text"
                  autoCapitalize="none"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin, CN0012, worker01"
                  className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3.5 text-base text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[52px]"
                />
              </div>
            )}
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
      </main>
    </div>
  );
}
