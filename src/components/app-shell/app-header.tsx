"use client";

import { MoreHorizontal, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { MobileNavigation } from "@/components/app-shell/mobile-navigation";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-zinc-200 bg-white/95 px-4 backdrop-blur sm:px-6">
      <MobileNavigation />
      <div className="relative hidden w-full max-w-md md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <Input
          disabled
          aria-label="Busqueda deshabilitada"
          className="pl-9"
          placeholder="Buscar en Vinema"
        />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Badge variant="outline">Solo local</Badge>
        <Separator orientation="vertical" className="hidden h-6 sm:block" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button disabled size="sm">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Nueva nota</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Nueva nota estara disponible en VIN-003</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Abrir menu">
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled>Preferencias</DropdownMenuItem>
            <DropdownMenuItem disabled>Sincronizacion futura</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
