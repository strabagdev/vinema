"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Context } from "@/domain/context/context";
import type { Node } from "@/domain/node/node";
import { archiveContext } from "@/features/context/archive-context";
import {
  CONTEXT_TYPE_LABEL,
} from "@/features/context/context-display";
import {
  getContextIdFromSearchParams,
  getContextDetailPath,
  getContextListPath,
} from "@/features/context/context-routes";
import { getContextById } from "@/features/context/list-contexts";
import { listNodesForContext } from "@/features/context/node-context-relations";
import { restoreContext } from "@/features/context/restore-context";
import { updateContext } from "@/features/context/update-context";
import { useVinemaContext } from "@/features/node/hooks/use-vinema-context";
import { getCapturePreview, getContentExcerpt } from "@/features/node/node-display";
import { getNodeDetailPath } from "@/features/node/node-routes";
import { getReturnToFromSearchParams } from "@/features/recovery/recovery-routes";
import {
  contextRepository,
  createLocalSyncRepositorySet,
  nodeContextRelationRepository,
  nodeRepository,
} from "@/infrastructure/repositories";
import { formatShortDate } from "@/components/app-shell/note-list-item";

type Draft = {
  name: string;
  description: string;
};

export function ContextDetailClient() {
  const searchParams = useSearchParams();
  const contextId = getContextIdFromSearchParams(searchParams);
  const returnTo = getReturnToFromSearchParams(searchParams);

  if (!contextId) {
    return (
      <ContextDetailMessage
        heading="Falta el contexto"
        message="La URL no incluye un identificador de contexto valido."
      />
    );
  }

  return <ContextDetailLoader contextId={contextId} returnTo={returnTo} />;
}

function ContextDetailLoader({
  contextId,
  returnTo,
}: {
  contextId: string;
  returnTo: string | null;
}) {
  const vinemaContext = useVinemaContext();
  const localRepositories = useMemo(() => {
    if (vinemaContext.status !== "ready") {
      return null;
    }

    return createLocalSyncRepositorySet({
      workspaceId: vinemaContext.workspace.id,
      deviceId: vinemaContext.device.id,
    });
  }, [vinemaContext]);
  const [context, setContext] = useState<Context | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadContext = useCallback(async () => {
    if (vinemaContext.status !== "ready") {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const nextContext = await getContextById(contextRepository, contextId);

      if (!nextContext || nextContext.workspaceId !== vinemaContext.workspace.id) {
        setContext(null);
        setNodes([]);
        setError("El contexto no existe en este workspace.");
        return;
      }

      const relatedNodes = await listNodesForContext(
        { nodeContextRelationRepository, nodeRepository },
        { contextId: nextContext.id },
      );
      setContext(nextContext);
      setNodes(relatedNodes);
    } catch {
      setError("No se pudo cargar el contexto.");
    } finally {
      setLoading(false);
    }
  }, [contextId, vinemaContext]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadContext();
    });
  }, [loadContext]);

  if (loading || vinemaContext.status === "loading") {
    return (
      <section className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
          Cargando contexto...
        </div>
      </section>
    );
  }

  if (vinemaContext.status === "error") {
    return (
      <ContextDetailMessage
        heading="No se pudo cargar Vinema"
        message={vinemaContext.error}
      />
    );
  }

  if (!context) {
    return (
      <ContextDetailMessage
        heading="Contexto no encontrado"
        message={error ?? "No existe o no pertenece a este workspace."}
      />
    );
  }

  if (!localRepositories) {
    return (
      <section className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
          Cargando contexto local...
        </div>
      </section>
    );
  }

  return (
    <ContextDetailView
      context={context}
      nodes={nodes}
      onSave={async ({ name, description }) => {
        const updatedContext = await updateContext(localRepositories.contextRepository, {
          id: context.id,
          name,
          description,
        });
        setContext(updatedContext);
        return updatedContext;
      }}
      onArchive={async () => {
        const archivedContext = await archiveContext(
          localRepositories.contextRepository,
          context.id,
        );
        setContext(archivedContext);
      }}
      onRestore={async () => {
        const restoredContext = await restoreContext(
          localRepositories.contextRepository,
          context.id,
        );
        setContext(restoredContext);
      }}
      returnTo={returnTo}
    />
  );
}

export function ContextDetailView({
  context,
  nodes,
  onSave,
  onArchive,
  onRestore,
  returnTo = null,
}: {
  context: Context;
  nodes: Node[];
  onSave: (draft: Draft) => Promise<Context>;
  onArchive: () => Promise<void>;
  onRestore: () => Promise<void>;
  returnTo?: string | null;
}) {
  const router = useRouter();
  const [persistedContext, setPersistedContext] = useState(context);
  const [mode, setMode] = useState<"read" | "edit">("read");
  const [draft, setDraft] = useState<Draft>(toDraft(context));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const label = CONTEXT_TYPE_LABEL[persistedContext.type];
  const listPath = getContextListPath(persistedContext.type);
  const detailPath = getContextDetailPath(persistedContext.id, { returnTo });

  function beginEdit() {
    setDraft(toDraft(persistedContext));
    setFormError(null);
    setMode("edit");
  }

  function cancelEdit() {
    setDraft(toDraft(persistedContext));
    setFormError(null);
    setMode("read");
  }

  async function handleDone() {
    setSaving(true);
    setFormError(null);

    try {
      const nextContext = await onSave(draft);
      setPersistedContext(nextContext);
      setDraft(toDraft(nextContext));
      setMode("read");
    } catch (caughtError) {
      setFormError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo guardar el contexto.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    setSaving(true);
    setFormError(null);

    try {
      await onArchive();
      setPersistedContext({ ...persistedContext, archivedAt: new Date().toISOString() });
    } catch (caughtError) {
      setFormError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo archivar el contexto.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleRestore() {
    setSaving(true);
    setFormError(null);

    try {
      await onRestore();
      setPersistedContext({ ...persistedContext, archivedAt: null });
    } catch (caughtError) {
      setFormError(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo restaurar el contexto.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <Badge variant="secondary">{label}</Badge>
          <div>
            <h1 className="text-3xl font-semibold tracking-normal text-zinc-950">
              {mode === "edit" ? `Editar ${label.toLowerCase()}` : persistedContext.name}
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              {persistedContext.archivedAt ? "Archivado" : "Activo"}
            </p>
          </div>
        </div>
        {mode === "read" ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => router.push(returnTo ?? listPath)}>
              ← Volver
            </Button>
            {!persistedContext.archivedAt ? (
              <>
                <Button variant="secondary" onClick={beginEdit}>
                  Editar
                </Button>
                <Button variant="ghost" onClick={handleArchive} disabled={saving}>
                  <Archive className="h-4 w-4" />
                  Archivar
                </Button>
              </>
            ) : (
              <Button variant="secondary" onClick={handleRestore} disabled={saving}>
                Restaurar
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              onClick={() => router.push(returnTo ?? listPath)}
              disabled={saving}
            >
              ← Volver
            </Button>
            <Button variant="ghost" onClick={cancelEdit} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleDone} disabled={saving}>
              Listo
            </Button>
          </div>
        )}
      </div>

      {formError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>
      ) : null}

      {mode === "read" ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-700">
            {persistedContext.description || "Sin descripcion"}
          </p>
        </div>
      ) : (
        <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-800" htmlFor="detail-name">
              Nombre
            </label>
            <Input
              id="detail-name"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label
              className="text-sm font-medium text-zinc-800"
              htmlFor="detail-description"
            >
              Descripcion
            </label>
            <Textarea
              id="detail-description"
              value={draft.description}
              onChange={(event) =>
                setDraft({ ...draft, description: event.target.value })
              }
              className="min-h-32"
            />
          </div>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-zinc-950">
          Capturas relacionadas
        </h2>
        {nodes.length > 0 ? (
          <div className="space-y-3">
            {nodes.map((node) => (
              <Link
                key={node.id}
                href={getNodeDetailPath(node.id, { returnTo: detailPath })}
                className="block rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-base leading-7 text-zinc-800">
                      {getCapturePreview(node.content, { maxLength: 140 })}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-600">
                      {getContentExcerpt(node.content) || "Sin contenido"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-xs text-zinc-500">
                    <p>{node.type}</p>
                    <time>{formatShortDate(node.updatedAt)}</time>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-500">
            No hay capturas relacionadas.
          </div>
        )}
      </section>
    </section>
  );
}

function ContextDetailMessage({
  heading,
  message,
}: {
  heading: string;
  message: string;
}) {
  return (
    <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <Badge variant="secondary">Contextos</Badge>
      <h1 className="text-3xl font-semibold text-zinc-950">{heading}</h1>
      <p className="text-sm text-zinc-600">{message}</p>
      <Button asChild className="w-fit">
        <Link href="/contexts/areas">Volver a contextos</Link>
      </Button>
    </section>
  );
}

function toDraft(context: Context): Draft {
  return {
    name: context.name,
    description: context.description ?? "",
  };
}
