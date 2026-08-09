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
  level: 0 | 1 | 2;
  parentIds: string[];
  hiddenRelatedCount: number;
}

interface PositionedGraphEdge extends ConceptGraphEdge {
  level: 1 | 2;
}

interface ExplorerGraph {
  center: ConceptGraphNode | null;
  nodes: PositionedGraphNode[];
  edges: PositionedGraphEdge[];
}

interface GraphViewTransform {
  scale: number;
  x: number;
  y: number;
}

interface GraphPoint {
  x: number;
  y: number;
}

const CONCEPT_EXPLORER_INVALIDATION_TYPES = [
  "capture",
  "concept",
  "captureConcept",
] as const;
const DIRECT_RELATIONSHIP_LIMIT = 8;
const SECONDARY_PREVIEW_PER_BRANCH = 4;
const MAX_VISIBLE_GRAPH_NODES = 32;
const GRAPH_WIDTH = 760;
const GRAPH_HEIGHT = 440;
const CENTER_X = GRAPH_WIDTH / 2;
const CENTER_Y = GRAPH_HEIGHT / 2;

export function ConceptKnowledgeExplorerClient({
  embedded = false,
  workspaceMode = false,
  initialFocusId = null,
  initialViewTransform,
  selectedConceptId: controlledSelectedConceptId = null,
  onBack,
  onSelectConcept,
  onOpenConcept,
  onViewTransformChange,
}: {
  embedded?: boolean;
  workspaceMode?: boolean;
  initialFocusId?: string | null;
  initialViewTransform?: GraphViewTransform;
  selectedConceptId?: string | null;
  onBack?: () => void;
  onSelectConcept?: (conceptId: string) => void;
  onOpenConcept?: (conceptId: string) => void;
  onViewTransformChange?: (transform: GraphViewTransform) => void;
} = {}) {
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
  const [viewTransform, setViewTransform] = useState<GraphViewTransform>({
    scale: initialViewTransform?.scale ?? 1,
    x: initialViewTransform?.x ?? 0,
    y: initialViewTransform?.y ?? 0,
  });
  const [manualNodePositions, setManualNodePositions] = useState<
    Map<string, GraphPoint>
  >(new Map());

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

  const activeFocusId =
    controlledSelectedConceptId ?? selectedConceptId ?? initialFocusId ?? focusId;

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

  useEffect(() => {
    onViewTransformChange?.(viewTransform);
  }, [onViewTransformChange, viewTransform]);

  function focusConcept(conceptId: string) {
    setManualNodePositions(new Map());
    setViewTransform({ scale: 1, x: 0, y: 0 });
    setSelectedConceptId(conceptId);
    onSelectConcept?.(conceptId);
    if (embedded) {
      return;
    }

    router.push(getConceptKnowledgeExplorerPath({ focus: conceptId }));
  }

  function goBack() {
    if (embedded) {
      onBack?.();
      return;
    }

    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/concepts");
  }

  if (vinemaContext.status === "loading" || loadState === "loading") {
    return (
      <ExplorerShell
        onBack={goBack}
        backLabel={embedded ? "Volver a conceptos" : "Volver"}
        workspaceMode={workspaceMode}
      >
        <p className="text-sm text-zinc-500">Cargando conexiones...</p>
      </ExplorerShell>
    );
  }

  if (vinemaContext.status === "error") {
    return (
      <ExplorerShell
        onBack={goBack}
        backLabel={embedded ? "Volver a conceptos" : "Volver"}
        workspaceMode={workspaceMode}
      >
        <ExplorerMessage
          heading="No se pudo cargar Vinema"
          message={vinemaContext.error}
        />
      </ExplorerShell>
    );
  }

  if (loadState === "error") {
    return (
      <ExplorerShell
        onBack={goBack}
        backLabel={embedded ? "Volver a conceptos" : "Volver"}
        workspaceMode={workspaceMode}
      >
        <ExplorerMessage
          heading="No se pudo explorar conocimiento"
          message={error ?? "Intenta volver a Conceptos y abrirlo nuevamente."}
        />
      </ExplorerShell>
    );
  }

  const hasEnoughConnections = graph.edges.length > 0 && graph.nodes.length > 1;

  return (
    <ExplorerShell
      onBack={goBack}
      backLabel={embedded ? "Volver a conceptos" : "Volver"}
      workspaceMode={workspaceMode}
    >
      <div
        className={
          workspaceMode
            ? "flex h-full min-h-0 flex-col overflow-hidden"
            : "grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
        }
      >
        <div className="flex min-h-0 min-w-0 flex-col gap-5">
          {workspaceMode ? null : (
            <ConceptSearch
              query={query}
              results={searchResults}
              onQueryChange={setQuery}
              onFocusConcept={focusConcept}
            />
          )}

          {hasEnoughConnections ? (
            <div className="relative min-h-0 flex-1 overflow-hidden" data-concept-map-pane="">
              {workspaceMode ? (
                <div className="absolute right-3 top-3 z-10 flex rounded-md border border-zinc-200 bg-white/90">
                  <button
                    type="button"
                    className="h-8 w-8 text-sm text-zinc-600 hover:text-zinc-950"
                    aria-label="Alejar mapa"
                    onClick={() =>
                      setViewTransform((current) => ({
                        ...current,
                        scale: Math.max(0.65, current.scale - 0.1),
                      }))
                    }
                  >
                    -
                  </button>
                  <button
                    type="button"
                    className="h-8 w-8 text-sm text-zinc-600 hover:text-zinc-950"
                    aria-label="Acercar mapa"
                    onClick={() =>
                      setViewTransform((current) => ({
                        ...current,
                        scale: Math.min(1.8, current.scale + 0.1),
                      }))
                    }
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="h-8 px-2 text-xs font-medium text-zinc-600 hover:text-zinc-950"
                    aria-label="Centrar mapa"
                    onClick={() => setViewTransform({ scale: 1, x: 0, y: 0 })}
                  >
                    centrar
                  </button>
                </div>
              ) : null}
              <ConceptGraph
                graph={graph}
                selectedConceptId={selectedNode?.conceptId ?? null}
                onFocusConcept={focusConcept}
                viewTransform={
                  workspaceMode ? viewTransform : { scale: 1, x: 0, y: 0 }
                }
                onViewTransformChange={setViewTransform}
                manualNodePositions={manualNodePositions}
                onManualNodePositionsChange={setManualNodePositions}
              />
            </div>
          ) : (
            <ExplorerEmptyState embedded={embedded} onBack={goBack} />
          )}
        </div>

        {workspaceMode ? null : (
        <aside className="vinema-scrollbar min-h-0 space-y-5 overflow-y-auto pr-1">
          {selectedNode ? (
            <SelectedConceptSummary
              node={selectedNode}
              embedded={embedded}
              onOpenConcept={onOpenConcept}
            />
          ) : null}
          <ConnectionList
            selectedConceptId={selectedNode?.conceptId ?? null}
            connections={selectedConnections}
            onFocusConcept={focusConcept}
            embedded={embedded}
            onOpenConcept={onOpenConcept}
          />
        </aside>
        )}
      </div>
    </ExplorerShell>
  );
}

function ExplorerShell({
  children,
  onBack,
  backLabel = "Volver",
  workspaceMode = false,
}: {
  children: React.ReactNode;
  onBack: () => void;
  backLabel?: string;
  workspaceMode?: boolean;
}) {
  return (
    <section
      className={
        workspaceMode
          ? "flex h-full min-h-0 w-full flex-col overflow-hidden"
          : "mx-auto flex h-full min-h-0 w-full max-w-6xl flex-1 flex-col gap-6 overflow-hidden px-4 py-4 sm:px-6 lg:px-8"
      }
      data-knowledge-explorer-canvas=""
      data-concept-map-workspace={workspaceMode ? "" : undefined}
    >
      {workspaceMode ? null : (
        <header className="shrink-0 space-y-5">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            {backLabel}
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
      )}
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
  viewTransform,
  onViewTransformChange,
  manualNodePositions,
  onManualNodePositionsChange,
}: {
  graph: ExplorerGraph;
  selectedConceptId: string | null;
  onFocusConcept: (conceptId: string) => void;
  viewTransform: GraphViewTransform;
  onViewTransformChange: (value: GraphViewTransform | ((current: GraphViewTransform) => GraphViewTransform)) => void;
  manualNodePositions: Map<string, GraphPoint>;
  onManualNodePositionsChange: (
    value: Map<string, GraphPoint> | ((current: Map<string, GraphPoint>) => Map<string, GraphPoint>),
  ) => void;
}) {
  const [hoveredConceptId, setHoveredConceptId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<
    | { kind: "pan"; startX: number; startY: number; origin: GraphViewTransform }
    | { kind: "node"; conceptId: string }
    | null
  >(null);
  const displayNodes = useMemo(
    () =>
      graph.nodes.map((node) => ({
        ...node,
        ...(manualNodePositions.get(node.conceptId) ?? {}),
      })),
    [graph.nodes, manualNodePositions],
  );
  const connectedToHover = useMemo(() => {
    if (!hoveredConceptId) {
      return new Set<string>();
    }

    const connected = new Set<string>([hoveredConceptId]);

    for (const edge of graph.edges) {
      if (edge.sourceId === hoveredConceptId) {
        connected.add(edge.targetId);
      }

      if (edge.targetId === hoveredConceptId) {
        connected.add(edge.sourceId);
      }
    }

    return connected;
  }, [graph.edges, hoveredConceptId]);

  function getGraphPoint(event: React.MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const rawX = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * GRAPH_WIDTH;
    const rawY = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * GRAPH_HEIGHT;

    return {
      x: (rawX - viewTransform.x) / viewTransform.scale,
      y: (rawY - viewTransform.y) / viewTransform.scale,
      rawX,
      rawY,
    };
  }

  function handleWheel(event: React.WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const rawX = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * GRAPH_WIDTH;
    const rawY = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * GRAPH_HEIGHT;
    const nextScale = Math.min(
      1.8,
      Math.max(0.65, viewTransform.scale + (event.deltaY > 0 ? -0.08 : 0.08)),
    );
    const graphX = (rawX - viewTransform.x) / viewTransform.scale;
    const graphY = (rawY - viewTransform.y) / viewTransform.scale;

    onViewTransformChange({
      scale: nextScale,
      x: rawX - graphX * nextScale,
      y: rawY - graphY * nextScale,
    });
  }

  return (
    <div
      className="h-full min-h-0 flex-1 overflow-hidden overscroll-contain"
      aria-label="Mapa de conexiones"
    >
      <svg
        role="img"
        aria-label="Mapa de conceptos conectados"
        viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
        className="h-full min-h-[22rem] w-full touch-none select-none"
        data-concept-graph-transform={`${viewTransform.scale.toFixed(2)},${Math.round(viewTransform.x)},${Math.round(viewTransform.y)}`}
        onWheel={handleWheel}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setDragState({
              kind: "pan",
              startX: event.clientX,
              startY: event.clientY,
              origin: viewTransform,
            });
          }
        }}
        onMouseMove={(event) => {
          if (!dragState) {
            return;
          }

          if (dragState.kind === "pan") {
            onViewTransformChange({
              ...dragState.origin,
              x: dragState.origin.x + (event.clientX - dragState.startX),
              y: dragState.origin.y + (event.clientY - dragState.startY),
            });
            return;
          }

          const point = getGraphPoint(event);
          onManualNodePositionsChange((current) => {
            const next = new Map(current);
            next.set(dragState.conceptId, {
              x: clampGraphCoordinate(point.x, 36, GRAPH_WIDTH - 36),
              y: clampGraphCoordinate(point.y, 30, GRAPH_HEIGHT - 30),
            });
            return next;
          });
        }}
        onMouseUp={() => setDragState(null)}
        onMouseLeave={() => {
          setDragState(null);
          setHoveredConceptId(null);
        }}
      >
        <title>Mapa de conceptos conectados</title>
        <g
          transform={`translate(${viewTransform.x} ${viewTransform.y}) scale(${viewTransform.scale})`}
        >
        {graph.edges.map((edge) => {
          const source = displayNodes.find((node) => node.conceptId === edge.sourceId);
          const target = displayNodes.find((node) => node.conceptId === edge.targetId);

          if (!source || !target) {
            return null;
          }
          const highlighted =
            !hoveredConceptId ||
            edge.sourceId === hoveredConceptId ||
            edge.targetId === hoveredConceptId;

          return (
            <line
              key={`${edge.sourceId}-${edge.targetId}`}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke={getGraphStroke(edge.strength)}
              strokeWidth={getGraphStrokeWidth(edge)}
              opacity={highlighted ? (edge.level === 2 ? 0.45 : 1) : 0.16}
              strokeLinecap="round"
              data-concept-graph-edge-level={edge.level}
              data-concept-graph-edge-source={edge.sourceId}
              data-concept-graph-edge-target={edge.targetId}
            />
          );
        })}
        {displayNodes.map((node) => {
          const muted =
            hoveredConceptId !== null && !connectedToHover.has(node.conceptId);
          const active =
            node.selected ||
            node.conceptId === selectedConceptId ||
            node.conceptId === hoveredConceptId;

          return (
          <g
            key={node.conceptId}
            role="button"
            tabIndex={0}
            aria-label={`Enfocar ${node.label}`}
            className="cursor-pointer outline-none"
            data-concept-graph-node-level={node.level}
            onMouseEnter={() => setHoveredConceptId(node.conceptId)}
            onMouseLeave={() => setHoveredConceptId(null)}
            onMouseDown={(event) => {
              event.stopPropagation();
              setDragState({ kind: "node", conceptId: node.conceptId });
            }}
            onClick={() => onFocusConcept(node.conceptId)}
            onDoubleClick={() => onFocusConcept(node.conceptId)}
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
              r={getGraphNodeRadius(node, selectedConceptId, active)}
              fill={getGraphNodeFill(node, active)}
              stroke={getGraphNodeStroke(node, selectedConceptId)}
              strokeWidth={active ? 2 : 1}
              opacity={muted ? 0.42 : 1}
            />
            <text
              x={node.x}
              y={node.y + getGraphLabelOffset(node)}
              textAnchor="middle"
              className={
                node.level === 2
                  ? "fill-zinc-500 text-[11px]"
                  : "fill-zinc-700 text-[13px]"
              }
              opacity={muted ? 0.45 : 1}
            >
              {truncateGraphLabel(node.label)}
            </text>
            {node.hiddenRelatedCount > 0 ? (
              <text
                x={node.x + getGraphNodeRadius(node, selectedConceptId) + 12}
                y={node.y - getGraphNodeRadius(node, selectedConceptId) + 4}
                textAnchor="middle"
                className="fill-zinc-400 text-[11px]"
                data-concept-graph-hidden-count=""
              >
                +{node.hiddenRelatedCount}
              </text>
            ) : null}
          </g>
          );
        })}
        </g>
      </svg>
    </div>
  );
}

function SelectedConceptSummary({
  node,
  embedded = false,
  onOpenConcept,
}: {
  node: ConceptGraphNode;
  embedded?: boolean;
  onOpenConcept?: (conceptId: string) => void;
}) {
  return (
    <section className="space-y-2" aria-label="Concepto seleccionado">
      <h2 className="text-sm font-medium text-zinc-500">Foco</h2>
      <p className="text-lg font-medium text-zinc-950">{node.label}</p>
      <p className="text-sm leading-6 text-zinc-600">
        {node.memoryCount} {node.memoryCount === 1 ? "recuerdo relacionado" : "recuerdos relacionados"}
      </p>
      {embedded ? (
        <button
          type="button"
          className="inline-flex text-sm font-medium text-zinc-700 outline-none hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
          onClick={() => onOpenConcept?.(node.conceptId)}
        >
          Ver perfil
        </button>
      ) : (
        <Link
          href={getConceptExplorationPath(node.conceptId, { returnTo: "/concepts/explore" })}
          className="inline-flex text-sm font-medium text-zinc-700 outline-none hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
        >
          Ver perfil
        </Link>
      )}
    </section>
  );
}

function ConnectionList({
  selectedConceptId,
  connections,
  onFocusConcept,
  embedded = false,
  onOpenConcept,
}: {
  selectedConceptId: string | null;
  connections: ReturnType<typeof deriveConceptRelationships>;
  onFocusConcept: (conceptId: string) => void;
  embedded?: boolean;
  onOpenConcept?: (conceptId: string) => void;
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
              {embedded ? (
                <button
                  type="button"
                  className="font-medium text-zinc-700 outline-none hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
                  onClick={() => onOpenConcept?.(connection.targetConceptId)}
                >
                  Ver perfil
                </button>
              ) : (
                <Link
                  href={getConceptExplorationPath(connection.targetConceptId, {
                    returnTo: getConceptKnowledgeExplorerPath({ focus: selectedConceptId }),
                  })}
                  className="font-medium text-zinc-700 outline-none hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
                >
                  Ver perfil
                </Link>
              )}
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

function ExplorerEmptyState({
  embedded = false,
  onBack,
}: {
  embedded?: boolean;
  onBack?: () => void;
}) {
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
      {embedded ? (
        <Button type="button" variant="ghost" onClick={onBack}>
          Volver a conceptos
        </Button>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/">Volver a capturar</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/concepts">Conceptos</Link>
          </Button>
        </div>
      )}
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
    focusId && contexts.some((context) => context.id === focusId) ? focusId : null;
  const centerId = activeFocus ?? deriveGlobalCenterId({ contexts, relations, nodes });

  if (!centerId) {
    return { center: null, nodes: [], edges: [] };
  }

  return deriveTwoLevelExplorerGraph({
    centerId,
    contexts,
    relations,
    nodes,
  });
}

function deriveGlobalCenterId({
  contexts,
  relations,
  nodes,
}: {
  contexts: Context[];
  relations: NodeContextRelation[];
  nodes: Node[];
}): string | null {
  const candidates = contexts
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

  return centerCandidate.concept.id;
}

function deriveTwoLevelExplorerGraph({
  centerId,
  contexts,
  relations,
  nodes,
}: {
  centerId: string;
  contexts: Context[];
  relations: NodeContextRelation[];
  nodes: Node[];
}): ExplorerGraph {
  const neighborhood = deriveConceptGraphNeighborhood({
    currentConceptId: centerId,
    contexts,
    relations,
    nodes,
    limit: DIRECT_RELATIONSHIP_LIMIT,
  });

  if (!neighborhood) {
    return { center: null, nodes: [], edges: [] };
  }

  const memoryCounts = countMemoriesByConcept({ contexts, relations, nodes });
  const nodeRecords = new Map<string, PositionedGraphNode>();
  const edgeRecords = new Map<string, PositionedGraphEdge>();
  const directConceptIds = new Set(
    neighborhood.nodes.slice(1).map((node) => node.conceptId),
  );

  for (const [index, node] of neighborhood.nodes.entries()) {
    nodeRecords.set(node.conceptId, {
      ...node,
      x: CENTER_X,
      y: CENTER_Y,
      selected: index === 0,
      level: index === 0 ? 0 : 1,
      parentIds: index === 0 ? [] : [centerId],
      hiddenRelatedCount: 0,
    });
  }

  for (const edge of neighborhood.edges) {
    edgeRecords.set(getEdgeKey(edge.sourceId, edge.targetId), {
      ...edge,
      level: 1,
    });
  }

  for (const directNode of neighborhood.nodes.slice(1)) {
    const secondaryRelationships = deriveConceptRelationships({
      sourceConceptId: directNode.conceptId,
      contexts,
      relations,
      nodes,
      limit: SECONDARY_PREVIEW_PER_BRANCH + 8,
    }).filter((relationship) => relationship.targetConceptId !== centerId);
    let shownForBranch = 0;
    let hiddenForBranch = 0;

    for (const relationship of secondaryRelationships) {
      if (shownForBranch >= SECONDARY_PREVIEW_PER_BRANCH) {
        hiddenForBranch += 1;
        continue;
      }

      const targetId = relationship.targetConceptId;
      const existingNode = nodeRecords.get(targetId);
      const createsNewSecondary = !existingNode && !directConceptIds.has(targetId);

      if (createsNewSecondary && nodeRecords.size >= MAX_VISIBLE_GRAPH_NODES) {
        hiddenForBranch += 1;
        continue;
      }

      if (!existingNode) {
        nodeRecords.set(targetId, {
          conceptId: targetId,
          label: relationship.targetLabel,
          memoryCount: memoryCounts.get(targetId) ?? 0,
          x: CENTER_X,
          y: CENTER_Y,
          selected: false,
          level: 2,
          parentIds: [directNode.conceptId],
          hiddenRelatedCount: 0,
        });
      } else if (!existingNode.parentIds.includes(directNode.conceptId)) {
        existingNode.parentIds.push(directNode.conceptId);
      }

      edgeRecords.set(getEdgeKey(directNode.conceptId, targetId), {
        sourceId: directNode.conceptId,
        targetId,
        strength: relationship.strength,
        sharedMemoryCount: relationship.sharedMemoryCount,
        level: 2,
      });
      shownForBranch += 1;
    }

    const nodeRecord = nodeRecords.get(directNode.conceptId);

    if (nodeRecord) {
      nodeRecord.hiddenRelatedCount = hiddenForBranch;
    }
  }

  const positioned = positionGraphNodes({
    centerId,
    nodes: Array.from(nodeRecords.values()),
    edges: Array.from(edgeRecords.values()),
  });

  return {
    center: neighborhood.center,
    nodes: positioned,
    edges: Array.from(edgeRecords.values()),
  };
}

function positionGraphNodes({
  centerId,
  nodes,
  edges,
}: {
  centerId: string;
  nodes: PositionedGraphNode[];
  edges: PositionedGraphEdge[];
}): PositionedGraphNode[] {
  const center = nodes.find((node) => node.conceptId === centerId);

  if (!center) {
    return [];
  }

  const directNodes = nodes.filter((node) => node.level === 1);
  const secondaryNodes = nodes.filter((node) => node.level === 2);
  const positioned = new Map<string, PositionedGraphNode>();

  positioned.set(center.conceptId, {
    ...center,
    x: CENTER_X,
    y: CENTER_Y,
    selected: true,
  });

  directNodes.forEach((node, index, list) => {
    const angle = (-Math.PI / 2) + (2 * Math.PI * index) / Math.max(list.length, 1);

    positioned.set(node.conceptId, {
      ...node,
      x: Math.round(CENTER_X + Math.cos(angle) * 138),
      y: Math.round(CENTER_Y + Math.sin(angle) * 118),
    });
  });

  secondaryNodes.forEach((node, index) => {
    const parentPositions = node.parentIds
      .map((parentId) => positioned.get(parentId))
      .filter((parent): parent is PositionedGraphNode => Boolean(parent));
    const anchor =
      parentPositions.length > 0
        ? {
            x: parentPositions.reduce((sum, parent) => sum + parent.x, 0) / parentPositions.length,
            y: parentPositions.reduce((sum, parent) => sum + parent.y, 0) / parentPositions.length,
          }
        : { x: CENTER_X, y: CENTER_Y };
    const outwardX = anchor.x - CENTER_X;
    const outwardY = anchor.y - CENTER_Y;
    const magnitude = Math.hypot(outwardX, outwardY) || 1;
    const siblingOffset = ((index % 5) - 2) * 18;
    const perpendicularX = -outwardY / magnitude;
    const perpendicularY = outwardX / magnitude;

    positioned.set(node.conceptId, {
      ...node,
      x: clampGraphCoordinate(
        Math.round(anchor.x + (outwardX / magnitude) * 88 + perpendicularX * siblingOffset),
        52,
        GRAPH_WIDTH - 52,
      ),
      y: clampGraphCoordinate(
        Math.round(anchor.y + (outwardY / magnitude) * 74 + perpendicularY * siblingOffset),
        42,
        GRAPH_HEIGHT - 44,
      ),
    });
  });

  return applyControlledForceLayout({
    centerId,
    nodes: Array.from(positioned.values()),
    edges,
  });
}

function applyControlledForceLayout({
  centerId,
  nodes,
  edges,
}: {
  centerId: string;
  nodes: PositionedGraphNode[];
  edges: PositionedGraphEdge[];
}) {
  const working = nodes.map((node) => ({ ...node }));
  const velocities = new Map<string, GraphPoint>();

  for (const node of working) {
    velocities.set(node.conceptId, { x: 0, y: 0 });
  }

  for (let tick = 0; tick < 72; tick += 1) {
    const alpha = 0.08 * (1 - tick / 72);

    for (let firstIndex = 0; firstIndex < working.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < working.length; secondIndex += 1) {
        const first = working[firstIndex];
        const second = working[secondIndex];
        const dx = second.x - first.x || 0.01;
        const dy = second.y - first.y || 0.01;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const minDistance = getGraphNodeRadius(first, null) + getGraphNodeRadius(second, null) + 26;
        const force = Math.min(6, (minDistance * minDistance) / (distance * distance)) * alpha;
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;

        pushVelocity(velocities, first.conceptId, -fx, -fy);
        pushVelocity(velocities, second.conceptId, fx, fy);
      }
    }

    for (const edge of edges) {
      const source = working.find((node) => node.conceptId === edge.sourceId);
      const target = working.find((node) => node.conceptId === edge.targetId);

      if (!source || !target) {
        continue;
      }

      const dx = target.x - source.x || 0.01;
      const dy = target.y - source.y || 0.01;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const desired = edge.level === 1 ? 142 : 92;
      const force = (distance - desired) * 0.012 * alpha;
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;

      if (source.conceptId !== centerId) {
        pushVelocity(velocities, source.conceptId, fx, fy);
      }
      pushVelocity(velocities, target.conceptId, -fx, -fy);
    }

    for (const node of working) {
      if (node.conceptId === centerId) {
        node.x = CENTER_X;
        node.y = CENTER_Y;
        continue;
      }

      const vx = velocities.get(node.conceptId)?.x ?? 0;
      const vy = velocities.get(node.conceptId)?.y ?? 0;
      const centerPull = node.level === 1 ? 0.015 : 0.006;

      node.x = clampGraphCoordinate(
        node.x + vx - (node.x - CENTER_X) * centerPull * alpha,
        44,
        GRAPH_WIDTH - 44,
      );
      node.y = clampGraphCoordinate(
        node.y + vy - (node.y - CENTER_Y) * centerPull * alpha,
        38,
        GRAPH_HEIGHT - 42,
      );
      velocities.set(node.conceptId, { x: vx * 0.55, y: vy * 0.55 });
    }
  }

  return working;
}

function pushVelocity(
  velocities: Map<string, GraphPoint>,
  conceptId: string,
  x: number,
  y: number,
) {
  const current = velocities.get(conceptId) ?? { x: 0, y: 0 };
  velocities.set(conceptId, {
    x: current.x + x,
    y: current.y + y,
  });
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
      return [context.name, ...(context.aliases ?? [])].some((label) =>
        label.toLocaleLowerCase("es").includes(normalizedQuery),
      );
    })
    .sort((first, second) => first.name.localeCompare(second.name));
}

function getGraphStroke(strength: RelationshipStrength) {
  return strength === "STRONG"
    ? "var(--vinema-text-muted)"
    : strength === "MEDIUM"
      ? "var(--vinema-text-faint)"
      : "var(--vinema-border)";
}

function getGraphStrokeWidth(edge: PositionedGraphEdge) {
  const base =
    edge.strength === "STRONG" ? 4 : edge.strength === "MEDIUM" ? 2.5 : 1.5;

  return edge.level === 2 ? Math.max(1, base * 0.55) : base;
}

function getGraphNodeRadius(
  node: PositionedGraphNode,
  selectedConceptId: string | null,
  active = false,
) {
  if (node.selected || node.conceptId === selectedConceptId) {
    return 34;
  }

  if (node.level === 1) {
    return active ? 27 : 24;
  }

  return active ? 16 : 14;
}

function getGraphNodeFill(node: PositionedGraphNode, active = false) {
  if (node.selected) {
    return "var(--vinema-text-primary)";
  }

  if (active) {
    return node.level === 1 ? "var(--vinema-hover)" : "var(--vinema-surface)";
  }

  return node.level === 1
    ? "var(--vinema-surface)"
    : "var(--vinema-canvas-surface)";
}

function getGraphNodeStroke(
  node: PositionedGraphNode,
  selectedConceptId: string | null,
) {
  if (node.conceptId === selectedConceptId) {
    return "var(--vinema-text-primary)";
  }

  return node.level === 1 ? "var(--vinema-border)" : "var(--vinema-border-subtle)";
}

function getGraphLabelOffset(node: PositionedGraphNode) {
  return node.level === 2 ? 31 : 50;
}

function countMemoriesByConcept({
  contexts,
  relations,
  nodes,
}: {
  contexts: Context[];
  relations: NodeContextRelation[];
  nodes: Node[];
}) {
  const activeConceptIds = new Set(
    contexts.map((context) => context.id),
  );
  const activeNodeIds = new Set(
    nodes
      .filter((node) => node.deletedAt === null)
      .map((node) => node.id),
  );
  const nodeIdsByConcept = new Map<string, Set<string>>();

  for (const relation of relations) {
    if (
      !activeConceptIds.has(relation.contextId) ||
      !activeNodeIds.has(relation.nodeId)
    ) {
      continue;
    }

    const nodeIds = nodeIdsByConcept.get(relation.contextId) ?? new Set<string>();
    nodeIds.add(relation.nodeId);
    nodeIdsByConcept.set(relation.contextId, nodeIds);
  }

  return new Map(
    Array.from(nodeIdsByConcept.entries()).map(([conceptId, nodeIds]) => [
      conceptId,
      nodeIds.size,
    ]),
  );
}

function getEdgeKey(firstConceptId: string, secondConceptId: string) {
  return [firstConceptId, secondConceptId].sort().join("::");
}

function clampGraphCoordinate(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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
