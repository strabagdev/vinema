"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
import { validateEditableNode } from "@/features/node/node-validation";
import { nodeRepository } from "@/infrastructure/repositories";
import { formatShortDate } from "@/components/app-shell/note-list-item";

const AUTOSAVE_DEBOUNCE_MS = 700;

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
      onBack={() => {
        router.push("/notes");
      }}
    />
  );
}

export function NoteDetailView({
  node,
  onSave,
  onArchive,
  onBack,
}: {
  node: Node;
  onSave: (draft: Pick<Draft, "title" | "content">) => Promise<Node>;
  onArchive: () => Promise<void>;
  onBack?: () => void;
}) {
  const [persistedNode, setPersistedNode] = useState(node);
  const [mode, setMode] = useState<"read" | "edit">("read");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "dirty" | "saving" | "saved" | "error"
  >("idle");
  const [formError, setFormError] = useState<string | null>(null);
  const persistedNodeRef = useRef(persistedNode);
  const modeRef = useRef(mode);
  const draftRef = useRef<Draft | null>(draft);
  const lastSavedDraftRef = useRef(toDraft(persistedNode));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const saveAgainAfterCurrentRef = useRef(false);
  const title =
    mode === "edit" && draft?.nodeId === persistedNode.id
      ? draft.title
      : persistedNode.title;
  const content =
    mode === "edit" && draft?.nodeId === persistedNode.id
      ? draft.content
      : persistedNode.content;

  useEffect(() => {
    return () => {
      clearAutosaveTimer();
    };
  }, []);

  function setPersisted(nextNode: Node) {
    persistedNodeRef.current = nextNode;
    lastSavedDraftRef.current = toDraft(nextNode);
    setPersistedNode(nextNode);
  }

  function setModeState(nextMode: "read" | "edit") {
    modeRef.current = nextMode;
    setMode(nextMode);
  }

  function setDraftState(nextDraft: Draft | null) {
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  }

  function clearAutosaveTimer() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }

  function beginEdit() {
    setDraftState(toDraft(persistedNodeRef.current));
    setSaveStatus("idle");
    setFormError(null);
    setModeState("edit");
  }

  function cancelEdit() {
    clearAutosaveTimer();
    saveAgainAfterCurrentRef.current = false;
    setDraftState(null);
    setSaveStatus("idle");
    setFormError(null);
    setModeState("read");
  }

  function updateDraft(nextDraft: Draft) {
    setDraftState(nextDraft);
    setFormError(null);

    if (isSameDraft(nextDraft, lastSavedDraftRef.current)) {
      clearAutosaveTimer();
      setSaveStatus("saved");
      return;
    }

    setSaveStatus("dirty");
    scheduleAutosave();
  }

  function scheduleAutosave() {
    clearAutosaveTimer();
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void saveDraft({ exitEditMode: false });
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  async function saveDraft({ exitEditMode }: { exitEditMode: boolean }) {
    if (modeRef.current !== "edit") {
      return false;
    }

    const currentDraft = draftRef.current;

    if (!currentDraft) {
      if (exitEditMode) {
        setModeState("read");
      }
      return true;
    }

    clearAutosaveTimer();

    if (isSameDraft(currentDraft, lastSavedDraftRef.current)) {
      setSaveStatus(exitEditMode ? "idle" : "saved");
      if (exitEditMode) {
        setDraftState(null);
        setModeState("read");
      }
      return true;
    }

    try {
      validateEditableNode({
        title: currentDraft.title,
        content: currentDraft.content,
        organizationStatus: "ORGANIZED",
      });
    } catch (caughtError) {
      setSaveStatus("dirty");
      setFormError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo validar la nota.",
      );
      return false;
    }

    if (savingRef.current) {
      saveAgainAfterCurrentRef.current = true;
      return false;
    }

    const saveSnapshot = currentDraft;
    savingRef.current = true;
    setFormError(null);
    setSaveStatus("saving");

    try {
      const updatedNode = await onSave({
        title: saveSnapshot.title,
        content: saveSnapshot.content,
      });
      setPersisted(updatedNode);

      const latestDraft = draftRef.current;
      const latestMode = modeRef.current;

      if (latestMode !== "edit") {
        setDraftState(null);
        setSaveStatus("idle");
        return true;
      }

      if (latestDraft && isSameDraft(latestDraft, saveSnapshot)) {
        setDraftState(toDraft(updatedNode));
        setSaveStatus("saved");

        if (exitEditMode) {
          setDraftState(null);
          setModeState("read");
          setSaveStatus("idle");
        }
      } else {
        setSaveStatus("dirty");
        scheduleAutosave();
      }

      return true;
    } catch (caughtError) {
      setSaveStatus("error");
      setFormError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo guardar la nota.",
      );
      return false;
    } finally {
      savingRef.current = false;

      if (saveAgainAfterCurrentRef.current && modeRef.current === "edit") {
        saveAgainAfterCurrentRef.current = false;
        const latestDraft = draftRef.current;

        if (latestDraft && !isSameDraft(latestDraft, lastSavedDraftRef.current)) {
          setSaveStatus("dirty");
          scheduleAutosave();
        }
      }
    }
  }

  async function handleDone() {
    await saveDraft({ exitEditMode: true });
  }

  async function handleKeyboardSave() {
    await saveDraft({ exitEditMode: false });
  }

  async function handleBack() {
    if (modeRef.current !== "edit") {
      onBack?.();
      return;
    }

    const saved = await saveDraft({ exitEditMode: false });

    if (saved) {
      onBack?.();
    }
  }

  async function handleArchive() {
    if (savingRef.current || mode !== "read") {
      return;
    }

    savingRef.current = true;
    setFormError(null);

    try {
      await onArchive();
    } catch (caughtError) {
      setFormError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo archivar la nota.",
      );
      savingRef.current = false;
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (
      mode === "edit" &&
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === "s"
    ) {
      event.preventDefault();
      void handleKeyboardSave();
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
            <Button variant="ghost" onClick={handleBack}>
              ← Volver
            </Button>
            <Button variant="secondary" onClick={beginEdit}>
              Editar
            </Button>
            <Button variant="ghost" onClick={handleArchive} disabled={savingRef.current}>
              <Archive className="h-4 w-4" />
              Archivar
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:items-end">
            <SaveStatusIndicator status={saveStatus} />
            <div className="flex gap-2">
              <Button variant="ghost" onClick={handleBack} disabled={saveStatus === "saving"}>
                ← Volver
              </Button>
              <Button
                variant="ghost"
                onClick={cancelEdit}
                disabled={saveStatus === "saving"}
              >
                Cancelar
              </Button>
              <Button onClick={handleDone} disabled={saveStatus === "saving"}>
                Listo
              </Button>
            </div>
          </div>
        )}
      </div>

      {formError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
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
              updateDraft({
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
              updateDraft({
                nodeId: persistedNode.id,
                title,
                content: event.target.value,
              });
            }}
            placeholder="Contenido"
            aria-label="Contenido"
            className="min-h-[420px] resize-y text-base leading-7"
          />
          <p className="text-xs text-zinc-500">
            Ctrl+S o Cmd+S guarda y mantiene la edicion abierta.
          </p>
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

function SaveStatusIndicator({
  status,
}: {
  status: "idle" | "dirty" | "saving" | "saved" | "error";
}) {
  if (status === "idle") {
    return null;
  }

  const labelByStatus = {
    dirty: "Cambios sin guardar",
    saving: "Guardando...",
    saved: "Guardado",
    error: "Error al guardar",
  } satisfies Record<Exclude<typeof status, "idle">, string>;

  return (
    <p className="text-sm font-medium text-zinc-600" role="status">
      {labelByStatus[status]}
    </p>
  );
}

function toDraft(node: Node): Draft {
  return {
    nodeId: node.id,
    title: node.title,
    content: node.content,
  };
}

function isSameDraft(
  first: Pick<Draft, "title" | "content">,
  second: Pick<Draft, "title" | "content">,
) {
  return first.title === second.title && first.content === second.content;
}
