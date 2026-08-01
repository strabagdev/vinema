"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Clock3, Home, MoreHorizontal, SquarePen } from "lucide-react";
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
import { cn } from "@/lib/cn";

export type AppHeaderProps = {
  pathname: string;
  onFocusWriting: () => void;
};

const primaryNavItems = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/notes", label: "Explorar", icon: Clock3 },
  { href: "/notes/archive", label: "Archivo", icon: Archive },
];

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
      <nav
        className="flex items-center gap-1"
        aria-label="Navegacion principal"
      >
        {primaryNavItems.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(`${item.href}/`));

          return (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>
                <Link
                  href={item.href}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-10 w-10 items-center justify-center rounded-md text-zinc-500 outline-none transition-colors hover:bg-zinc-100/70 hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400",
                    active && "bg-zinc-100/70 text-zinc-950",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">{item.label}</span>
                </Link>
              </TooltipTrigger>
              <TooltipContent>{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
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
