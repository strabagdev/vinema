"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Context, ContextType } from "@/domain/context/context";
import type { Node } from "@/domain/node/node";
import { getCaptureTimestamps } from "@/features/capture/capture-timestamps";
import { getContextDetailPath } from "@/features/context/context-routes";
import { listContextsByType } from "@/features/context/list-contexts";
import {
  attachNodeToContext,
  detachNodeFromContext,
  listContextsForNode,
} from "@/features/context/node-context-relations";
import { archiveNode } from "@/features/node/archive-node";
import { restoreNode } from "@/features/node/restore-node";
import { updateNode } from "@/features/node/update-node";
import { useNode } from "@/features/node/hooks/use-node";
import { useVinemaContext } from "@/features/node/hooks/use-vinema-context";
import { getNodeIdFromSearchParams } from "@/features/node/node-routes";
import { getReturnToFromSearchParams } from "@/features/recovery/recovery-routes";
import { validateEditableNode } from "@/features/node/node-validation";
import {
  contextRepository,
  createLocalSyncRepositorySet,
  nodeContextRelationRepository,
} from "@/infrastructure/repositories";
import { formatShortDate } from "@/components/app-shell/note-list-item";

const AUTOSAVE_DEBOUNCE_MS = 700;

type Draft = {
  nodeId: string;
  content: string;
};

export function NoteDetailClient() {
  const searchParams = useSearchParams();
  const nodeId = getNodeIdFromSearchParams(searchParams);
  const returnTo = getReturnToFromSearchParams(searchParams);

  if (!nodeId) {
    return (
      <NoteDetailMessage
        heading="Falta la captura"
        message="La URL no incluye un identificador de captura valido."
      />
    );
  }

  return <NoteDetailLoader nodeId={nodeId} returnTo={returnTo} />;
}

function NoteDetailLoader({
  nodeId,
  returnTo,
}: {
  nodeId: string;
  returnTo: string | null;
}) {
  const router = useRouter();
  const context = useVinemaContext();
  const { node, loading, error, setNode } = useNode(nodeId);
  const localRepositories = useMemo(() => {
    if (context.status !== "ready") {
      return null;
    }

    return createLocalSyncRepositorySet({
      workspaceId: context.workspace.id,
      deviceId: context.device.id,
    });
  }, [context]);
  const [relatedContexts, setRelatedContexts] = useState<Context[]>([]);
  const [contextOptions, setContextOptions] = useState<Context[]>([]);
  const [contextError, setContextError] = useState<string | null>(null);

  const loadNoteContexts = useCallback(
    async (nextNodeId: string, workspaceId: string) => {
      setContextError(null);

      try {
        const [related, areaOptions, projectOptions, personOptions] =
          await Promise.all([
            listContextsForNode(
              { contextRepository, nodeContextRelationRepository },
              { nodeId: nextNodeId, includeArchived: true },
            ),
            listContextsByType(contextRepository, {
              workspaceId,
              type: "AREA",
            }),
            listContextsByType(contextRepository, {
              workspaceId,
              type: "PROJECT",
            }),
            listContextsByType(contextRepository, {
              workspaceId,
              type: "PERSON",
            }),
          ]);
        setRelatedContexts(
          related.filter((item) => item.workspaceId === workspaceId),
        );
        setContextOptions([...areaOptions, ...projectOptions, ...personOptions]);
      } catch {
        setContextError("No se pudieron cargar las relaciones de la captura.");
      }
    },
    [],
  );
  useEffect(() => {
    if (context.status !== "ready" || !node) {
      return;
    }

    queueMicrotask(() => {
      void loadNoteContexts(node.id, context.workspace.id);
    });
  }, [context, loadNoteContexts, node]);

  if (loading) {
    return (
      <section className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
          Cargando captura...
        </div>
      </section>
    );
  }

  if (context.status === "error") {
    return (
      <NoteDetailMessage
        heading="No se pudo cargar Vinema"
        message={context.error}
      />
    );
  }

  if (!node) {
    return (
      <NoteDetailMessage
        heading="Captura no encontrada"
        message={
          error ?? "Puede haber sido archivada o no existe en este dispositivo."
        }
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

  if (!localRepositories) {
    return (
      <section className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
          Cargando sincronizacion local...
        </div>
      </section>
    );
  }

  return (
    <NoteDetailView
      node={node}
      relatedContexts={relatedContexts}
      contextOptions={contextOptions}
      contextError={contextError}
      onSave={async ({ content }) => {
        const updatedNode = await updateNode(localRepositories.nodeRepository, {
          id: node.id,
          content,
          device: context.device,
        });
        setNode(updatedNode);
        return updatedNode;
      }}
      onArchive={async () => {
        await archiveNode(localRepositories.nodeRepository, node.id, context.device);
        router.push(returnTo ?? "/notes");
      }}
      onRestore={async () => {
        const restored = await restoreNode(
          localRepositories.nodeRepository,
          node.id,
          context.device,
        );
        setNode(restored);
        return restored;
      }}
      onSaveContextRelations={async (selectedContextIds) => {
        const persistedContextIds = new Set(
          relatedContexts.map((relatedContext) => relatedContext.id),
        );
        const nextContextIds = new Set(selectedContextIds);
        const toAttach = selectedContextIds.filter(
          (contextId) => !persistedContextIds.has(contextId),
        );
        const toDetach = relatedContexts
          .filter((relatedContext) => !nextContextIds.has(relatedContext.id))
          .map((relatedContext) => relatedContext.id);

        await Promise.all([
          ...toAttach.map((contextId) =>
            attachNodeToContext(
              {
                contextRepository: localRepositories.contextRepository,
                nodeContextRelationRepository:
                  localRepositories.nodeContextRelationRepository,
                nodeRepository: localRepositories.nodeRepository,
              },
              { nodeId: node.id, contextId },
            ),
          ),
          ...toDetach.map((contextId) =>
            detachNodeFromContext(localRepositories.nodeContextRelationRepository, {
              nodeId: node.id,
              contextId,
            }),
          ),
        ]);

        await loadNoteContexts(node.id, context.workspace.id);
      }}
      onBack={() => {
        router.push(returnTo ?? "/notes");
      }}
    />
  );
}

export function NoteDetailView({
  node,
  relatedContexts = [],
  contextOptions = [],
  contextError = null,
  onSave,
  onSaveContextRelations,
  onArchive,
  onRestore,
  onBack,
}: {
  node: Node;
  relatedContexts?: Context[];
  contextOptions?: Context[];
  contextError?: string | null;
  onSave: (draft: Pick<Draft, "content">) => Promise<Node>;
  onSaveContextRelations?: (selectedContextIds: string[]) => Promise<void>;
  onArchive: () => Promise<void>;
  onRestore?: () => Promise<Node>;
  onBack?: () => void;
}) {
  const [persistedNode, setPersistedNode] = useState(node);
  const [mode, setMode] = useState<"read" | "edit">("read");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "dirty" | "saving" | "saved" | "error"
  >("idle");
  const [formError, setFormError] = useState<string | null>(null);
  const [archiveConfirmationVisible, setArchiveConfirmationVisible] =
    useState(false);
  const [restoreFeedback, setRestoreFeedback] = useState<string | null>(null);
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>(
    relatedContexts.map((context) => context.id),
  );
  const selectedContextIdsRef = useRef(selectedContextIds);
  const persistedNodeRef = useRef(persistedNode);
  const modeRef = useRef(mode);
  const draftRef = useRef<Draft | null>(draft);
  const lastSavedDraftRef = useRef(toDraft(persistedNode));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const saveAgainAfterCurrentRef = useRef(false);
  const content =
    mode === "edit" && draft?.nodeId === persistedNode.id
      ? draft.content
      : persistedNode.content;
  const relationOptions = mergeContextOptions(contextOptions, relatedContexts);

  useEffect(() => {
    return () => {
      clearAutosaveTimer();
    };
  }, []);

  useEffect(() => {
    if (modeRef.current === "edit") {
      return;
    }

    setSelectedContexts(relatedContexts.map((context) => context.id));
  }, [relatedContexts]);

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

  function setSelectedContexts(nextContextIds: string[]) {
    selectedContextIdsRef.current = nextContextIds;
    setSelectedContextIds(nextContextIds);
  }

  function clearAutosaveTimer() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }

  function beginEdit() {
    if (persistedNodeRef.current.status === "ARCHIVED") {
      return;
    }

    setDraftState(toDraft(persistedNodeRef.current));
    setSelectedContexts(relatedContexts.map((context) => context.id));
    setSaveStatus("idle");
    setFormError(null);
    setModeState("edit");
  }

  function cancelEdit() {
    clearAutosaveTimer();
    saveAgainAfterCurrentRef.current = false;
    setDraftState(null);
    setSelectedContexts(relatedContexts.map((context) => context.id));
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
        content: currentDraft.content,
        organizationStatus: "ORGANIZED",
      });
    } catch (caughtError) {
      setSaveStatus("dirty");
      setFormError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo validar la captura.",
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
          : "No se pudo guardar la captura.",
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
    const saved = await saveDraft({ exitEditMode: false });

    if (!saved) {
      return;
    }

    if (onSaveContextRelations) {
      try {
        setSaveStatus("saving");
        await onSaveContextRelations(selectedContextIdsRef.current);
      } catch (caughtError) {
        setSaveStatus("error");
        setFormError(
          caughtError instanceof Error
            ? caughtError.message
            : "No se pudieron guardar los contextos.",
        );
        return;
      }
    }

    setDraftState(null);
    setModeState("read");
    setSaveStatus("idle");
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

    if (!archiveConfirmationVisible) {
      setArchiveConfirmationVisible(true);
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
          : "No se pudo archivar la captura.",
      );
      savingRef.current = false;
    }
  }

  async function handleRestore() {
    if (savingRef.current || mode !== "read" || !onRestore) {
      return;
    }

    savingRef.current = true;
    setFormError(null);
    setRestoreFeedback(null);

    try {
      const restored = await onRestore();
      setPersisted(restored);
      setRestoreFeedback("Captura restaurada.");
    } catch (caughtError) {
      setFormError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo restaurar la captura.",
      );
    } finally {
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
          <Badge variant="secondary">
            {persistedNode.status === "ARCHIVED" ? "Captura archivada" : "Captura"}
          </Badge>
          <div>
            <h1 className="text-3xl font-semibold tracking-normal text-zinc-950">
              {mode === "edit" ? "Editar captura" : "Captura"}
            </h1>
            <CaptureDates node={persistedNode} />
          </div>
        </div>
        {mode === "read" && persistedNode.status === "ARCHIVED" ? (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={handleBack}>
              ← Volver
            </Button>
            <Button
              variant="secondary"
              onClick={handleRestore}
              disabled={savingRef.current}
            >
              Restaurar
            </Button>
          </div>
        ) : mode === "read" ? (
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
      {restoreFeedback ? (
        <p className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600" aria-live="polite">
          {restoreFeedback}{" "}
          <Link href="/notes" className="font-medium underline">
            Ver en Base de Conocimiento
          </Link>
        </p>
      ) : null}
      {archiveConfirmationVisible && persistedNode.status !== "ARCHIVED" ? (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
          role="alert"
        >
          <p className="font-medium">Archivar esta captura?</p>
          <p className="mt-1">Podras restaurarla desde Archivo.</p>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setArchiveConfirmationVisible(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleArchive}
              disabled={savingRef.current}
            >
              Archivar
            </Button>
          </div>
        </div>
      ) : null}
      {contextError ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {contextError}
        </p>
      ) : null}
      {mode === "read" ? (
        <div className="space-y-4">
          <article className="rounded-lg border border-zinc-200 bg-white p-5">
            <div className="prose prose-zinc max-w-none whitespace-pre-wrap text-sm leading-7 text-zinc-800">
              {persistedNode.content.trim() || "Sin contenido"}
            </div>
          </article>
          <ReadConceptSection contexts={relatedContexts} />
        </div>
      ) : (
        <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4">
          <Textarea
            value={content}
            onChange={(event) => {
              updateDraft({
                nodeId: persistedNode.id,
                content: event.target.value,
              });
            }}
            placeholder="Contenido"
            aria-label="Contenido"
            className="min-h-[420px] resize-y text-base leading-7"
          />
          <EditContextSection
            contexts={relationOptions}
            selectedContextIds={selectedContextIds}
            onChange={setSelectedContexts}
          />
          <p className="text-xs text-zinc-500">
            Ctrl+S o Cmd+S guarda y mantiene la edicion abierta.
          </p>
        </div>
      )}
    </section>
  );
}

function ReadConceptSection({ contexts }: { contexts: Context[] }) {
  const groupedContexts = groupContextsByType(contexts);
  const visibleTypes = getContextTypes().filter(
    (type) => groupedContexts[type].length > 0,
  );

  if (visibleTypes.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-wrap items-center gap-2">
      <h2 className="mr-1 text-sm font-medium text-zinc-700">Conceptos</h2>
      {visibleTypes.map((type) =>
        groupedContexts[type].map((context) => (
          <Link
            key={context.id}
            href={getContextDetailPath(context.id)}
            className="rounded-full border border-zinc-200 px-3 py-1 text-sm text-zinc-700 hover:border-zinc-400 hover:text-zinc-950"
          >
            {context.name}
            {context.archivedAt ? " · Archivado" : ""}
          </Link>
        )),
      )}
    </section>
  );
}

function EditContextSection({
  contexts,
  selectedContextIds,
  onChange,
}: {
  contexts: Context[];
  selectedContextIds: string[];
  onChange: (selectedIds: string[]) => void;
}) {
  const groupedContexts = groupContextsByType(contexts);
  const selectedSet = new Set(selectedContextIds);
  const visibleTypes = getContextTypes().filter(
    (type) => groupedContexts[type].length > 0,
  );

  function toggleContext(contextId: string) {
    if (selectedSet.has(contextId)) {
      onChange(selectedContextIds.filter((id) => id !== contextId));
      return;
    }

    onChange([...selectedContextIds, contextId]);
  }

  if (visibleTypes.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4">
      <h2 className="mr-1 text-sm font-medium text-zinc-700">Conceptos</h2>
      {visibleTypes.map((type) =>
        groupedContexts[type].map((context) => {
          const disabled = Boolean(context.archivedAt) && !selectedSet.has(context.id);
          const selected = selectedSet.has(context.id);

          return (
            <button
              key={context.id}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              className={
                selected
                  ? "rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-sm text-white"
                  : "rounded-full border border-zinc-200 px-3 py-1 text-sm text-zinc-700 hover:border-zinc-400 disabled:text-zinc-400"
              }
              onClick={() => toggleContext(context.id)}
            >
              {context.name}
              {context.archivedAt ? " · Archivado" : ""}
            </button>
          );
        }),
      )}
    </section>
  );
}

function mergeContextOptions(options: Context[], relatedContexts: Context[]) {
  const contextsById = new Map<string, Context>();
  options.forEach((context) => contextsById.set(context.id, context));
  relatedContexts.forEach((context) => contextsById.set(context.id, context));
  return Array.from(contextsById.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function groupContextsByType(contexts: Context[]) {
  return getContextTypes().reduce(
    (groups, type) => ({
      ...groups,
      [type]: contexts.filter((context) => context.type === type),
    }),
    {
      AREA: [],
      PROJECT: [],
      PERSON: [],
    } as Record<ContextType, Context[]>,
  );
}

function getContextTypes(): ContextType[] {
  return ["AREA", "PROJECT", "PERSON"];
}

export function NoteDetailMessage({
  heading,
  message,
}: {
  heading: string;
  message: string;
}) {
  return (
    <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <Badge variant="secondary">Captura</Badge>
      <h1 className="text-3xl font-semibold text-zinc-950">{heading}</h1>
      <p className="text-sm text-zinc-600">{message}</p>
      <Button asChild className="w-fit">
        <Link href="/notes">Volver a Base de Conocimiento</Link>
      </Button>
    </section>
  );
}

function CaptureDates({ node }: { node: Node }) {
  const timestamps = getCaptureTimestamps(node);
  const createdAt = formatShortDate(timestamps.createdAt);
  const contentUpdatedAt = formatShortDate(timestamps.contentUpdatedAt);
  const archivedAt = timestamps.archivedAt
    ? formatShortDate(timestamps.archivedAt)
    : null;
  const showContentUpdated = timestamps.contentUpdatedAt !== timestamps.createdAt;

  return (
    <p className="mt-2 text-sm text-zinc-500">
      Creada {createdAt}
      {showContentUpdated ? ` · Editada ${contentUpdatedAt}` : ""}
      {archivedAt ? ` · Archivada ${archivedAt}` : ""}
    </p>
  );
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
    content: node.content,
  };
}

function isSameDraft(
  first: Pick<Draft, "content">,
  second: Pick<Draft, "content">,
) {
  return first.content === second.content;
}
