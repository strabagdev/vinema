"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Context, ContextType } from "@/domain/context/context";
import { createContext } from "@/features/context/create-context";
import {
  CONTEXT_TYPE_LABEL,
  CONTEXT_TYPE_PLURAL_LABEL,
  getContextDescriptionPlaceholder,
  getEmptyContextMessage,
} from "@/features/context/context-display";
import { getContextDetailPath } from "@/features/context/context-routes";
import { listContextsByType } from "@/features/context/list-contexts";
import { useVinemaContext } from "@/features/node/hooks/use-vinema-context";
import {
  contextRepository,
  nodeContextRelationRepository,
} from "@/infrastructure/repositories";

type ContextWithCount = Context & { relatedNodeCount: number };

export function ContextListClient({ type }: { type: ContextType }) {
  const vinemaContext = useVinemaContext();
  const [contexts, setContexts] = useState<ContextWithCount[]>([]);
  const [view, setView] = useState<"active" | "archived">("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const label = CONTEXT_TYPE_LABEL[type].toLowerCase();
  const pluralLabel = CONTEXT_TYPE_PLURAL_LABEL[type];
  const visibleContexts = useMemo(
    () =>
      contexts.filter((context) =>
        view === "active" ? context.archivedAt === null : context.archivedAt !== null,
      ),
    [contexts, view],
  );

  const loadContexts = useCallback(async () => {
    if (vinemaContext.status !== "ready") {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const nextContexts = await listContextsByType(contextRepository, {
        workspaceId: vinemaContext.workspace.id,
        type,
        includeArchived: true,
      });
      const contextsWithCounts = await Promise.all(
        nextContexts.map(async (context) => ({
          ...context,
          relatedNodeCount: (
            await nodeContextRelationRepository.listByContextId(context.id)
          ).length,
        })),
      );
      setContexts(contextsWithCounts);
    } catch {
      setError(`No se pudieron cargar ${pluralLabel.toLowerCase()}.`);
    } finally {
      setLoading(false);
    }
  }, [pluralLabel, type, vinemaContext]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadContexts();
    });
  }, [loadContexts]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();

    if (vinemaContext.status !== "ready") {
      return;
    }

    setCreating(true);
    setCreateError(null);

    try {
      await createContext(contextRepository, {
        workspaceId: vinemaContext.workspace.id,
        type,
        name,
        description,
      });
      setName("");
      setDescription("");
      setFormOpen(false);
      await loadContexts();
    } catch (caughtError) {
      setCreateError(
        caughtError instanceof Error
          ? caughtError.message
          : `No se pudo crear ${label}.`,
      );
    } finally {
      setCreating(false);
    }
  }

  if (vinemaContext.status === "error") {
    return (
      <ContextPageMessage
        title={`No se pudo cargar ${pluralLabel.toLowerCase()}`}
        message={vinemaContext.error}
      />
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <Badge variant="secondary">{pluralLabel}</Badge>
          <div>
            <h1 className="text-3xl font-semibold tracking-normal text-zinc-950">
              {pluralLabel}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
              {getContextDescriptionPlaceholder(type)}
            </p>
          </div>
        </div>
        <Button onClick={() => setFormOpen((current) => !current)}>
          <Plus className="h-4 w-4" />
          Crear {label}
        </Button>
      </div>

      <div className="flex w-fit rounded-md border border-zinc-200 bg-white p-1">
        <Button
          variant={view === "active" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setView("active")}
        >
          Activos
        </Button>
        <Button
          variant={view === "archived" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setView("archived")}
        >
          Archivados
        </Button>
      </div>

      {formOpen ? (
        <form
          onSubmit={handleCreate}
          className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4"
        >
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-800" htmlFor="context-name">
              Nombre
            </label>
            <Input
              id="context-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={creating}
            />
          </div>
          <div className="space-y-2">
            <label
              className="text-sm font-medium text-zinc-800"
              htmlFor="context-description"
            >
              Descripcion opcional
            </label>
            <Textarea
              id="context-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={creating}
              className="min-h-24"
            />
          </div>
          {createError ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {createError}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={creating}>
              Crear {label}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={creating}
              onClick={() => {
                setFormOpen(false);
                setCreateError(null);
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {loading || vinemaContext.status === "loading" ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
          Cargando {pluralLabel.toLowerCase()}...
        </div>
      ) : visibleContexts.length > 0 ? (
        <div className="space-y-3">
          {visibleContexts.map((context) => (
            <Link
              key={context.id}
              href={getContextDetailPath(context.id)}
              className="block rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-base font-medium text-zinc-950">
                    {context.name}
                  </h2>
                  {context.description ? (
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-600">
                      {context.description}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2 text-xs text-zinc-500">
                  <span>{context.relatedNodeCount} notas</span>
                  {context.archivedAt ? <span>Archivado</span> : null}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex min-h-72 items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-white">
          <div className="max-w-sm text-center">
            <h2 className="text-lg font-medium text-zinc-950">
              {view === "active"
                ? getEmptyContextMessage(type)
                : `No hay ${pluralLabel.toLowerCase()} archivados.`}
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              {getContextDescriptionPlaceholder(type)}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function ContextPageMessage({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-semibold text-zinc-950">{title}</h1>
      <p className="text-sm text-zinc-600">{message}</p>
    </section>
  );
}
