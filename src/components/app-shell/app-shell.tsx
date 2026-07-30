"use client";

import { usePathname, useRouter } from "next/navigation";
import { SquarePen } from "lucide-react";
import type React from "react";
import { useCallback, useEffect } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppHeader } from "@/components/app-shell/app-header";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { Button } from "@/components/ui/button";
import { AuthGuard, isPublicAuthRoute } from "@/features/auth/auth-guard";
import { AuthProvider } from "@/features/auth/auth-provider";
import { requestFullCaptureFocus } from "@/features/capture/capture-events";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppShellContent>{children}</AppShellContent>
    </AuthProvider>
  );
}

function AppShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const publicAuthRoute = isPublicAuthRoute(pathname);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      }).catch(() => undefined);
    }
  }, []);

  const focusFullCapture = useCallback(() => {
    if (pathname === "/") {
      if (window.location.hash !== "#capture") {
        history.replaceState(null, "", "/#capture");
      }

      requestFullCaptureFocus();
      return;
    }

    router.push("/#capture");
  }, [pathname, router]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const key = typeof event.key === "string"
        ? event.key.toLowerCase()
        : "";
      const isShortcut =
        key === "k" &&
        event.shiftKey === true &&
        (event.ctrlKey === true || event.metaKey === true);

      if (!isShortcut) {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      event.preventDefault();
      focusFullCapture();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [focusFullCapture]);

  if (publicAuthRoute) {
    return (
      <TooltipProvider delayDuration={200}>
        {children}
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <AuthGuard>
        <div className="min-h-screen bg-zinc-50 text-zinc-950">
          <div className="flex min-h-screen">
            <AppSidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <AppHeader
                pathname={pathname}
                onFocusWriting={focusFullCapture}
              />
              <main className="flex flex-1">{children}</main>
            </div>
          </div>
          <Button
            type="button"
            size="icon"
            className="fixed bottom-5 right-5 z-40 shadow-lg md:hidden"
            aria-label="Empezar a escribir"
            onClick={focusFullCapture}
          >
            <SquarePen className="h-5 w-5" />
          </Button>
        </div>
      </AuthGuard>
    </TooltipProvider>
  );
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();

  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
}
