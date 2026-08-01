"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, MoreHorizontal, SquarePen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/features/auth/auth-provider";
import { VisualFeedbackWordmark } from "@/features/feedback/visual-feedback-provider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type AppHeaderProps = {
  pathname: string;
  onFocusWriting: () => void;
};

export function AppHeader({ pathname, onFocusWriting }: AppHeaderProps) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const onHome = pathname === "/";
  const identity = user?.displayName || user?.email || "Sesion local";

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-30 flex min-h-14 items-center gap-3 bg-zinc-50/80 px-3 backdrop-blur sm:px-5">
      <Link
        href="/"
        className="flex h-10 items-center rounded-md px-2 outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
        aria-label="Ir a Inicio"
      >
        <VisualFeedbackWordmark />
      </Link>
      <div className="ml-auto flex items-center gap-2">
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
            <DropdownMenuItem asChild>
              <Link href="/notes/archive">
                <Archive className="mr-2 h-4 w-4" aria-hidden="true" />
                Archivo
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleLogout}>Cerrar sesion</DropdownMenuItem>
            <DropdownMenuItem disabled>Preferencias</DropdownMenuItem>
            <DropdownMenuItem disabled>Sincronizacion futura</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
