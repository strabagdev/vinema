"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import { Button } from "@/components/ui/button";
import {
  deriveConceptGraphNeighborhood,
  deriveConceptRelationships,
  type ConceptGraphEdge,
  type ConceptGraphNeighborhood,
  type ConceptGraphNode,
  type RelationshipStrength,
} from "@/features/exploration/concept-relationships";
import {
  getConceptExplorationPath,
  getConceptKnowledgeExplorerPath,
} from "@/features/exploration/concept-routes";
import { useVinemaContext } from "@/features/node/hooks/use-vinema-context";
import { useSyncDataInvalidation } from "@/features/sync/use-sync-data-invalidation";
import {
  contextRepository,
  nodeContextRelationRepository,
  nodeRepository,
} from "@/infrastructure/repositories";

type LoadState = "loading" | "ready" | "error";

interface PositionedGraphNode extends ConceptGraphNode {
  x: number;
  y: number;
  selected: boolean;
}

interface ExplorerGraph {
  center: ConceptGraphNode | null;
  nodes: PositionedGraphNode[];
  edges: ConceptGraphEdge[];
}

const CONCEPT_EXPLORER_INVALIDATION_TYPES = [
  "capture",
  "concept",
  "captureConcept",
] as const;
const MAX_GLOBAL_NODES = 12;
const GRAPH_WIDTH = 760;
const GRAPH_HEIGHT = 440;
const CENTER_X = GRAPH_WIDTH / 2;
const CENTER_Y = GRAPH_HEIGHT / 2;

export function ConceptKnowledgeExplorerClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus")?.trim() || null;
  const vinemaContext = useVinemaContext();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [contexts, setContexts] = useState<Context[]>([]);
  const [relations, setRelations] = useState<NodeContextRelation[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const loadExplorer = useCallback(async () => {
    if (vinemaContext.status !== "ready") {
      return;
    }

    setLoadState("loading");
    setError(null);

    try {
      const [nextContexts, nextRelations, nextNodes] = await Promise.all([
        contextRepository.list({
          workspaceId: vinemaContext.workspace.id,
          includeArchived: false,
        }),
        nodeContextRelationRepository.listByWorkspace(vinemaContext.workspace.id),
        nodeRepository.listByWorkspace(vinemaContext.workspace.id),
      ]);

      setContexts(nextContexts);
      setRelations(nextRelations);
      setNodes(nextNodes);
      setLoadState("ready");
    } catch {
      setContexts([]);
      setRelations([]);
      setNodes([]);
      setError("No se pudieron cargar las conexiones.");
      setLoadState("error");
    }
  }, [vinemaContext]);

  useSyncDataInvalidation({
    workspaceId:
      vinemaContext.status === "ready" ? vinemaContext.workspace.id : null,
    entityTypes: CONCEPT_EXPLORER_INVALIDATION_TYPES,
    onInvalidate: () => {
      void loadExplorer();
    },
  });

  useEffect(() => {
    queueMicrotask(() => {
      void loadExplorer();
    });
  }, [loadExplorer]);

  const activeFocusId = selectedConceptId ?? focusId;

  const graph = useMemo(
    () =>
      deriveExplorerGraph({
        focusId: activeFocusId,
        contexts,
        relations,
        nodes,
      }),
    [activeFocusId, contexts, nodes, relations],
  );
  const selectedNode =
    graph.nodes.find((node) => node.conceptId === activeFocusId) ??
    graph.center ??
    null;
  const selectedConnections = useMemo(
    () =>
      selectedNode
        ? deriveConceptRelationships({
            sourceConceptId: selectedNode.conceptId,
            contexts,
            relations,
            nodes,
            limit: 8,
          })
        : [],
    [contexts, nodes, relations, selectedNode],
  );
  const searchResults = useMemo(
    () => searchConcepts({ contexts, query }).slice(0, 6),
    [contexts, query],
  );

  function focusConcept(conceptId: string) {
    setSelectedConceptId(conceptId);
    router.push(getConceptKnowledgeExplorerPath({ focus: conceptId }));
  }

  function goBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/concepts");
  }

  if (vinemaContext.status === "loading" || loadState === "loading") {
    return (
      <ExplorerShell onBack={goBack}>
        <p className="text-sm text-zinc-500">Cargando conexiones...</p>
      </ExplorerShell>
    );
  }

  if (vinemaContext.status === "error") {
    return (
      <ExplorerShell onBack={goBack}>
        <ExplorerMessage
          heading="No se pudo cargar Vinema"
          message={vinemaContext.error}
        />
      </ExplorerShell>
    );
  }

  if (loadState === "error") {
    return (
      <ExplorerShell onBack={goBack}>
        <ExplorerMessage
          heading="No se pudo explorar conocimiento"
          message={error ?? "Intenta volver a Conceptos y abrirlo nuevamente."}
        />
      </ExplorerShell>
    );
  }

  const hasEnoughConnections = graph.edges.length > 0 && graph.nodes.length > 1;

  return (
    <ExplorerShell onBack={goBack}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <ConceptSearch
            query={query}
            results={searchResults}
            onQueryChange={setQuery}
            onFocusConcept={focusConcept}
          />

          {hasEnoughConnections ? (
            <ConceptGraph
              graph={graph}
              selectedConceptId={selectedNode?.conceptId ?? null}
              onFocusConcept={focusConcept}
            />
          ) : (
            <ExplorerEmptyState />
          )}
        </div>

        <aside className="space-y-5">
          {selectedNode ? (
            <SelectedConceptSummary node={selectedNode} />
          ) : null}
          <ConnectionList
            selectedConceptId={selectedNode?.conceptId ?? null}
            connections={selectedConnections}
            onFocusConcept={focusConcept}
          />
        </aside>
      </div>
    </ExplorerShell>
  );
}

function ExplorerShell({
  children,
  onBack,
}: {
  children: React.ReactNode;
  onBack: () => void;
}) {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <header className="space-y-5">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
          Volver
        </Button>
        <div>
          <h1 className="text-2xl font-medium tracking-normal text-zinc-950 sm:text-3xl">
            Explorar conocimiento
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
            ¿Cómo está conectada mi memoria?
          </p>
        </div>
      </header>
      {children}
    </section>
  );
}

function ConceptSearch({
  query,
  results,
  onQueryChange,
  onFocusConcept,
}: {
  query: string;
  results: Context[];
  onQueryChange: (value: string) => void;
  onFocusConcept: (conceptId: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="sr-only" htmlFor="concept-explorer-search">
        Buscar concepto
      </label>
      <div className="flex items-center gap-2 border-b border-zinc-200 py-2">
        <Search className="h-4 w-4 text-zinc-400" aria-hidden="true" />
        <input
          id="concept-explorer-search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Buscar concepto"
          className="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
        />
      </div>
      {query.trim() && results.length > 0 ? (
        <div className="flex flex-wrap gap-2" aria-label="Resultados de búsqueda">
          {results.map((concept) => (
            <button
              key={concept.id}
              type="button"
              className="rounded-full bg-zinc-100 px-3 py-1.5 text-sm text-zinc-700 outline-none hover:bg-zinc-200 focus-visible:ring-2 focus-visible:ring-zinc-400"
              onClick={() => onFocusConcept(concept.id)}
            >
              {concept.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ConceptGraph({
  graph,
  selectedConceptId,
  onFocusConcept,
}: {
  graph: ExplorerGraph;
  selectedConceptId: string | null;
  onFocusConcept: (conceptId: string) => void;
}) {
  return (
    <div className="overflow-x-auto" aria-label="Mapa de conexiones">
      <svg
        role="img"
        aria-label="Mapa de conceptos conectados"
        viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
        className="min-h-[22rem] w-full min-w-[34rem]"
      >
        <title>Mapa de conceptos conectados</title>
        {graph.edges.map((edge) => {
          const source = graph.nodes.find((node) => node.conceptId === edge.sourceId);
          const target = graph.nodes.find((node) => node.conceptId === edge.targetId);

          if (!source || !target) {
            return null;
          }

          return (
            <line
              key={`${edge.sourceId}-${edge.targetId}`}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke={getGraphStroke(edge.strength)}
              strokeWidth={getGraphStrokeWidth(edge.strength)}
              strokeLinecap="round"
            />
          );
        })}
        {graph.nodes.map((node) => (
          <g
            key={node.conceptId}
            role="button"
            tabIndex={0}
            aria-label={`Enfocar ${node.label}`}
            className="cursor-pointer outline-none"
            onClick={() => onFocusConcept(node.conceptId)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onFocusConcept(node.conceptId);
              }
            }}
          >
            <title>
              {node.label} · {node.memoryCount}{" "}
              {node.memoryCount === 1 ? "recuerdo" : "recuerdos"}
            </title>
            <circle
              cx={node.x}
              cy={node.y}
              r={node.selected || node.conceptId === selectedConceptId ? 34 : 25}
              fill={node.selected ? "#18181b" : "#f4f4f5"}
              stroke={node.conceptId === selectedConceptId ? "#18181b" : "#d4d4d8"}
              strokeWidth={node.selected ? 2 : 1}
            />
            <text
              x={node.x}
              y={node.y + 50}
              textAnchor="middle"
              className="fill-zinc-700 text-[13px]"
            >
              {truncateGraphLabel(node.label)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function SelectedConceptSummary({ node }: { node: ConceptGraphNode }) {
  return (
    <section className="space-y-2" aria-label="Concepto seleccionado">
      <h2 className="text-sm font-medium text-zinc-500">Foco</h2>
      <p className="text-lg font-medium text-zinc-950">{node.label}</p>
      <p className="text-sm leading-6 text-zinc-600">
        {node.memoryCount} {node.memoryCount === 1 ? "recuerdo relacionado" : "recuerdos relacionados"}
      </p>
      <Link
        href={getConceptExplorationPath(node.conceptId, { returnTo: "/concepts/explore" })}
        className="inline-flex text-sm font-medium text-zinc-700 outline-none hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
      >
        Ver perfil
      </Link>
    </section>
  );
}

function ConnectionList({
  selectedConceptId,
  connections,
  onFocusConcept,
}: {
  selectedConceptId: string | null;
  connections: ReturnType<typeof deriveConceptRelationships>;
  onFocusConcept: (conceptId: string) => void;
}) {
  if (!selectedConceptId || connections.length === 0) {
    return (
      <section className="space-y-2" aria-label="Conexiones del foco">
        <h2 className="text-sm font-medium text-zinc-500">Conexiones del foco</h2>
        <p className="text-sm leading-6 text-zinc-500">
          No hay suficientes conexiones todavía.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3" aria-label="Conexiones del foco">
      <h2 className="text-sm font-medium text-zinc-500">Conexiones del foco</h2>
      <div className="space-y-3">
        {connections.map((connection) => (
          <article key={connection.targetConceptId} className="space-y-1">
            <p className="font-medium text-zinc-900">{connection.targetLabel}</p>
            <p className="text-sm leading-6 text-zinc-500">
              {formatStrength(connection.strength)} · {connection.sharedMemoryCount}{" "}
              {connection.sharedMemoryCount === 1
                ? "recuerdo compartido"
                : "recuerdos compartidos"}
            </p>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link
                href={getConceptExplorationPath(connection.targetConceptId, {
                  returnTo: getConceptKnowledgeExplorerPath({ focus: selectedConceptId }),
                })}
                className="font-medium text-zinc-700 outline-none hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
              >
                Ver perfil
              </Link>
              <button
                type="button"
                className="font-medium text-zinc-600 outline-none hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
                onClick={() => onFocusConcept(connection.targetConceptId)}
              >
                Enfocar
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ExplorerEmptyState() {
  return (
    <div className="space-y-4 py-12">
      <div>
        <h2 className="text-lg font-medium text-zinc-950">
          No hay suficientes conexiones todavía.
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-600">
          El mapa aparece cuando varios conceptos comparten recuerdos aceptados.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/">Volver a capturar</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/concepts">Explorar conceptos</Link>
        </Button>
      </div>
    </div>
  );
}

function ExplorerMessage({
  heading,
  message,
}: {
  heading: string;
  message: string;
}) {
  return (
    <div className="max-w-xl rounded-lg bg-zinc-50 px-4 py-5">
      <h2 className="text-base font-medium text-zinc-950">{heading}</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600">{message}</p>
    </div>
  );
}

function deriveExplorerGraph({
  focusId,
  contexts,
  relations,
  nodes,
}: {
  focusId: string | null;
  contexts: Context[];
  relations: NodeContextRelation[];
  nodes: Node[];
}): ExplorerGraph {
  const activeFocus =
    focusId && contexts.some((context) => context.id === focusId && context.archivedAt === null)
      ? focusId
      : null;
  const neighborhood = activeFocus
    ? deriveConceptGraphNeighborhood({
        currentConceptId: activeFocus,
        contexts,
        relations,
        nodes,
        limit: MAX_GLOBAL_NODES - 1,
      })
    : deriveGlobalGraphNeighborhood({ contexts, relations, nodes });

  if (!neighborhood) {
    return { center: null, nodes: [], edges: [] };
  }

  return {
    center: neighborhood.center,
    nodes: positionGraphNodes(neighborhood),
    edges: neighborhood.edges,
  };
}

function deriveGlobalGraphNeighborhood({
  contexts,
  relations,
  nodes,
}: {
  contexts: Context[];
  relations: NodeContextRelation[];
  nodes: Node[];
}): ConceptGraphNeighborhood | null {
  const activeConcepts = contexts.filter((context) => context.archivedAt === null);
  const candidates = activeConcepts
    .map((concept) => ({
      concept,
      relationships: deriveConceptRelationships({
        sourceConceptId: concept.id,
        contexts,
        relations,
        nodes,
        limit: 4,
      }),
    }))
    .filter((candidate) => candidate.relationships.length > 0)
    .sort(
      (first, second) =>
        second.relationships.length - first.relationships.length ||
        first.concept.name.localeCompare(second.concept.name),
    );
  const centerCandidate = candidates[0] ?? null;

  if (!centerCandidate) {
    return null;
  }

  return deriveConceptGraphNeighborhood({
    currentConceptId: centerCandidate.concept.id,
    contexts,
    relations,
    nodes,
    limit: MAX_GLOBAL_NODES - 1,
  });
}

function positionGraphNodes(neighborhood: ConceptGraphNeighborhood): PositionedGraphNode[] {
  const [center, ...neighbors] = neighborhood.nodes;
  const radius = 150;
  const positioned: PositionedGraphNode[] = [
    {
      ...center,
      x: CENTER_X,
      y: CENTER_Y,
      selected: true,
    },
  ];

  neighbors.slice(0, MAX_GLOBAL_NODES - 1).forEach((node, index, list) => {
    const angle = (-Math.PI / 2) + (2 * Math.PI * index) / Math.max(list.length, 1);

    positioned.push({
      ...node,
      x: Math.round(CENTER_X + Math.cos(angle) * radius),
      y: Math.round(CENTER_Y + Math.sin(angle) * radius),
      selected: false,
    });
  });

  return positioned;
}

function searchConcepts({
  contexts,
  query,
}: {
  contexts: Context[];
  query: string;
}) {
  const normalizedQuery = query.trim().toLocaleLowerCase("es");

  if (!normalizedQuery) {
    return [];
  }

  return contexts
    .filter((context) => {
      if (context.archivedAt !== null) {
        return false;
      }

      return [context.name, ...(context.aliases ?? [])].some((label) =>
        label.toLocaleLowerCase("es").includes(normalizedQuery),
      );
    })
    .sort((first, second) => first.name.localeCompare(second.name));
}

function getGraphStroke(strength: RelationshipStrength) {
  return strength === "STRONG"
    ? "#52525b"
    : strength === "MEDIUM"
      ? "#a1a1aa"
      : "#d4d4d8";
}

function getGraphStrokeWidth(strength: RelationshipStrength) {
  return strength === "STRONG" ? 4 : strength === "MEDIUM" ? 2.5 : 1.5;
}

function formatStrength(strength: RelationshipStrength) {
  return strength === "STRONG"
    ? "frecuente"
    : strength === "MEDIUM"
      ? "estable"
      : "ocasional";
}

function truncateGraphLabel(label: string) {
  return label.length > 22 ? `${label.slice(0, 19)}...` : label;
}
