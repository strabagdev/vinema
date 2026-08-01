"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Node } from "@/domain/node/node";
import { CAPTURE_CREATED_EVENT } from "@/features/capture/capture-events";
import { getContentTimestamp } from "@/features/capture/capture-timestamps";
import {
  KNOWLEDGE_BASE_BATCH_SIZE,
  listKnowledgeCapturePage,
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
import { useVinemaContext } from "@/features/node/hooks/use-vinema-context";
import { createHighlightedParts } from "@/features/recovery/highlight-text";
import { getKnowledgeBasePath } from "@/features/recovery/recovery-routes";
import type { RecoveryResult } from "@/features/recovery/recovery-result";
import { searchNodes } from "@/features/recovery/search-nodes";
import { useSyncDataInvalidation } from "@/features/sync/use-sync-data-invalidation";
import {
  contextRepository,
  nodeContextRelationRepository,
  nodeRepository,
} from "@/infrastructure/repositories";

type LoadState = "loading" | "ready" | "error";
const KNOWLEDGE_BASE_INVALIDATION_TYPES = [
  "capture",
  "concept",
  "captureConcept",
] as const;

export function KnowledgeBaseClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const vinemaContext = useVinemaContext();
  const query = searchParams.get("q")?.trim() ?? "";
  const [draftQuery, setDraftQuery] = useState(query);
  const [visibleCount, setVisibleCount] = useState(KNOWLEDGE_BASE_BATCH_SIZE);
  const [captures, setCaptures] = useState<Node[]>([]);
  const [captureIdentities, setCaptureIdentities] = useState<
    Map<string, CaptureEmergentIdentity>
  >(new Map());
  const [captureTotal, setCaptureTotal] = useState(0);
  const [captureHasMore, setCaptureHasMore] = useState(false);
  const [searchResults, setSearchResults] = useState<RecoveryResult[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const activeQuery = query.trim();
  const visibleSearchResults = useMemo(
    () => searchResults.slice(0, visibleCount),
    [searchResults, visibleCount],
  );
  const searchHasMore = visibleCount < searchResults.length;
  const resultCount = activeQuery ? searchResults.length : captureTotal;
  const visibleResultCount = activeQuery
    ? visibleSearchResults.length
    : captures.length;
  const hasMore = activeQuery ? searchHasMore : captureHasMore;

  const loadBase = useCallback(async () => {
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
          },
        );
        setSearchResults(results);
        setCaptureIdentities(
          await loadCaptureEmergentIdentities(
            { contextRepository, nodeContextRelationRepository },
            results.map((result) => result.nodeId),
          ),
        );
        setCaptures([]);
        setCaptureTotal(0);
        setCaptureHasMore(false);
      } else {
        const page = await listKnowledgeCapturePage(nodeRepository, {
          workspaceId: vinemaContext.workspace.id,
          limit: visibleCount,
        });
        setCaptures(page.items);
        setCaptureIdentities(
          await loadCaptureEmergentIdentities(
            { contextRepository, nodeContextRelationRepository },
            page.items.map((capture) => capture.id),
          ),
        );
        setCaptureTotal(page.total);
        setCaptureHasMore(page.hasMore);
        setSearchResults([]);
      }

      setLoadState("ready");
    } catch {
      setError("No se pudo cargar la Base de Conocimiento.");
      setLoadState("error");
    }
  }, [activeQuery, vinemaContext, visibleCount]);
  useSyncDataInvalidation({
    workspaceId:
      vinemaContext.status === "ready" ? vinemaContext.workspace.id : null,
    entityTypes: KNOWLEDGE_BASE_INVALIDATION_TYPES,
    onInvalidate: () => {
      void loadBase();
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
      void loadBase();
    });
  }, [loadBase, vinemaContext]);

  useEffect(() => {
    function handleCaptureCreated() {
      void loadBase();
    }

    window.addEventListener(CAPTURE_CREATED_EVENT, handleCaptureCreated);

    return () => {
      window.removeEventListener(CAPTURE_CREATED_EVENT, handleCaptureCreated);
    };
  }, [loadBase]);

  useEffect(() => {
    const normalizedDraft = draftQuery.trim();

    if (normalizedDraft === activeQuery) {
      return;
    }

    const timer = setTimeout(() => {
      router.replace(getKnowledgeBasePath(normalizedDraft), { scroll: false });
    }, 300);

    return () => clearTimeout(timer);
  }, [activeQuery, draftQuery, router]);

  useEffect(() => {
    if (window.location.hash === "#knowledge-search") {
      queueMicrotask(() => {
        searchInputRef.current?.focus();
      });
    }
  }, []);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    router.replace(getKnowledgeBasePath(draftQuery), { scroll: false });
  }

  function clearSearch() {
    setDraftQuery("");
    router.replace("/notes", { scroll: false });
  }

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-zinc-500">
            Herramienta secundaria
          </p>
          <h1 className="text-3xl font-semibold tracking-normal text-zinc-950">
            Historial
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-zinc-600">
            Contenido capturado localmente, listo para volver cuando lo necesites.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/notes/archive">Archivo</Link>
          </Button>
          <Button asChild>
            <Link href="/#capture">Escribir</Link>
          </Button>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 sm:flex-row"
      >
        <label className="sr-only" htmlFor="knowledge-search">
          Buscar en el Historial
        </label>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            id="knowledge-search"
            ref={searchInputRef}
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            placeholder="Buscar en el Historial"
            className="h-11 pl-9"
          />
        </div>
        {activeQuery ? (
          <Button type="button" variant="ghost" onClick={clearSearch}>
            <X className="h-4 w-4" />
            Limpiar
          </Button>
        ) : null}
        <Button type="submit">
          <Search className="h-4 w-4" />
          Buscar
        </Button>
      </form>

      <div className="min-h-5 text-sm text-zinc-500" aria-live="polite">
        {loadState === "loading"
          ? "Cargando capturas..."
          : activeQuery
            ? `${resultCount} resultados para "${activeQuery}".`
            : `${resultCount} capturas activas.`}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p>{error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void loadBase()}
          >
            Reintentar
          </Button>
        </div>
      ) : null}

      {loadState === "loading" ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
          Cargando Historial...
        </div>
      ) : loadState === "ready" && activeQuery && searchResults.length === 0 ? (
        <EmptySearchState query={activeQuery} onClear={clearSearch} />
      ) : loadState === "ready" && !activeQuery && captures.length === 0 ? (
        <EmptyBaseState />
      ) : loadState === "ready" ? (
        <div className="space-y-4">
          <div className="space-y-3">
            {activeQuery
              ? visibleSearchResults.map((result) => (
                  <KnowledgeResultItem
                    key={result.nodeId}
                    href={getNodeDetailPath(result.nodeId, {
                      returnTo: getKnowledgeBasePath(activeQuery),
                    })}
                    preview={result.preview}
                    excerpt={result.excerpt}
                    identity={captureIdentities.get(result.nodeId) ?? null}
                    updatedAt={result.updatedAt}
                    query={activeQuery}
                  />
                ))
              : captures.map((capture) => (
                  <KnowledgeCaptureItem
                    key={capture.id}
                    node={capture}
                    identity={captureIdentities.get(capture.id) ?? null}
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
                Llegaste al final del Historial.
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

function KnowledgeCaptureItem({
  node,
  identity,
}: {
  node: Node;
  identity: CaptureEmergentIdentity | null;
}) {
  return (
    <KnowledgeResultItem
      href={getNodeDetailPath(node.id, { returnTo: "/notes" })}
      preview={getCapturePreview(node.content, { maxLength: 180 })}
      excerpt={getContentExcerpt(node.content) || "Sin contenido"}
      identity={identity}
      updatedAt={getContentTimestamp(node)}
    />
  );
}

function KnowledgeResultItem({
  href,
  preview,
  excerpt,
  identity,
  updatedAt,
  query = "",
}: {
  href: string;
  preview: string;
  excerpt: string;
  identity: CaptureEmergentIdentity | null;
  updatedAt: string;
  query?: string;
}) {
  const bodyText = getBodyTextForIdentity({ identity, preview, excerpt });

  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          {identity?.displayText ? (
            <CaptureEmergentIdentityLabel
              identity={identity}
              getConceptHref={getConceptExplorationPath}
            />
          ) : null}
          <Link
            href={href}
            aria-label={`Abrir captura: ${getCapturePreview(preview, { maxLength: 80 })}`}
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
        </div>
        <time className="shrink-0 text-xs text-zinc-500">
          {formatCompactDate(updatedAt)}
        </time>
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

function EmptyBaseState() {
  return (
    <div className="flex min-h-72 items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-white">
      <div className="max-w-sm text-center">
        <h2 className="text-lg font-medium text-zinc-950">
          Todavia no has capturado contenido.
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          Empieza desde la superficie principal y Vinema lo guardara en tu Base
          de Conocimiento.
        </p>
        <Button asChild className="mt-5">
          <Link href="/#capture">Escribir</Link>
        </Button>
      </div>
    </div>
  );
}

function EmptySearchState({
  query,
  onClear,
}: {
  query: string;
  onClear: () => void;
}) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-600">
      <p>No encontramos capturas para &quot;{query}&quot;.</p>
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
