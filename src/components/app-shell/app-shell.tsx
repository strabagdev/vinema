"use client";

import { usePathname, useRouter } from "next/navigation";
import type React from "react";
import { useCallback, useEffect } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppHeader } from "@/components/app-shell/app-header";
import { AuthGuard, isPublicAuthRoute } from "@/features/auth/auth-guard";
import { AuthProvider } from "@/features/auth/auth-provider";
import { requestFullCaptureFocus } from "@/features/capture/capture-events";
import {
  VisualFeedbackProvider,
  VisualFeedbackViewport,
} from "@/features/feedback/visual-feedback-provider";
import { cn } from "@/lib/cn";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <VisualFeedbackProvider>
        <AppShellContent>{children}</AppShellContent>
      </VisualFeedbackProvider>
    </AuthProvider>
  );
}

function AppShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const publicAuthRoute = isPublicAuthRoute(pathname);
  const canvasRoute = pathname === "/" || pathname === "/concepts/explore";

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
        <div
          className={cn(
            "bg-zinc-50 text-zinc-950",
            canvasRoute ? "h-dvh overflow-hidden" : "min-h-screen",
          )}
          data-app-shell={canvasRoute ? "canvas" : "document"}
        >
          <div
            className={cn(
              "flex min-w-0 flex-col",
              canvasRoute ? "h-full min-h-0" : "min-h-screen",
            )}
          >
            <AppHeader
              pathname={pathname}
              onFocusWriting={focusFullCapture}
            />
            <VisualFeedbackViewport />
            <main
              className={cn(
                "flex flex-1",
                canvasRoute ? "min-h-0 overflow-hidden" : "",
              )}
            >
              {children}
            </main>
          </div>
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
