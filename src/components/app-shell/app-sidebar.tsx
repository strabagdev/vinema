"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock3, Home } from "lucide-react";
import { cn } from "@/lib/cn";

const navItems = [
  { href: "/", label: "Inicio", icon: Home, disabled: false },
  {
    href: "/notes",
    label: "Historial",
    icon: Clock3,
    disabled: false,
  },
];

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-52 shrink-0 border-r border-zinc-100 bg-zinc-50 lg:block">
      <SidebarContent pathname={pathname} onNavigate={onNavigate} />
    </aside>
  );
}

export function SidebarContent({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full min-h-screen flex-col px-3 py-3">
      <Link
        href="/"
        onClick={onNavigate}
        className="flex h-10 items-center gap-2 rounded-md px-2 text-base font-semibold text-zinc-800"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-900 text-xs font-semibold text-white">
          V
        </span>
        Vinema
      </Link>
      <nav className="mt-5 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(`${item.href}/`));

          if (item.disabled) {
            return (
              <span
                key={item.href}
                aria-disabled="true"
                className="flex h-9 items-center gap-2 rounded-md px-2 text-sm font-medium text-zinc-400"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </span>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex h-9 items-center gap-2 rounded-md px-2 text-sm font-medium text-zinc-500 hover:bg-zinc-100/70 hover:text-zinc-900",
                active && "bg-zinc-100/70 text-zinc-900",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
