"use client";

import { useRouter } from "next/navigation";
import { MoreHorizontal, SquarePen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { MobileNavigation } from "@/components/app-shell/mobile-navigation";
import { useAuth } from "@/features/auth/auth-provider";
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
    <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-zinc-100 bg-zinc-50/80 px-4 backdrop-blur sm:px-6">
      <MobileNavigation />
      <div className="ml-auto flex items-center gap-2">
        <Badge variant="outline" className="border-zinc-200 bg-transparent text-xs text-zinc-500">
          Solo local
        </Badge>
        {!onHome ? (
          <Separator orientation="vertical" className="hidden h-6 sm:block" />
        ) : null}
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
            <DropdownMenuItem onClick={handleLogout}>Cerrar sesion</DropdownMenuItem>
            <DropdownMenuItem disabled>Preferencias</DropdownMenuItem>
            <DropdownMenuItem disabled>Sincronizacion futura</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
