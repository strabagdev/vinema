"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Archive } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Node } from "@/domain/node/node";
import { archiveNode } from "@/features/node/archive-node";
import { updateNode } from "@/features/node/update-node";
import { useNode } from "@/features/node/hooks/use-node";
import { useVinemaContext } from "@/features/node/hooks/use-vinema-context";
import { getNodeIdFromSearchParams } from "@/features/node/node-routes";
import { nodeRepository } from "@/infrastructure/repositories";
import { formatShortDate } from "@/components/app-shell/note-list-item";

type Draft = {
  nodeId: string;
  title: string;
  content: string;
};

export function NoteDetailClient() {
  const searchParams = useSearchParams();
  const nodeId = getNodeIdFromSearchParams(searchParams);

  if (!nodeId) {
    return (
      <NoteDetailMessage
        title="Falta la nota"
        message="La URL no incluye un identificador de nota valido."
      />
    );
  }

  return <NoteDetailLoader nodeId={nodeId} />;
}

function NoteDetailLoader({ nodeId }: { nodeId: string }) {
  const router = useRouter();
  const context = useVinemaContext();
  const { node, loading, error, setNode } = useNode(nodeId);

  if (loading) {
    return (
      <section className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
          Cargando nota...
        </div>
      </section>
    );
  }

  if (context.status === "error") {
    return (
      <NoteDetailMessage
        title="No se pudo cargar Vinema"
        message={context.error}
      />
    );
  }

  if (!node) {
    return (
      <NoteDetailMessage
        title="Nota no encontrada"
        message={
          error ?? "Puede haber sido archivada o no existe en este dispositivo."
        }
      />
    );
  }

  if (node.status === "ARCHIVED") {
    return (
      <NoteDetailMessage
        title="Nota archivada"
        message="Esta nota esta archivada y no aparece en el listado activo."
      />
    );
  }

  if (context.status !== "ready") {
    return (
      <section className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
          Cargando contexto local...
        </div>
      </section>
    );
  }

  return (
    <NoteDetailView
      node={node}
      onSave={async ({ title, content }) => {
        const updatedNode = await updateNode(nodeRepository, {
          id: node.id,
          title,
          content,
          device: context.device,
        });
        setNode(updatedNode);
        return updatedNode;
      }}
      onArchive={async () => {
        await archiveNode(nodeRepository, node.id, context.device);
        router.push("/notes");
      }}
    />
  );
}

export function NoteDetailView({
  node,
  onSave,
  onArchive,
}: {
  node: Node;
  onSave: (draft: Pick<Draft, "title" | "content">) => Promise<Node>;
  onArchive: () => Promise<void>;
}) {
  const [persistedNode, setPersistedNode] = useState(node);
  const [mode, setMode] = useState<"read" | "edit">("read");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const title =
    mode === "edit" && draft?.nodeId === persistedNode.id
      ? draft.title
      : persistedNode.title;
  const content =
    mode === "edit" && draft?.nodeId === persistedNode.id
      ? draft.content
      : persistedNode.content;

  function beginEdit() {
    setDraft({
      nodeId: persistedNode.id,
      title: persistedNode.title,
      content: persistedNode.content,
    });
    setFeedback(null);
    setFormError(null);
    setMode("edit");
  }

  function cancelEdit() {
    setDraft(null);
    setFeedback(null);
    setFormError(null);
    setMode("read");
  }

  async function handleSave() {
    if (saving || mode !== "edit") {
      return;
    }

    setSaving(true);
    setFormError(null);
    setFeedback("Guardando...");

    try {
      const updatedNode = await onSave({ title, content });
      setPersistedNode(updatedNode);
      setDraft(null);
      setMode("read");
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
    if (saving || mode !== "read") {
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      await onArchive();
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
    if (
      mode === "edit" &&
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === "s"
    ) {
      event.preventDefault();
      handleSave();
    }
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
              {mode === "edit" ? "Editar nota" : displayTitle(persistedNode)}
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              Actualizada {formatShortDate(persistedNode.updatedAt)}
            </p>
          </div>
        </div>
        {mode === "read" ? (
          <div className="flex gap-2">
            <Button variant="ghost" asChild>
              <Link href="/notes">← Volver</Link>
            </Button>
            <Button variant="secondary" onClick={beginEdit}>
              Editar
            </Button>
            <Button variant="ghost" onClick={handleArchive} disabled={saving}>
              <Archive className="h-4 w-4" />
              Archivar
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={cancelEdit} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        )}
      </div>

      {formError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>
      ) : null}
      {feedback ? (
        <p className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600">
          {feedback}
        </p>
      ) : null}

      {mode === "read" ? (
        <article className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="prose prose-zinc max-w-none whitespace-pre-wrap text-sm leading-7 text-zinc-800">
            {persistedNode.content.trim() || "Sin contenido"}
          </div>
        </article>
      ) : (
        <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4">
          <Input
            value={title}
            onChange={(event) => {
              setFeedback(null);
              setDraft({
                nodeId: persistedNode.id,
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
                nodeId: persistedNode.id,
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
      )}
    </section>
  );
}

export function NoteDetailMessage({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <Badge variant="secondary">Notas</Badge>
      <h1 className="text-3xl font-semibold text-zinc-950">{title}</h1>
      <p className="text-sm text-zinc-600">{message}</p>
      <Button asChild className="w-fit">
        <Link href="/notes">Volver a notas</Link>
      </Button>
    </section>
  );
}

function displayTitle(node: Node) {
  return node.title.trim() || "Sin titulo";
}
