"use client";

import type React from "react";
import { useEffect } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppHeader } from "@/components/app-shell/app-header";
import { AppSidebar } from "@/components/app-shell/app-sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      }).catch(() => undefined);
    }
  }, []);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-zinc-50 text-zinc-950">
        <div className="flex min-h-screen">
          <AppSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <AppHeader />
            <main className="flex flex-1">{children}</main>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
