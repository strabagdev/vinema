"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brain, MoreHorizontal, SquarePen } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/features/auth/auth-provider";
import { MemorySyncStatusPanel } from "@/features/sync/observability/memory-sync-status-panel";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { KnowledgeManagementCenterMenuItem } from "@/components/app-shell/knowledge-management-center";

export type AppHeaderProps = {
  pathname: string;
  onFocusWriting: () => void;
};

export function AppHeader({ pathname, onFocusWriting }: AppHeaderProps) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const onHome = pathname === "/";
  const identity = user?.displayName || user?.email || "Sesion local";

  async function handleLogout() {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);
    await logout();
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-30 grid min-h-14 grid-cols-[1fr_auto_1fr] items-center gap-3 bg-zinc-50/80 px-3 backdrop-blur sm:px-5">
      <div aria-hidden="true" />
      <div className="flex justify-center">
        <MemorySyncStatusPanel />
      </div>
      <div className="flex items-center justify-end gap-2">
        {!onHome ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                onClick={onFocusWriting}
                aria-label="Empezar a escribir"
              >
                <SquarePen className="h-4 w-4" />
                <span className="hidden sm:inline">Escribir</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Ir al editor (Ctrl+Shift+K)</TooltipContent>
          </Tooltip>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Abrir menu">
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled>{identity}</DropdownMenuItem>
            <DropdownMenuItem disabled>Conocimiento</DropdownMenuItem>
            <div className="my-1 h-px bg-zinc-100" role="separator" />
            <DropdownMenuItem asChild>
              <Link href="/">Inicio</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/memory">
                <Brain className="mr-2 h-4 w-4" aria-hidden="true" />
                Explorar memoria
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/concepts">
                <Brain className="mr-2 h-4 w-4" aria-hidden="true" />
                Conceptos
              </Link>
            </DropdownMenuItem>
            <div className="my-1 h-px bg-zinc-100" role="separator" />
            <KnowledgeManagementCenterMenuItem label="Administrar" />
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
