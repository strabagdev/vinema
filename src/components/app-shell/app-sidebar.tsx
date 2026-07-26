"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, Briefcase, Inbox, NotebookText, User, WalletCards } from "lucide-react";
import { cn } from "@/lib/cn";
import { Separator } from "@/components/ui/separator";

const navItems = [
  { href: "/", label: "Vinema", icon: Archive, disabled: false },
  { href: "/inbox", label: "Inbox", icon: Inbox, disabled: false },
  { href: "/notes", label: "Notas", icon: NotebookText, disabled: false },
  { href: "/contexts/areas", label: "Areas", icon: WalletCards, disabled: false },
  { href: "/contexts/projects", label: "Proyectos", icon: Briefcase, disabled: false },
  { href: "/contexts/people", label: "Personas", icon: User, disabled: false },
];

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 border-r border-zinc-200 bg-white lg:block">
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
    <div className="flex h-full min-h-screen flex-col px-3 py-4">
      <Link
        href="/"
        onClick={onNavigate}
        className="flex h-11 items-center gap-3 rounded-md px-3 text-lg font-semibold text-zinc-950"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-950 text-sm font-semibold text-white">
          V
        </span>
        Vinema
      </Link>
      <Separator className="my-4" />
      <nav className="space-y-1">
        {navItems.slice(1).map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(`${item.href}/`));

          if (item.disabled) {
            return (
              <span
                key={item.href}
                aria-disabled="true"
                className="flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-zinc-400"
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
                "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950",
                active && "bg-zinc-100 text-zinc-950",
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
