import type { ReactNode } from "react";
import { StatusBar } from "./StatusBar.tsx";

interface AppShellProps {
  children: ReactNode;
  globalOverlay?: ReactNode;
  onOpenDrawer: () => void;
  onNavigate?: (path: string) => void;
  showStatusBar?: boolean;
}

export function AppShell({
  children,
  globalOverlay,
  onOpenDrawer,
  onNavigate,
  showStatusBar = true,
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-black text-zinc-900 dark:text-zinc-100 font-sans">
      {showStatusBar && <StatusBar onOpenDrawer={onOpenDrawer} onNavigate={onNavigate} />}
      {children}
      {globalOverlay}
    </div>
  );
}
