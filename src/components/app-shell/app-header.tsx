"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, MoreHorizontal, SquarePen } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const online = useOnlineStatus();

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-30 flex min-h-14 items-center gap-3 bg-zinc-50/80 px-3 backdrop-blur sm:px-5">
      <Link
        href="/"
        className="flex h-10 items-center gap-2 rounded-md px-2 text-sm font-semibold text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
        aria-label="Ir a Inicio"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-900 text-xs font-semibold text-white">
          V
        </span>
        <span className="hidden sm:inline">Vinema</span>
      </Link>
      <div className="ml-auto flex items-center gap-2">
        {!online ? (
          <span
            className="hidden rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 sm:inline-flex"
            aria-live="polite"
          >
            Modo local
          </span>
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

function useOnlineStatus() {
  const [online, setOnline] = useState(() => {
    if (typeof navigator === "undefined") {
      return true;
    }

    return navigator.onLine;
  });

  useEffect(() => {
    function updateOnlineStatus() {
      setOnline(navigator.onLine);
    }

    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  return online;
}
