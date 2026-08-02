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
        className="flex h-10 items-center rounded-md px-2 text-base font-medium tracking-[0.18em] text-zinc-800"
      >
        VN
      </Link>
      <p className="mt-5 px-2 text-xs leading-5 text-zinc-500">
        La exploracion comienza al abrir un concepto.
      </p>
    </div>
  );
}
