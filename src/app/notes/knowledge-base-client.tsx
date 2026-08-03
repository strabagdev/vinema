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
import {
  deriveMemoryThreads,
  type MemoryThread,
  type MemoryThreadEntry,
  type MemoryThreadCapture,
} from "@/features/memory/memory-threads";
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
type MemoryMode = "threads" | "time";
const KNOWLEDGE_BASE_INVALIDATION_TYPES = [
  "capture",
  "concept",
  "captureConcept",
] as const;
const MEMORY_THREAD_INITIAL_CAPTURE_LIMIT = 2;

export function KnowledgeBaseClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const vinemaContext = useVinemaContext();
  const query = searchParams.get("q")?.trim() ?? "";
  const [draftQuery, setDraftQuery] = useState(query);
  const [mode, setMode] = useState<MemoryMode>("threads");
  const [expandedThreadIds, setExpandedThreadIds] = useState<Set<string>>(
    () => new Set(),
  );
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
  const searchResultsByNodeId = useMemo(
    () => new Map(searchResults.map((result) => [result.nodeId, result])),
    [searchResults],
  );
  const filteredTimeCaptures = useMemo(
    () =>
      activeQuery
        ? filterCapturesByMemoryQuery({
            captures,
            identities: captureIdentities,
            query: activeQuery,
            searchResultsByNodeId,
          })
        : captures,
    [activeQuery, captureIdentities, captures, searchResultsByNodeId],
  );
  const visibleTimeCaptures = useMemo(
    () => filteredTimeCaptures.slice(0, visibleCount),
    [filteredTimeCaptures, visibleCount],
  );
  const searchHasMore = visibleCount < filteredTimeCaptures.length;
  const timeCaptures = useMemo(
    () => captures.slice(0, visibleCount),
    [captures, visibleCount],
  );
  const threadEntries = useMemo(
    () =>
      activeQuery
        ? filterMemoryThreadEntries(
            deriveMemoryThreads({ captures, identities: captureIdentities }),
            activeQuery,
          )
        : deriveMemoryThreads({ captures, identities: captureIdentities }),
    [activeQuery, captureIdentities, captures],
  );
  const visibleThreadEntries = useMemo(
    () => threadEntries.slice(0, visibleCount),
    [threadEntries, visibleCount],
  );
  const showingSearchResults = activeQuery && mode === "time";
  const resultCount = activeQuery
    ? mode === "threads"
      ? countThreadEntryCaptures(threadEntries)
      : filteredTimeCaptures.length
    : captureTotal;
  const visibleResultCount = showingSearchResults
    ? visibleTimeCaptures.length
    : mode === "threads"
      ? countThreadEntryCaptures(visibleThreadEntries)
      : timeCaptures.length;
  const hasMore = showingSearchResults
    ? searchHasMore
    : mode === "threads"
      ? visibleCount < threadEntries.length
      : visibleCount < captures.length || captureHasMore;

  const loadBase = useCallback(async () => {
    if (vinemaContext.status !== "ready") {
      return;
    }

    setLoadState("loading");
    setError(null);

    try {
      if (activeQuery) {
        const [results, page] = await Promise.all([
          searchNodes(
            { contextRepository, nodeContextRelationRepository, nodeRepository },
            {
              workspaceId: vinemaContext.workspace.id,
              query: activeQuery,
              includeContexts: false,
            },
          ),
          listKnowledgeCapturePage(nodeRepository, {
            workspaceId: vinemaContext.workspace.id,
            limit: Number.MAX_SAFE_INTEGER,
          }),
        ]);
        setSearchResults(results);
        setCaptures(page.items);
        setCaptureIdentities(
          await loadCaptureEmergentIdentities(
            { contextRepository, nodeContextRelationRepository },
            Array.from(
              new Set([
                ...results.map((result) => result.nodeId),
                ...page.items.map((capture) => capture.id),
              ]),
            ),
          ),
        );
        setCaptureTotal(page.total);
        setCaptureHasMore(false);
      } else {
        const page = await listKnowledgeCapturePage(nodeRepository, {
          workspaceId: vinemaContext.workspace.id,
          limit: Number.MAX_SAFE_INTEGER,
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
      setError("No se pudo cargar la Memoria.");
      setLoadState("error");
    }
  }, [activeQuery, vinemaContext]);
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
      setExpandedThreadIds(new Set());
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
    router.replace("/memory", { scroll: false });
  }

  function selectMode(nextMode: MemoryMode) {
    setMode(nextMode);
    setVisibleCount(KNOWLEDGE_BASE_BATCH_SIZE);
    setExpandedThreadIds(new Set());
  }

  function toggleThread(threadId: string) {
    setExpandedThreadIds((current) => {
      const next = new Set(current);

      if (next.has(threadId)) {
        next.delete(threadId);
      } else {
        next.add(threadId);
      }

      return next;
    });
  }

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-normal text-zinc-950">
            Memoria
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-zinc-600">
            Tus capturas organizadas por contexto y tiempo.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:items-end">
          <MemoryModeSelector mode={mode} onSelect={selectMode} />
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/memory/archive">Archivo</Link>
            </Button>
            <Button asChild>
              <Link href="/#capture">Escribir</Link>
            </Button>
          </div>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 sm:flex-row"
      >
        <label className="sr-only" htmlFor="knowledge-search">
          Buscar en la Memoria
        </label>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            id="knowledge-search"
            ref={searchInputRef}
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            placeholder="Buscar en la Memoria"
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
          Cargando Memoria...
        </div>
      ) : loadState === "ready" && activeQuery && resultCount === 0 ? (
        <EmptySearchState query={activeQuery} onClear={clearSearch} />
      ) : loadState === "ready" && !activeQuery && captures.length === 0 ? (
        <EmptyBaseState />
      ) : loadState === "ready" ? (
        <div className="space-y-4">
          <div className="space-y-3">
            {mode === "threads"
              ? visibleThreadEntries.map((entry) =>
                  entry.kind === "thread" ? (
                    <MemoryThreadItem
                      key={entry.thread.id}
                      thread={entry.thread}
                      query={activeQuery}
                      expanded={expandedThreadIds.has(entry.thread.id)}
                      onToggle={() => toggleThread(entry.thread.id)}
                    />
                  ) : (
                    <MemoryCaptureEntryItem
                      key={entry.capture.node.id}
                      capture={entry.capture}
                      query={activeQuery}
                    />
                  ),
                )
              : activeQuery
                ? visibleTimeCaptures.map((capture) => {
                    const result = searchResultsByNodeId.get(capture.id);

                    return (
                      <KnowledgeResultItem
                        key={capture.id}
                        href={getNodeDetailPath(capture.id, {
                          returnTo: getKnowledgeBasePath(activeQuery),
                        })}
                        preview={
                          result?.preview ??
                          getCapturePreview(capture.content, {
                            maxLength: 180,
                          })
                        }
                        excerpt={
                          result?.excerpt ??
                          getContentExcerpt(capture.content) ??
                          "Sin contenido"
                        }
                        identity={captureIdentities.get(capture.id) ?? null}
                        updatedAt={result?.updatedAt ?? getContentTimestamp(capture)}
                        query={activeQuery}
                      />
                    );
                  })
                : timeCaptures.map((capture) => (
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
                Llegaste al final de la Memoria.
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

function MemoryModeSelector({
  mode,
  onSelect,
}: {
  mode: MemoryMode;
  onSelect: (mode: MemoryMode) => void;
}) {
  return (
    <div
      className="inline-flex rounded-full bg-zinc-100 p-1 text-sm"
      role="group"
      aria-label="Modo de Memoria"
    >
      <button
        type="button"
        aria-pressed={mode === "threads"}
        onClick={() => onSelect("threads")}
        className={modeButtonClassName(mode === "threads")}
      >
        Hilos
      </button>
      <button
        type="button"
        aria-pressed={mode === "time"}
        onClick={() => onSelect("time")}
        className={modeButtonClassName(mode === "time")}
      >
        Tiempo
      </button>
    </div>
  );
}

function MemoryThreadItem({
  thread,
  query,
  expanded,
  onToggle,
}: {
  thread: MemoryThread;
  query: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const visibleCaptures = expanded
    ? thread.captures
    : thread.captures.slice(0, MEMORY_THREAD_INITIAL_CAPTURE_LIMIT);
  const hiddenCount = Math.max(0, thread.captureCount - visibleCaptures.length);

  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-7 text-zinc-950">
            <HighlightedText
              text={thread.identityLabels.join(" · ")}
              query={query}
            />
          </h2>
          <p className="text-sm text-zinc-500">
            {thread.captureCount} capturas · ultima actividad{" "}
            {formatCompactDate(thread.lastCapturedAt.toISOString())}
          </p>
        </div>
        <time className="shrink-0 text-xs text-zinc-500">
          {formatCompactDate(thread.lastCapturedAt.toISOString())}
        </time>
      </div>

      <div className="mt-4 space-y-3">
        {visibleCaptures.map((capture) => (
          <MemoryThreadCaptureItem
            key={capture.node.id}
            capture={capture}
            query={query}
          />
        ))}
      </div>

      {thread.captureCount > MEMORY_THREAD_INITIAL_CAPTURE_LIMIT ? (
        <button
          type="button"
          className="mt-4 rounded-sm text-sm font-medium text-zinc-700 underline-offset-4 hover:text-zinc-950 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
          aria-expanded={expanded}
          onClick={onToggle}
        >
          {expanded
            ? "Contraer"
            : `Ver ${thread.captureCount} capturas`}
          {hiddenCount > 0 && !expanded ? (
            <span className="sr-only">, {hiddenCount} ocultas</span>
          ) : null}
        </button>
      ) : null}
    </article>
  );
}

function MemoryThreadCaptureItem({
  capture,
  query,
}: {
  capture: MemoryThreadCapture;
  query: string;
}) {
  const preview = getCapturePreview(capture.node.content, { maxLength: 160 });

  return (
    <Link
      href={getNodeDetailPath(capture.node.id, {
        returnTo: query ? getKnowledgeBasePath(query) : "/memory",
      })}
      aria-label={`Abrir captura: ${getCapturePreview(preview, { maxLength: 80 })}`}
      className="block rounded-md border-l-2 border-zinc-200 py-1 pl-3 outline-none transition-colors hover:border-zinc-400 focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
    >
      <span className="line-clamp-2 text-sm leading-6 text-zinc-700">
        <HighlightedText text={preview} query={query} />
      </span>
      <time className="mt-1 block text-xs text-zinc-500">
        {formatCompactDate(capture.capturedAt.toISOString())}
      </time>
    </Link>
  );
}

function MemoryCaptureEntryItem({
  capture,
  query,
}: {
  capture: MemoryThreadCapture;
  query: string;
}) {
  return (
    <KnowledgeCaptureItem
      node={capture.node}
      identity={capture.identity}
      query={query}
      returnTo={query ? getKnowledgeBasePath(query) : "/memory"}
    />
  );
}

function KnowledgeCaptureItem({
  node,
  identity,
  query = "",
  returnTo = "/memory",
}: {
  node: Node;
  identity: CaptureEmergentIdentity | null;
  query?: string;
  returnTo?: string;
}) {
  return (
    <KnowledgeResultItem
      href={getNodeDetailPath(node.id, { returnTo })}
      preview={getCapturePreview(node.content, { maxLength: 180 })}
      excerpt={getContentExcerpt(node.content) || "Sin contenido"}
      identity={identity}
      updatedAt={getContentTimestamp(node)}
      query={query}
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

function filterMemoryThreadEntries(
  entries: MemoryThreadEntry[],
  query: string,
) {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return entries;
  }

  return entries
    .map((entry): MemoryThreadEntry | null => {
      if (entry.kind === "capture") {
        return matchesMemoryCapture(entry.capture, normalizedQuery)
          ? entry
          : null;
      }

      const matchingCaptures = entry.thread.captures.filter((capture) =>
        matchesMemoryCapture(capture, normalizedQuery),
      );
      const identityMatches = matchesIdentity(entry.thread, normalizedQuery);

      if (!identityMatches && matchingCaptures.length === 0) {
        return null;
      }

      const captureIds = new Set(
        [
          ...matchingCaptures,
          ...entry.thread.captures,
        ].map((capture) => capture.node.id),
      );
      const captures = Array.from(captureIds)
        .map((captureId) =>
          entry.thread.captures.find((capture) => capture.node.id === captureId),
        )
        .filter((capture): capture is MemoryThreadCapture => Boolean(capture));

      return {
        kind: "thread",
        thread: {
          ...entry.thread,
          captures,
        },
      };
    })
    .filter((entry): entry is MemoryThreadEntry => entry !== null);
}

function filterCapturesByMemoryQuery({
  captures,
  identities,
  query,
  searchResultsByNodeId,
}: {
  captures: Node[];
  identities: Map<string, CaptureEmergentIdentity>;
  query: string;
  searchResultsByNodeId: Map<string, RecoveryResult>;
}) {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return captures;
  }

  return captures.filter((capture) => {
    if (searchResultsByNodeId.has(capture.id)) {
      return true;
    }

    const identity = identities.get(capture.id);

    return identity
      ? matchesIdentityConcepts(identity.concepts, normalizedQuery)
      : false;
  });
}

function matchesMemoryCapture(
  capture: MemoryThreadCapture,
  normalizedQuery: string,
) {
  if (normalizeSearchText(capture.node.content).includes(normalizedQuery)) {
    return true;
  }

  return matchesIdentityConcepts(capture.identity.concepts, normalizedQuery);
}

function matchesIdentityConcepts(
  concepts: CaptureEmergentIdentity["concepts"],
  normalizedQuery: string,
) {
  return concepts.some((concept) =>
    [
      concept.label,
      concept.normalizedLabel,
      ...concept.aliases,
      ...concept.normalizedAliases,
    ].some((value) => normalizeSearchText(value).includes(normalizedQuery)),
  );
}

function matchesIdentity(thread: MemoryThread, normalizedQuery: string) {
  return thread.identityLabels.some((label) =>
    normalizeSearchText(label).includes(normalizedQuery),
  );
}

function countThreadEntryCaptures(entries: MemoryThreadEntry[]) {
  return entries.reduce(
    (total, entry) =>
      total + (entry.kind === "thread" ? entry.thread.captureCount : 1),
    0,
  );
}

function modeButtonClassName(active: boolean) {
  return [
    "rounded-full px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2",
    active
      ? "bg-white text-zinc-950 shadow-sm"
      : "text-zinc-500 hover:text-zinc-900",
  ].join(" ");
}

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
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
          de Memoria.
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
