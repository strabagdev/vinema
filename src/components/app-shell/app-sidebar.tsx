"use client";

import Link from "next/link";

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <aside className="hidden w-52 shrink-0 border-r border-zinc-100 bg-zinc-50 lg:block">
      <SidebarContent onNavigate={onNavigate} />
    </aside>
  );
}

export function SidebarContent({
  onNavigate,
}: {
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
      <p className="mt-5 px-2 text-xs leading-5 text-zinc-500">
        La exploracion comienza al abrir un concepto.
      </p>
    </div>
  );
}
