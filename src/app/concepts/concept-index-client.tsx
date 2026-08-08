"use client";

import Link from "next/link";
import { ArrowLeft, Brain, Network, Search } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import { Button } from "@/components/ui/button";
import { deriveConceptRelationships } from "@/features/exploration/concept-relationships";
import {
  getConceptExplorationPath,
  getConceptKnowledgeExplorerPath,
} from "@/features/exploration/concept-routes";
import { useVinemaContext } from "@/features/node/hooks/use-vinema-context";
import { useSyncDataInvalidation } from "@/features/sync/use-sync-data-invalidation";
import {
  contextRepository,
  nodeRepository,
  nodeContextRelationRepository,
} from "@/infrastructure/repositories";

type LoadState = "loading" | "ready" | "error";

const CONCEPT_INDEX_INVALIDATION_TYPES = [
  "concept",
  "captureConcept",
] as const;

export function ConceptIndexClient({
  embedded = false,
  workspaceMode = false,
  selectedConceptId = null,
  initialQuery = "",
  onQueryChange,
  onOpenMap,
  onOpenConcept,
}: {
  embedded?: boolean;
  workspaceMode?: boolean;
  selectedConceptId?: string | null;
  initialQuery?: string;
  onQueryChange?: (query: string) => void;
  onOpenMap?: () => void;
  onOpenConcept?: (conceptId: string) => void;
} = {}) {
  const vinemaContext = useVinemaContext();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [concepts, setConcepts] = useState<Context[]>([]);
  const [relations, setRelations] = useState<NodeContextRelation[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const carouselRef = useRef<HTMLDivElement | null>(null);

  const loadConcepts = useCallback(async () => {
    if (vinemaContext.status !== "ready") {
      return;
    }

    setLoadState("loading");
    setError(null);

    try {
      const [nextConcepts, nextRelations, nextNodes] = await Promise.all([
        contextRepository.list({
          workspaceId: vinemaContext.workspace.id,
        }),
        nodeContextRelationRepository.listByWorkspace(vinemaContext.workspace.id),
        nodeRepository.listByWorkspace(vinemaContext.workspace.id),
      ]);

      setConcepts(nextConcepts);
      setRelations(nextRelations);
      setNodes(nextNodes);
      setLoadState("ready");
    } catch {
      setConcepts([]);
      setRelations([]);
      setNodes([]);
      setError("No se pudo cargar tu conocimiento.");
      setLoadState("error");
    }
  }, [vinemaContext]);

  useSyncDataInvalidation({
    workspaceId:
      vinemaContext.status === "ready" ? vinemaContext.workspace.id : null,
    entityTypes: CONCEPT_INDEX_INVALIDATION_TYPES,
    onInvalidate: () => {
      void loadConcepts();
    },
  });

  useEffect(() => {
    queueMicrotask(() => {
      void loadConcepts();
    });
  }, [loadConcepts]);

  const relationCounts = useMemo(() => countRelationsByContext(relations), [relations]);
  const relationshipCounts = useMemo(
    () => countDerivedRelationshipsByContext({ concepts, relations, nodes }),
    [concepts, nodes, relations],
  );
  const visibleConcepts = useMemo(
    () => filterConcepts(concepts, query),
    [concepts, query],
  );

  function updateQuery(nextQuery: string) {
    setQuery(nextQuery);
    onQueryChange?.(nextQuery);
  }

  useEffect(() => {
    if (!workspaceMode || !selectedConceptId) {
      return;
    }

    const activeItem = carouselRef.current?.querySelector(
      "[data-concept-carousel-item-active='true']",
    );

    activeItem?.scrollIntoView?.({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [selectedConceptId, workspaceMode, visibleConcepts]);

  if (vinemaContext.status === "loading" || loadState === "loading") {
    return (
      <ConceptIndexShell
        embedded={embedded}
        workspaceMode={workspaceMode}
        query={query}
        onQueryChange={updateQuery}
        onOpenMap={onOpenMap}
      >
        <p className="text-sm text-zinc-500">Cargando conocimiento...</p>
      </ConceptIndexShell>
    );
  }

  if (vinemaContext.status === "error") {
    return (
      <ConceptIndexShell
        embedded={embedded}
        workspaceMode={workspaceMode}
        query={query}
        onQueryChange={updateQuery}
        onOpenMap={onOpenMap}
      >
        <ConceptIndexMessage
          heading="No se pudo cargar Vinema"
          message={vinemaContext.error}
          embedded={embedded}
        />
      </ConceptIndexShell>
    );
  }

  if (loadState === "error") {
    return (
      <ConceptIndexShell
        embedded={embedded}
        workspaceMode={workspaceMode}
        query={query}
        onQueryChange={updateQuery}
        onOpenMap={onOpenMap}
      >
        <ConceptIndexMessage
          heading="No se pudo abrir Conocimiento"
          message={error ?? "Intenta volver al inicio y abrirlo nuevamente."}
          embedded={embedded}
        />
      </ConceptIndexShell>
    );
  }

  if (concepts.length === 0) {
    return (
      <ConceptIndexShell
        embedded={embedded}
        workspaceMode={workspaceMode}
        query={query}
        onQueryChange={updateQuery}
        onOpenMap={onOpenMap}
      >
        <ConceptIndexMessage
          heading="Aun no hay conceptos"
          message="Los conceptos apareceran cuando tu memoria empiece a formar conexiones."
          embedded={embedded}
        />
      </ConceptIndexShell>
    );
  }

  return (
    <ConceptIndexShell
      embedded={embedded}
      workspaceMode={workspaceMode}
      query={query}
      onQueryChange={updateQuery}
      onOpenMap={onOpenMap}
    >
      <div
        ref={workspaceMode ? carouselRef : undefined}
        className={
          workspaceMode
            ? "flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            : "grid gap-2 sm:grid-cols-2"
        }
        data-concept-carousel={workspaceMode ? "" : undefined}
        data-concept-index-list={workspaceMode ? undefined : ""}
        onWheel={
          workspaceMode
            ? (event) => {
                if (!carouselRef.current || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
                  return;
                }

                carouselRef.current.scrollLeft += event.deltaY;
              }
            : undefined
        }
      >
        {visibleConcepts.map((concept) => {
          const active = selectedConceptId === concept.id;
          const content = workspaceMode ? (
            <span className="block min-w-0 truncate font-medium">{concept.name}</span>
          ) : (
            <span className="flex items-start gap-3">
              <span
                className={
                  active
                    ? "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-white"
                    : "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 group-hover:bg-zinc-200"
                }
              >
                <Brain className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium text-zinc-950">
                  {concept.name}
                </span>
                {concept.description ? (
                  <span className="mt-1 block line-clamp-2 text-sm leading-6 text-zinc-600">
                    {concept.description}
                  </span>
                ) : null}
                <span className="mt-2 block text-xs text-zinc-500">
                  {formatRelationCount(relationCounts.get(concept.id) ?? 0)}
                  {concept.aliases && concept.aliases.length > 0
                    ? ` · ${concept.aliases.length} alias`
                    : ""}
                  {relationshipCounts.get(concept.id)
                    ? ` · ${formatConnectionCount(relationshipCounts.get(concept.id) ?? 0)}`
                    : ""}
                </span>
              </span>
            </span>
          );

          return embedded ? (
            <button
              key={concept.id}
              type="button"
              aria-pressed={active}
              data-concept-carousel-item={workspaceMode ? "" : undefined}
              data-concept-carousel-item-active={workspaceMode ? String(active) : undefined}
              className={
                workspaceMode
                  ? active
                    ? "group h-9 max-w-[14rem] shrink-0 rounded-full bg-zinc-950 px-3 text-left text-sm font-medium text-white outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-zinc-400 motion-reduce:transition-none"
                    : "group h-9 max-w-[14rem] shrink-0 rounded-full px-3 text-left text-sm text-zinc-700 outline-none transition-colors duration-150 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-400 motion-reduce:transition-none"
                  : active
                    ? "group min-w-0 rounded-lg bg-zinc-950 p-4 text-left text-white outline-none transition-colors focus-visible:ring-2 focus-visible:ring-zinc-400 motion-reduce:transition-none"
                    : "group min-w-0 rounded-lg p-4 text-left outline-none transition-colors hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-400 motion-reduce:transition-none"
              }
              onClick={() => onOpenConcept?.(concept.id)}
            >
              {content}
            </button>
          ) : (
            <Link
              key={concept.id}
              href={getConceptExplorationPath(concept.id, { returnTo: "/concepts" })}
              className="group min-w-0 rounded-lg p-4 outline-none transition-colors hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-400 motion-reduce:transition-none"
            >
              {content}
            </Link>
          );
        })}
      </div>
    </ConceptIndexShell>
  );
}

function ConceptIndexShell({
  embedded = false,
  workspaceMode = false,
  query,
  onQueryChange,
  onOpenMap,
  children,
}: {
  embedded?: boolean;
  workspaceMode?: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  onOpenMap?: () => void;
  children: ReactNode;
}) {
  return (
    <section
      className={
        workspaceMode
          ? "flex h-full min-h-0 w-full items-center overflow-hidden"
          : "mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-5 sm:px-6 lg:px-8"
      }
      data-concept-index=""
      data-concept-index-workspace={workspaceMode ? "" : undefined}
    >
      <header
        className={
          workspaceMode
            ? "flex h-full w-[min(18rem,34vw)] shrink-0 items-center px-3"
            : "flex flex-col gap-5"
        }
      >
        {embedded ? null : (
          <div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/">
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                Volver
              </Link>
            </Button>
          </div>
        )}
        <div className={workspaceMode ? "sr-only" : "flex items-start gap-3"}>
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-700">
            <Network className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-medium tracking-normal text-zinc-950 sm:text-3xl">
              Conocimiento
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
              Recorre tus conceptos, recuerdos y conexiones.
            </p>
          </div>
        </div>
        {workspaceMode ? (
          <div className="w-full">
            <label className="sr-only" htmlFor="concept-workspace-search">
              Buscar conceptos
            </label>
            <div className="flex h-9 items-center gap-2 rounded-md border border-zinc-200 px-3">
              <Search className="h-4 w-4 text-zinc-400" aria-hidden="true" />
              <input
                id="concept-workspace-search"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Buscar conceptos..."
                className="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
              />
            </div>
          </div>
        ) : embedded ? (
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onOpenMap}
            >
              Abrir mapa de conceptos
            </Button>
          </div>
        ) : (
          <div>
            <Button variant="ghost" size="sm" asChild>
              <Link href={getConceptKnowledgeExplorerPath()}>
                Explorar conocimiento
              </Link>
            </Button>
          </div>
        )}
      </header>
      <div
        className={
          workspaceMode
            ? "min-w-0 flex-1 overflow-hidden"
            : ""
        }
      >
        {children}
      </div>
    </section>
  );
}

function ConceptIndexMessage({
  heading,
  message,
  embedded = false,
}: {
  heading: string;
  message: string;
  embedded?: boolean;
}) {
  return (
    <div className="max-w-xl rounded-lg bg-zinc-50 px-4 py-5">
      <h2 className="text-base font-medium text-zinc-950">{heading}</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600">{message}</p>
      {embedded ? null : (
        <Button variant="ghost" size="sm" asChild className="mt-4">
          <Link href="/">Volver al inicio</Link>
        </Button>
      )}
    </div>
  );
}

function countRelationsByContext(relations: NodeContextRelation[]) {
  const counts = new Map<string, number>();

  for (const relation of relations) {
    counts.set(relation.contextId, (counts.get(relation.contextId) ?? 0) + 1);
  }

  return counts;
}

function filterConcepts(concepts: Context[], query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase("es");

  if (!normalizedQuery) {
    return concepts;
  }

  return concepts.filter((concept) => {
    const values = [
      concept.name,
      concept.description ?? "",
      ...(concept.aliases ?? []),
    ];

    return values.some((value) =>
      value.toLocaleLowerCase("es").includes(normalizedQuery),
    );
  });
}

function formatRelationCount(count: number) {
  if (count === 1) {
    return "1 recuerdo relacionado";
  }

  return `${count} recuerdos relacionados`;
}

function formatConnectionCount(count: number) {
  if (count === 1) {
    return "1 conexión";
  }

  return `${count} conexiones`;
}

function countDerivedRelationshipsByContext({
  concepts,
  relations,
  nodes,
}: {
  concepts: Context[];
  relations: NodeContextRelation[];
  nodes: Node[];
}) {
  const counts = new Map<string, number>();

  for (const concept of concepts) {
    counts.set(
      concept.id,
      deriveConceptRelationships({
        sourceConceptId: concept.id,
        contexts: concepts,
        relations,
        nodes,
      }).length,
    );
  }

  return counts;
}
