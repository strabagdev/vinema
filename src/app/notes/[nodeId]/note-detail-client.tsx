"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { archiveNode } from "@/features/node/archive-node";
import { updateNode } from "@/features/node/update-node";
import { useNode } from "@/features/node/hooks/use-node";
import { useVinemaContext } from "@/features/node/hooks/use-vinema-context";
import { nodeRepository } from "@/infrastructure/repositories";
import { formatShortDate } from "@/components/app-shell/note-list-item";

export function NoteDetailClient({ nodeId }: { nodeId: string }) {
  const router = useRouter();
  const context = useVinemaContext();
  const { node, loading, error, setNode } = useNode(nodeId);
  const [draft, setDraft] = useState<{
    nodeId: string;
    title: string;
    content: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const hasDraftForNode = Boolean(draft && node && draft.nodeId === node.id);
  const title = hasDraftForNode && draft ? draft.title : node?.title ?? "";
  const content =
    hasDraftForNode && draft ? draft.content : node?.content ?? "";

  async function handleSave() {
    if (!node || saving || context.status !== "ready") {
      return;
    }

    setSaving(true);
    setFormError(null);
    setFeedback("Guardando...");

    try {
      const updatedNode = await updateNode(nodeRepository, {
        id: node.id,
        title,
        content,
        device: context.device,
      });
      setNode(updatedNode);
      setDraft({
        nodeId: updatedNode.id,
        title: updatedNode.title,
        content: updatedNode.content,
      });
      setFeedback("Cambios guardados.");
    } catch (caughtError) {
      setFeedback(null);
      setFormError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo guardar la nota.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!node || saving || context.status !== "ready") {
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      await archiveNode(nodeRepository, node.id, context.device);
      router.push("/notes");
    } catch (caughtError) {
      setFormError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo archivar la nota.",
      );
      setSaving(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      handleSave();
    }
  }

  const visibleError =
    context.status === "error" ? context.error : formError ?? error;

  if (loading) {
    return (
      <section className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
          Cargando nota...
        </div>
      </section>
    );
  }

  if (!node) {
    return (
      <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
        <Badge variant="secondary">Notas</Badge>
        <h1 className="text-3xl font-semibold text-zinc-950">Nota no encontrada</h1>
        <p className="text-sm text-zinc-600">
          Puede haber sido archivada o no existe en este dispositivo.
        </p>
        <Button asChild className="w-fit">
          <Link href="/notes">Volver a notas</Link>
        </Button>
      </section>
    );
  }

  return (
    <section
      className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8"
      onKeyDown={handleKeyDown}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <Badge variant="secondary">Notas</Badge>
          <div>
            <h1 className="text-3xl font-semibold tracking-normal text-zinc-950">
              Editar nota
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              Actualizada {formatShortDate(node.updatedAt)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" asChild>
            <Link href="/notes">Cancelar</Link>
          </Button>
          <Button variant="secondary" onClick={handleArchive} disabled={saving}>
            <Archive className="h-4 w-4" />
            Archivar
          </Button>
          <Button onClick={handleSave} disabled={saving || context.status !== "ready"}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </div>

      {visibleError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {visibleError}
        </p>
      ) : null}
      {feedback ? (
        <p className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600">
          {feedback}
        </p>
      ) : null}

      <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4">
        <Input
          value={title}
          onChange={(event) => {
            setFeedback(null);
            setDraft({
              nodeId: node.id,
              title: event.target.value,
              content,
            });
          }}
          placeholder="Titulo"
          aria-label="Titulo"
          className="h-12 text-lg"
        />
        <Textarea
          value={content}
          onChange={(event) => {
            setFeedback(null);
            setDraft({
              nodeId: node.id,
              title,
              content: event.target.value,
            });
          }}
          placeholder="Contenido"
          aria-label="Contenido"
          className="min-h-[420px] resize-y text-base leading-7"
        />
        <p className="text-xs text-zinc-500">Ctrl+S o Cmd+S para guardar.</p>
      </div>
    </section>
  );
}
