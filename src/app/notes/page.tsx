"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NoteListItem } from "@/components/app-shell/note-list-item";
import { useNodes } from "@/features/node/hooks/use-nodes";

export default function NotesPage() {
  const { nodes, loading, error } = useNodes("active");

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <Badge variant="secondary">Notas</Badge>
          <div>
            <h1 className="text-3xl font-semibold tracking-normal text-zinc-950">
              Notas
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
              Tu archivo activo de memoria local.
            </p>
          </div>
        </div>
        <Button asChild>
          <Link href="/notes/new">
            <Plus className="h-4 w-4" />
            Nueva nota
          </Link>
        </Button>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
          Cargando notas...
        </div>
      ) : nodes.length > 0 ? (
        <div className="space-y-3">
          {nodes.map((node) => (
            <NoteListItem key={node.id} node={node} />
          ))}
        </div>
      ) : (
        <div className="flex min-h-72 items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-white">
          <div className="max-w-sm text-center">
            <h2 className="text-lg font-medium text-zinc-950">
              Sin notas todavia
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Crea la primera nota o convierte una idea desde Inbox.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
