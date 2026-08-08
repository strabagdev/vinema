"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VinemaBrandMark } from "@/components/brand/vinema-brand";
import { KnowledgeManagementCenterMenuItem } from "@/components/app-shell/knowledge-management-center";
import { useAuth } from "@/features/auth/auth-provider";
import { cn } from "@/lib/cn";

export type AppHeaderProps = {
  pathname: string;
  onFocusWriting: () => void;
};

export function AppHeader({ pathname, onFocusWriting }: AppHeaderProps) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const identity = user?.displayName || user?.email || "Sesion local";
  const canvasRoute = pathname === "/" || pathname === "/concepts/explore";
  void onFocusWriting;

  async function handleLogout() {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);
    await logout();
    router.replace("/login");
  }

  return (
    <header
      className={cn(
        "sticky top-0 z-30 grid min-h-14 items-center gap-3 bg-[var(--vinema-surface-background)] px-3 sm:px-5",
        canvasRoute
          ? "vinema-canvas-header-grid"
          : "grid-cols-[1fr_auto_1fr]",
      )}
      data-app-header=""
    >
      <div className="col-[1]" aria-hidden="true" />
      <div className="col-[2] flex justify-center">
        <Link
          href="/"
          className="inline-flex h-10 items-center justify-center rounded-md px-2 text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          aria-label="Vinema"
        >
          <VinemaBrandMark asset="monogram" className="h-6 w-7" decorative />
        </Link>
      </div>
      <div className="col-[3] flex items-center justify-end gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Abrir menu"
            >
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled>{identity}</DropdownMenuItem>
            <div className="my-1 h-px bg-zinc-100" role="separator" />
            <KnowledgeManagementCenterMenuItem label="Conocimiento" trigger="menu" />
            <div className="my-1 h-px bg-zinc-100" role="separator" />
            <DropdownMenuItem disabled={loggingOut} onClick={handleLogout}>
              Cerrar sesion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
