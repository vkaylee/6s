import type { ReactNode } from "react";
import { StatusBar } from "./StatusBar.tsx";

interface AppShellProps {
  children: ReactNode;
  globalOverlay?: ReactNode;
  onOpenDrawer: () => void;
  showStatusBar?: boolean;
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
}

export function AppShell({
  children,
  globalOverlay,
  onOpenDrawer,
  showStatusBar = true,
  searchQuery,
  onSearchChange,
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-black text-zinc-900 dark:text-zinc-100 font-sans">
      {showStatusBar && (
        <StatusBar
          onOpenDrawer={onOpenDrawer}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
        />
      )}
      {children}
      {globalOverlay}
    </div>
  );
}
