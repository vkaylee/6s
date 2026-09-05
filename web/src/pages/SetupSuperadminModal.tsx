import { useState } from "react";
import { apiClient } from "../api/client.ts";
import { type UserProfile, useAuthStore } from "../store/authStore.ts";
import { haptics } from "../utils/haptics.ts";

interface SetupSuperadminModalProps {
  isOpen: boolean;
  onSuccess: () => void;
}

export function SetupSuperadminModal({ isOpen, onSuccess }: SetupSuperadminModalProps) {
  const { setAuth } = useAuthStore();
  const [username, setUsername] = useState("admin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!isOpen) {
    return null;
  }

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !fullName.trim() || !password.trim()) {
      setErrorMsg("Vui lòng điền đầy đủ các thông tin bắt buộc (*)");
      return;
    }

    if (username.trim().length < 3) {
      setErrorMsg("Tên tài khoản tối thiểu 3 ký tự");
      return;
    }

    if (password.length < 8) {
      setErrorMsg("Mật khẩu tối thiểu 8 ký tự");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg("Mật khẩu xác nhận không khớp");
      return;
    }

    setIsLoading(true);
    setErrorMsg("");

    try {
      const res = await apiClient<{
        access_token: string;
        refresh_token: string;
        user: UserProfile;
      }>("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          full_name: fullName.trim(),
          email: email.trim(),
          password: password,
        }),
        skipAuth: true,
      });

      haptics.success();
      await setAuth(res.user, res.access_token, res.refresh_token);
      onSuccess();
    } catch (err: unknown) {
      haptics.errorOrConflict();
      if (typeof err === "object" && err !== null && "message" in err) {
        setErrorMsg((err as { message: string }).message);
      } else {
        setErrorMsg("Khởi tạo tài khoản thất bại");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 text-center">
          <div className="w-14 h-14 bg-gradient-to-tr from-amber-600 to-rose-600 text-white rounded-2xl mx-auto flex items-center justify-center font-black text-2xl mb-3 shadow-lg shadow-rose-600/30">
            👑
          </div>
          <h2 className="text-xl font-black text-zinc-900 dark:text-zinc-100">
            Khởi tạo Superadmin
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            Hệ thống chưa có quản trị viên. Vui lòng thiết lập tài khoản quản trị tối cao ban đầu.
          </p>
        </div>

        <form onSubmit={handleSetup} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs font-bold text-rose-700 dark:text-rose-300">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
              Tên tài khoản (Username) *
            </label>
            <input
              type="text"
              autoCapitalize="none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="VD: admin"
              className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-rose-500 min-h-[48px]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
              Họ và tên *
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="VD: Quản Trị Viên Hệ Thống"
              className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-rose-500 min-h-[48px]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
              Email (tùy chọn)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="VD: admin@factory.lan"
              className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-rose-500 min-h-[48px]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                Mật khẩu *
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tối thiểu 8 ký tự"
                className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-rose-500 min-h-[48px]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                Xác nhận mật khẩu *
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Nhập lại mật khẩu"
                className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-rose-500 min-h-[48px]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-black text-sm p-3.5 rounded-xl shadow-lg shadow-rose-600/30 transition-all flex items-center justify-center space-x-2 disabled:opacity-50 min-h-[52px]"
          >
            {isLoading ? (
              <span className="inline-block animate-spin">⏳</span>
            ) : (
              <span>Khởi tạo Quản trị viên & Bắt đầu</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
