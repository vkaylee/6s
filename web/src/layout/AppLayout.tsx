import { type ReactNode, useEffect } from "react";
import { useLocation } from "wouter";
import { AppShell } from "../components/AppShell.tsx";
import { OfflineOutboxDrawer } from "../components/OfflineOutboxDrawer.tsx";
import type { DraftResolve } from "../db/indexeddb.ts";

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo(0, 0);
    }
  }, [location]);
  return null;
}

interface AppLayoutProps {
  children: ReactNode;
  showStatusBar: boolean;
  onOpenDrawer: () => void;
  onCloseDrawer: () => void;
  isDrawerOpen: boolean;
  onResolveConflict: (resolve: DraftResolve) => void;
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
}

export function AppLayout({
  children,
  showStatusBar,
  onOpenDrawer,
  onCloseDrawer,
  isDrawerOpen,
  onResolveConflict,
  searchQuery,
  onSearchChange,
}: AppLayoutProps) {
  return (
    <>
      <ScrollToTop />
      <AppShell
        showStatusBar={showStatusBar}
        onOpenDrawer={onOpenDrawer}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        globalOverlay={
          <OfflineOutboxDrawer
            isOpen={isDrawerOpen}
            onClose={onCloseDrawer}
            onResolveConflict={onResolveConflict}
          />
        }
      >
        {children}
      </AppShell>
    </>
  );
}
