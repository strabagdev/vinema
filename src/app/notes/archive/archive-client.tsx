"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { RotateCcw, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Node } from "@/domain/node/node";
import { getArchivedTimestamp } from "@/features/capture/capture-timestamps";
import {
  KNOWLEDGE_BASE_BATCH_SIZE,
  listArchivedCapturePage,
} from "@/features/capture/list-knowledge-captures";
import {
  getContentExcerpt,
  getCapturePreview,
} from "@/features/node/node-display";
import type { CaptureEmergentIdentity } from "@/features/identity/capture-emergent-identity";
import { CaptureEmergentIdentityLabel } from "@/features/identity/capture-emergent-identity-view";
import { loadCaptureEmergentIdentities } from "@/features/identity/load-capture-emergent-identities";
import { getConceptExplorationPath } from "@/features/exploration/concept-routes";
import { getNodeDetailPath } from "@/features/node/node-routes";
import { restoreNode } from "@/features/node/restore-node";
import { useVinemaContext } from "@/features/node/hooks/use-vinema-context";
import { createHighlightedParts } from "@/features/recovery/highlight-text";
import { getArchivePath, getKnowledgeBasePath } from "@/features/recovery/recovery-routes";
import type { RecoveryResult } from "@/features/recovery/recovery-result";
import { searchNodes } from "@/features/recovery/search-nodes";
import { useSyncDataInvalidation } from "@/features/sync/use-sync-data-invalidation";
import {
  contextRepository,
  createLocalSyncRepositorySet,
  nodeContextRelationRepository,
  nodeRepository,
} from "@/infrastructure/repositories";

type LoadState = "loading" | "ready" | "error";
const ARCHIVE_INVALIDATION_TYPES = [
  "capture",
  "concept",
  "captureConcept",
] as const;

export function ArchiveClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const vinemaContext = useVinemaContext();
  const query = searchParams.get("q")?.trim() ?? "";
  const [draftQuery, setDraftQuery] = useState(query);
  const [visibleCount, setVisibleCount] = useState(KNOWLEDGE_BASE_BATCH_SIZE);
  const [archivedCaptures, setArchivedCaptures] = useState<Node[]>([]);
  const [captureIdentities, setCaptureIdentities] = useState<
    Map<string, CaptureEmergentIdentity>
  >(new Map());
  const [archiveTotal, setArchiveTotal] = useState(0);
  const [archiveHasMore, setArchiveHasMore] = useState(false);
  const [searchResults, setSearchResults] = useState<RecoveryResult[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const activeQuery = query.trim();
  const visibleSearchResults = useMemo(
    () => searchResults.slice(0, visibleCount),
    [searchResults, visibleCount],
  );
  const localRepositories = useMemo(() => {
    if (vinemaContext.status !== "ready") {
      return null;
    }

    return createLocalSyncRepositorySet({
      workspaceId: vinemaContext.workspace.id,
      deviceId: vinemaContext.device.id,
    });
  }, [vinemaContext]);
  const resultCount = activeQuery ? searchResults.length : archiveTotal;
  const visibleResultCount = activeQuery
    ? visibleSearchResults.length
    : archivedCaptures.length;
  const hasMore = activeQuery
    ? visibleCount < searchResults.length
    : archiveHasMore;

  const loadArchive = useCallback(async () => {
    if (vinemaContext.status !== "ready") {
      return;
    }

    setLoadState("loading");
    setError(null);

    try {
      if (activeQuery) {
        const results = await searchNodes(
          { contextRepository, nodeContextRelationRepository, nodeRepository },
          {
            workspaceId: vinemaContext.workspace.id,
            query: activeQuery,
            includeContexts: false,
            scope: "archived",
          },
        );
        setSearchResults(results);
        setCaptureIdentities(
          await loadCaptureEmergentIdentities(
            { contextRepository, nodeContextRelationRepository },
            results.map((result) => result.nodeId),
          ),
        );
        setArchivedCaptures([]);
        setArchiveTotal(0);
        setArchiveHasMore(false);
      } else {
        const page = await listArchivedCapturePage(nodeRepository, {
          workspaceId: vinemaContext.workspace.id,
          limit: visibleCount,
        });
        setArchivedCaptures(page.items);
        setCaptureIdentities(
          await loadCaptureEmergentIdentities(
            { contextRepository, nodeContextRelationRepository },
            page.items.map((capture) => capture.id),
          ),
        );
        setArchiveTotal(page.total);
        setArchiveHasMore(page.hasMore);
        setSearchResults([]);
      }

      setLoadState("ready");
    } catch {
      setError("No se pudo cargar el Archivo.");
      setLoadState("error");
    }
  }, [activeQuery, vinemaContext, visibleCount]);
  useSyncDataInvalidation({
    workspaceId:
      vinemaContext.status === "ready" ? vinemaContext.workspace.id : null,
    entityTypes: ARCHIVE_INVALIDATION_TYPES,
    onInvalidate: () => {
      void loadArchive();
    },
  });

  useEffect(() => {
    queueMicrotask(() => {
      setDraftQuery(query);
      setVisibleCount(KNOWLEDGE_BASE_BATCH_SIZE);
    });
  }, [query]);

  useEffect(() => {
    if (vinemaContext.status === "loading") {
      return;
    }

    if (vinemaContext.status === "error") {
      queueMicrotask(() => {
        setError(vinemaContext.error);
        setLoadState("error");
      });
      return;
    }

    queueMicrotask(() => {
      void loadArchive();
    });
  }, [loadArchive, vinemaContext]);

  useEffect(() => {
    const normalizedDraft = draftQuery.trim();

    if (normalizedDraft === activeQuery) {
      return;
    }

    const timer = setTimeout(() => {
      router.replace(getArchivePath(normalizedDraft), { scroll: false });
    }, 300);

    return () => clearTimeout(timer);
  }, [activeQuery, draftQuery, router]);

  async function handleRestore(nodeId: string) {
    if (restoringId || vinemaContext.status !== "ready" || !localRepositories) {
      return;
    }

    setRestoringId(nodeId);
    setFeedback(null);
    setError(null);

    try {
      await restoreNode(
        localRepositories.nodeRepository,
        nodeId,
        vinemaContext.device,
      );
      setFeedback("Captura restaurada. Ya vuelve a estar en Memoria.");
      await loadArchive();
    } catch {
      setError("No se pudo restaurar la captura.");
    } finally {
      setRestoringId(null);
    }
  }

  function clearSearch() {
    setDraftQuery("");
    router.replace("/memory/archive", { scroll: false });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    router.replace(getArchivePath(draftQuery), { scroll: false });
  }

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-zinc-500">Archivo</p>
          <h1 className="text-3xl font-semibold tracking-normal text-zinc-950">
            Archivo
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-zinc-600">
            Las capturas archivadas no se eliminan. Puedes revisarlas y
            restaurarlas cuando vuelvan a ser relevantes.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/memory">Volver a Memoria</Link>
        </Button>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 sm:flex-row"
      >
        <label className="sr-only" htmlFor="archive-search">
          Buscar en Archivo
        </label>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            id="archive-search"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            placeholder="Buscar en Archivo"
            className="h-11 pl-9"
          />
        </div>
        {activeQuery ? (
          <Button type="button" variant="ghost" onClick={clearSearch}>
            <X className="h-4 w-4" />
            Limpiar busqueda
          </Button>
        ) : null}
        <Button type="submit">
          <Search className="h-4 w-4" />
          Buscar
        </Button>
      </form>

      <div className="min-h-5 text-sm text-zinc-500" aria-live="polite">
        {loadState === "loading"
          ? "Cargando capturas archivadas..."
          : activeQuery
            ? `${resultCount} resultados archivados para "${activeQuery}".`
            : `${resultCount} capturas archivadas.`}
      </div>

      {feedback ? (
        <p className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600" aria-live="polite">
          {feedback}{" "}
          <Link href={getKnowledgeBasePath()} className="font-medium underline">
            Ver en Memoria
          </Link>
        </p>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p>{error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void loadArchive()}
          >
            Reintentar
          </Button>
        </div>
      ) : null}

      {loadState === "loading" ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
          Cargando Archivo...
        </div>
      ) : loadState === "ready" && activeQuery && searchResults.length === 0 ? (
        <EmptyArchiveSearchState query={activeQuery} onClear={clearSearch} />
      ) : loadState === "ready" && !activeQuery && archivedCaptures.length === 0 ? (
        <EmptyArchiveState />
      ) : loadState === "ready" ? (
        <div className="space-y-4">
          <div className="space-y-3">
            {activeQuery
              ? visibleSearchResults.map((result) => (
                  <ArchiveResultItem
                    key={result.nodeId}
                    href={getNodeDetailPath(result.nodeId, {
                      returnTo: getArchivePath(activeQuery),
                    })}
                    preview={result.preview}
                    excerpt={result.excerpt}
                    identity={captureIdentities.get(result.nodeId) ?? null}
                    updatedAt={result.updatedAt}
                    query={activeQuery}
                    onRestore={() => void handleRestore(result.nodeId)}
                    restoring={restoringId === result.nodeId}
                  />
                ))
              : archivedCaptures.map((node) => (
                  <ArchiveResultItem
                    key={node.id}
                    href={getNodeDetailPath(node.id, { returnTo: "/memory/archive" })}
                    preview={getCapturePreview(node.content, { maxLength: 180 })}
                    excerpt={getContentExcerpt(node.content) || "Sin contenido"}
                    identity={captureIdentities.get(node.id) ?? null}
                    updatedAt={getArchivedTimestamp(node)}
                    onRestore={() => void handleRestore(node.id)}
                    restoring={restoringId === node.id}
                  />
                ))}
          </div>

          <div className="flex flex-col items-center gap-3">
            {hasMore ? (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setVisibleCount((current) => current + KNOWLEDGE_BASE_BATCH_SIZE)
                }
              >
                Cargar mas
              </Button>
            ) : (
              <p className="text-sm text-zinc-500" aria-live="polite">
                Llegaste al final del Archivo.
              </p>
            )}
            {visibleResultCount > 0 ? (
              <p className="text-xs text-zinc-500">
                Mostrando {visibleResultCount} de {resultCount}.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ArchiveResultItem({
  href,
  preview,
  excerpt,
  identity,
  updatedAt,
  query = "",
  onRestore,
  restoring,
}: {
  href: string;
  preview: string;
  excerpt: string;
  identity: CaptureEmergentIdentity | null;
  updatedAt: string;
  query?: string;
  onRestore: () => void;
  restoring: boolean;
}) {
  const bodyText = getBodyTextForIdentity({ identity, preview, excerpt });

  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          {identity?.displayText ? (
            <CaptureEmergentIdentityLabel
              identity={identity}
              getConceptHref={getConceptExplorationPath}
            />
          ) : null}
          <Link
            href={href}
            aria-label={`Abrir captura archivada: ${getCapturePreview(preview, { maxLength: 80 })}`}
            className="block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
          >
            <span className="line-clamp-3 text-base leading-7 text-zinc-800">
              <HighlightedText
                text={identity?.displayText ? bodyText : preview}
                query={query}
              />
            </span>
          </Link>
          {!identity?.displayText && bodyText ? (
            <p className="line-clamp-2 text-sm leading-6 text-zinc-600">
              <HighlightedText text={bodyText} query={query} />
            </p>
          ) : null}
          <time className="block text-xs text-zinc-500">
            Archivada {formatCompactDate(updatedAt)}
          </time>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRestore}
          disabled={restoring}
        >
          <RotateCcw className="h-4 w-4" />
          {restoring ? "Restaurando" : "Restaurar"}
        </Button>
      </div>
    </article>
  );
}

function getBodyTextForIdentity({
  identity,
  preview,
  excerpt,
}: {
  identity: CaptureEmergentIdentity | null;
  preview: string;
  excerpt: string;
}) {
  if (identity?.displayText) {
    return excerpt || preview;
  }

  return normalizeComparableText(preview) === normalizeComparableText(excerpt)
    ? ""
    : excerpt;
}

function normalizeComparableText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  return (
    <>
      {createHighlightedParts(text, query).map((part, index) =>
        part.highlighted ? (
          <mark
            key={`${part.text}-${index}`}
            className="rounded-sm bg-amber-100 px-0.5 text-zinc-950"
          >
            {part.text}
          </mark>
        ) : (
          <span key={`${part.text}-${index}`}>{part.text}</span>
        ),
      )}
    </>
  );
}

function EmptyArchiveState() {
  return (
    <div className="flex min-h-72 items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-white">
      <div className="max-w-sm text-center">
        <h2 className="text-lg font-medium text-zinc-950">
          No hay capturas archivadas.
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          Las capturas que archives apareceran aqui y podras restaurarlas.
        </p>
      </div>
    </div>
  );
}

function EmptyArchiveSearchState({
  query,
  onClear,
}: {
  query: string;
  onClear: () => void;
}) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-600">
      <p>No encontramos capturas archivadas para &quot;{query}&quot;.</p>
      <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onClear}>
        Limpiar busqueda
      </Button>
    </div>
  );
}

function formatCompactDate(value: string) {
  return new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
