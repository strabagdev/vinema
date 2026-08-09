"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import { Button } from "@/components/ui/button";
import { formatShortDate } from "@/components/app-shell/note-list-item";
import { getContentTimestamp } from "@/features/capture/capture-timestamps";
import type { BehavioralPattern } from "@/features/cognition/behavioral-engine/behavioral-engine";
import { deriveMemoryResponse } from "@/features/cognition/orchestrator";
import type { MemoryEvolutionSignal } from "@/features/cognition/memory-evolution";
import { deriveConceptNeighborhood } from "@/features/exploration/concept-neighborhood";
import type { ConceptProfile } from "@/features/exploration/concept-profile";
import {
  getConceptExpansionSourceFromSearchParams,
  getConceptExplorationPath,
  getConceptIdFromSearchParams,
} from "@/features/exploration/concept-routes";
import type { CaptureEmergentIdentity } from "@/features/identity/capture-emergent-identity";
import { CaptureEmergentIdentityLabel } from "@/features/identity/capture-emergent-identity-view";
import { loadCaptureEmergentIdentities } from "@/features/identity/load-capture-emergent-identities";
import { useVinemaContext } from "@/features/node/hooks/use-vinema-context";
import { getCapturePreview } from "@/features/node/node-display";
import { getNodeDetailPath } from "@/features/node/node-routes";
import { getReturnToFromSearchParams } from "@/features/recovery/recovery-routes";
import { useSyncDataInvalidation } from "@/features/sync/use-sync-data-invalidation";
import {
  contextRepository,
  nodeContextRelationRepository,
  nodeRepository,
} from "@/infrastructure/repositories";

type LoadState = "loading" | "ready" | "error";
type ConceptDetailTab = "memories" | "relations" | "evolution" | "patterns";

const CONCEPT_EXPLORATION_INVALIDATION_TYPES = [
  "capture",
  "concept",
  "captureConcept",
] as const;

export function ConceptExplorationClient({
  embeddedContextId,
  embeddedReturnTo = null,
  workspaceMode = false,
  onBack,
  onOpenConcept,
  onOpenMemory,
  onOpenMemoryIndex,
}: {
  embeddedContextId?: string;
  embeddedReturnTo?: string | null;
  workspaceMode?: boolean;
  onBack?: () => void;
  onOpenConcept?: (conceptId: string) => void;
  onOpenMemory?: (nodeId: string) => void;
  onOpenMemoryIndex?: () => void;
} = {}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const contextId = embeddedContextId ?? getConceptIdFromSearchParams(searchParams);
  const expansionSource = getConceptExpansionSourceFromSearchParams(searchParams);
  const returnTo = embeddedContextId
    ? embeddedReturnTo
    : getReturnToFromSearchParams(searchParams);
  const vinemaContext = useVinemaContext();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [center, setCenter] = useState<Context | null>(null);
  const [memories, setMemories] = useState<Node[]>([]);
  const [workspaceNodes, setWorkspaceNodes] = useState<Node[]>([]);
  const [relations, setRelations] = useState<NodeContextRelation[]>([]);
  const [contexts, setContexts] = useState<Context[]>([]);
  const [identities, setIdentities] = useState<
    Map<string, CaptureEmergentIdentity>
  >(new Map());
  const [conceptHistory, setConceptHistory] = useState<string[]>([]);
  const [tabState, setTabState] = useState<{
    contextId: string | null;
    tab: ConceptDetailTab;
  }>({ contextId: null, tab: "memories" });
  const activeTab =
    tabState.contextId === contextId ? tabState.tab : "memories";
  const setActiveTab = useCallback(
    (tab: ConceptDetailTab) => {
      setTabState({ contextId: contextId ?? null, tab });
    },
    [contextId],
  );
  const neighborhood = useMemo(() => {
    if (!contextId) {
      return null;
    }

    return deriveConceptNeighborhood({
      currentContextId: contextId,
      contexts,
      relations,
      nodes: memories,
    });
  }, [contextId, contexts, memories, relations]);
  const memoryResponse = useMemo(() => {
    if (!contextId) {
      return null;
    }

    return deriveMemoryResponse({
      query: {
        text: center?.name ?? "",
        detectedConceptIds: [contextId],
        selectedConceptIds: [],
        now: new Date(),
      },
      contexts,
      relations,
      nodes: workspaceNodes,
    });
  }, [center?.name, contextId, contexts, relations, workspaceNodes]);
  const profile = useMemo(() => {
    if (!contextId || !memoryResponse) {
      return null;
    }

    return memoryResponse.profiles.find((item) => item.concept.id === contextId) ?? null;
  }, [contextId, memoryResponse]);
  const behavioralPatterns = useMemo(() => {
    if (!contextId || !memoryResponse) {
      return [];
    }

    return memoryResponse.behavioralPatterns.filter((pattern) =>
      pattern.conceptIds.includes(contextId),
    );
  }, [contextId, memoryResponse]);
  const evolutionSignals = useMemo(() => {
    if (!contextId || !memoryResponse) {
      return [];
    }

    return memoryResponse.evolutionSignals.filter(
      (signal) =>
        signal.conceptId === contextId &&
        (signal.strength === "MEDIUM" || signal.strength === "STRONG"),
    );
  }, [contextId, memoryResponse]);
  const loadConcept = useCallback(async () => {
    if (!contextId || vinemaContext.status !== "ready") {
      return;
    }

    setLoadState("loading");
    setError(null);

    try {
      const [nextCenter, nextContexts, nextRelations, nodes] = await Promise.all([
        contextRepository.getById(contextId),
        contextRepository.list({
          workspaceId: vinemaContext.workspace.id,
        }),
        nodeContextRelationRepository.listByWorkspace(vinemaContext.workspace.id),
        nodeRepository.listByWorkspace(vinemaContext.workspace.id),
      ]);

      if (!nextCenter || nextCenter.workspaceId !== vinemaContext.workspace.id) {
        setCenter(null);
        setMemories([]);
        setWorkspaceNodes([]);
        setRelations([]);
        setContexts([]);
        setIdentities(new Map());
        setError("El concepto no existe en este workspace.");
        setLoadState("error");
        return;
      }

      const relatedNodeIds = new Set(
        nextRelations
          .filter((relation) => relation.contextId === nextCenter.id)
          .map((relation) => relation.nodeId),
      );
      const nextMemories = nodes
        .filter((node) => relatedNodeIds.has(node.id))
        .sort(
          (first, second) =>
            Date.parse(getContentTimestamp(second)) -
            Date.parse(getContentTimestamp(first)),
        );

      setCenter(nextCenter);
      setContexts(nextContexts);
      setRelations(nextRelations);
      setWorkspaceNodes(nodes);
      setMemories(nextMemories);
      setIdentities(
        await loadCaptureEmergentIdentities(
          { contextRepository, nodeContextRelationRepository },
          nextMemories.map((node) => node.id),
        ),
      );
      setLoadState("ready");
    } catch {
      setError("No se pudo cargar la base de conocimiento.");
      setLoadState("error");
    }
  }, [contextId, vinemaContext]);

  useSyncDataInvalidation({
    workspaceId:
      vinemaContext.status === "ready" ? vinemaContext.workspace.id : null,
    entityTypes: CONCEPT_EXPLORATION_INVALIDATION_TYPES,
    onInvalidate: () => {
      void loadConcept();
    },
  });

  useEffect(() => {
    queueMicrotask(() => {
      void loadConcept();
    });
  }, [loadConcept]);

  if (!contextId) {
    return (
      <ConceptExplorationMessage
        heading="Falta el concepto"
        message="La URL no incluye un identificador de concepto valido."
        workspaceMode={workspaceMode}
      />
    );
  }

  if (loadState === "loading" || vinemaContext.status === "loading") {
    return (
      <section
        className={
          workspaceMode
            ? "flex h-full min-h-0 items-center px-4 py-6"
            : "mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8"
        }
      >
        <p className="text-sm text-zinc-500">Cargando conocimiento...</p>
      </section>
    );
  }

  if (vinemaContext.status === "error") {
    return (
      <ConceptExplorationMessage
        heading="No se pudo cargar Vinema"
        message={vinemaContext.error}
        workspaceMode={workspaceMode}
      />
    );
  }

  if (!center || loadState === "error") {
    return (
      <ConceptExplorationMessage
        heading="Concepto no encontrado"
        message={error ?? "No existe o no pertenece a este workspace."}
        workspaceMode={workspaceMode}
      />
    );
  }

  function navigateToConcept(nextContextId: string) {
    if (!contextId || nextContextId === contextId) {
      return;
    }

    setConceptHistory((current) => {
      const nextHistory = current[current.length - 1] === contextId
        ? current
        : [...current, contextId];

      return nextHistory.slice(-24);
    });
    if (embeddedContextId) {
      onOpenConcept?.(nextContextId);
      return;
    }

    router.push(getConceptExplorationPath(nextContextId, { returnTo }));
  }

  function goBack() {
    if (embeddedContextId) {
      onBack?.();
      return;
    }

    const previousContextId = conceptHistory.at(-1);

    if (!previousContextId) {
      router.push(returnTo ?? "/");
      return;
    }

    setConceptHistory((current) => current.slice(0, -1));
    router.push(getConceptExplorationPath(previousContextId, { returnTo }));
  }

  return (
    <section
      className={
        workspaceMode
          ? "vinema-scrollbar flex h-full min-h-0 w-full flex-col gap-6 overflow-y-auto px-4 py-4"
          : "mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-4 py-6 opacity-100 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none sm:px-6 lg:px-8"
      }
      data-knowledge-base-surface=""
      data-concept-profile-workspace={workspaceMode ? "" : undefined}
      data-expansion-source={expansionSource ?? undefined}
    >
      <ConceptIdentityHeader
        center={center}
        relatedConceptCount={neighborhood?.relatedConcepts.length ?? 0}
        memoryCount={memories.length}
        onBack={goBack}
        workspaceMode={workspaceMode}
      />

      <ConceptLivingProfile
        activeTab={activeTab}
        onActiveTabChange={setActiveTab}
        profile={profile}
        memories={memories}
        identities={identities}
        behavioralPatterns={behavioralPatterns}
        evolutionSignals={evolutionSignals}
        conceptsById={new Map(contexts.map((context) => [context.id, context]))}
        nodesById={new Map(workspaceNodes.map((node) => [node.id, node]))}
        returnTo={getConceptExplorationPath(center.id, { returnTo })}
        onNavigateToConcept={navigateToConcept}
        onOpenMemory={onOpenMemory}
        onOpenMemoryIndex={onOpenMemoryIndex}
        workspaceMode={workspaceMode}
      />
    </section>
  );
}

function ConceptIdentityHeader({
  center,
  relatedConceptCount,
  memoryCount,
  onBack,
  workspaceMode = false,
}: {
  center: Context;
  relatedConceptCount: number;
  memoryCount: number;
  onBack: () => void;
  workspaceMode?: boolean;
}) {
  return (
    <header
      className={workspaceMode ? "space-y-4" : "space-y-6"}
      aria-label="Identidad del concepto"
    >
      <div className="flex items-center gap-2">
        {workspaceMode ? null : (
          <Button variant="ghost" size="sm" onClick={onBack}>
            ← Volver
          </Button>
        )}
      </div>

      <div className={workspaceMode ? "space-y-3" : "space-y-4"}>
        <div>
          <h1
            className={
              workspaceMode
                ? "text-2xl font-semibold leading-tight tracking-normal text-zinc-950 sm:text-3xl"
                : "text-2xl font-semibold leading-tight tracking-normal text-zinc-950 sm:text-3xl"
            }
          >
            {center.name}
          </h1>
          <p
            className={
              workspaceMode
                ? "mt-1 text-xs leading-5 text-zinc-500"
                : "mt-3 max-w-2xl text-sm leading-6 text-zinc-500"
            }
            aria-live="polite"
          >
            {memoryCount} {memoryCount === 1 ? "recuerdo" : "recuerdos"}
            {relatedConceptCount > 0
              ? ` · ${relatedConceptCount} ${
                  relatedConceptCount === 1 ? "conexión" : "conexiones"
                }`
              : ""}
          </p>
          {center.description ? (
            <p
              className={
                workspaceMode
                  ? "mt-2 text-sm leading-6 text-zinc-600"
                  : "mt-3 max-w-2xl text-sm leading-6 text-zinc-600"
              }
            >
              {center.description}
            </p>
          ) : null}
        </div>

        {center.aliases && center.aliases.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-500">También aparece como</span>
            {center.aliases.map((alias) => (
              <span
                key={alias}
                className="rounded-full border border-zinc-200 px-2 py-1 text-xs text-zinc-600"
              >
                {alias}
              </span>
            ))}
          </div>
        ) : null}

      </div>
    </header>
  );
}

function ConceptLivingProfile({
  activeTab,
  onActiveTabChange,
  profile,
  memories,
  identities,
  behavioralPatterns,
  evolutionSignals,
  conceptsById,
  nodesById,
  returnTo,
  onNavigateToConcept,
  onOpenMemory,
  onOpenMemoryIndex,
  workspaceMode = false,
}: {
  activeTab: ConceptDetailTab;
  onActiveTabChange: (tab: ConceptDetailTab) => void;
  profile: ConceptProfile | null;
  memories: Node[];
  identities: Map<string, CaptureEmergentIdentity>;
  behavioralPatterns: BehavioralPattern[];
  evolutionSignals: MemoryEvolutionSignal[];
  conceptsById: Map<string, Context>;
  nodesById: Map<string, Node>;
  returnTo: string;
  onNavigateToConcept: (contextId: string) => void;
  onOpenMemory?: (nodeId: string) => void;
  onOpenMemoryIndex?: () => void;
  workspaceMode?: boolean;
}) {
  const relatedConcepts = profile?.relatedConcepts ?? [];
  const visiblePatterns = profile
    ? getUsefulPatterns({
        patterns: behavioralPatterns,
        currentConceptId: profile.concept.id,
        connectionIds: new Set(
          relatedConcepts.map((connection) => connection.conceptId),
        ),
      })
    : [];

  return (
    <div
      className={workspaceMode ? "space-y-5" : "space-y-8"}
      aria-label="Detalle del concepto"
    >
      <ConceptDetailTabs activeTab={activeTab} onChange={onActiveTabChange} />

      <div
        id={`concept-tabpanel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`concept-tab-${activeTab}`}
        tabIndex={0}
        className="outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
      >
        {activeTab === "memories" ? (
          <ConceptMemoriesTab
            conceptId={profile?.concept.id ?? ""}
            memories={memories}
            identities={identities}
            returnTo={returnTo}
            onOpenMemory={onOpenMemory}
            onOpenMemoryIndex={onOpenMemoryIndex}
            onNavigateToConcept={onNavigateToConcept}
            workspaceMode={workspaceMode}
          />
        ) : null}

        {activeTab === "relations" ? (
          <ConceptRelationsTab
            connections={relatedConcepts}
            returnTo={returnTo}
            onNavigateToConcept={onNavigateToConcept}
            onOpenMemory={onOpenMemory}
            workspaceMode={workspaceMode}
          />
        ) : null}

        {activeTab === "evolution" ? (
          <ConceptEvolutionTab
            profile={profile}
            signals={evolutionSignals}
            nodesById={nodesById}
            returnTo={returnTo}
            onOpenMemory={onOpenMemory}
          />
        ) : null}

        {activeTab === "patterns" ? (
          <ConceptPatternsTab
            patterns={visiblePatterns}
            currentConceptId={profile?.concept.id ?? ""}
            conceptsById={conceptsById}
            nodesById={nodesById}
            returnTo={returnTo}
            onOpenMemory={onOpenMemory}
          />
        ) : null}
      </div>
    </div>
  );
}

const CONCEPT_DETAIL_TABS: Array<{
  id: ConceptDetailTab;
  label: string;
}> = [
  { id: "memories", label: "Recuerdos" },
  { id: "relations", label: "Relaciones" },
  { id: "evolution", label: "Evolución" },
  { id: "patterns", label: "Patrones" },
];

function ConceptDetailTabs({
  activeTab,
  onChange,
}: {
  activeTab: ConceptDetailTab;
  onChange: (tab: ConceptDetailTab) => void;
}) {
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const currentIndex = CONCEPT_DETAIL_TABS.findIndex((tab) => tab.id === activeTab);
    const lastIndex = CONCEPT_DETAIL_TABS.length - 1;
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight") {
      nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1;
    }

    if (event.key === "ArrowLeft") {
      nextIndex = currentIndex <= 0 ? lastIndex : currentIndex - 1;
    }

    if (event.key === "Home") {
      nextIndex = 0;
    }

    if (event.key === "End") {
      nextIndex = lastIndex;
    }

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    const nextTab = CONCEPT_DETAIL_TABS[nextIndex];
    onChange(nextTab.id);
    document.getElementById(`concept-tab-${nextTab.id}`)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Secciones del concepto"
      className="grid grid-cols-2 border-b border-zinc-200 sm:grid-cols-4"
      onKeyDown={handleKeyDown}
    >
      {CONCEPT_DETAIL_TABS.map((tab) => {
        const selected = tab.id === activeTab;

        return (
          <button
            key={tab.id}
            id={`concept-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`concept-tabpanel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            className={
              selected
                ? "border-b-2 border-zinc-950 px-3 py-3 text-sm font-medium text-zinc-950 outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                : "border-b-2 border-transparent px-3 py-3 text-sm font-medium text-zinc-500 outline-none hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-400"
            }
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function ConceptMemoriesTab({
  conceptId,
  memories,
  identities,
  returnTo,
  onOpenMemory,
  onOpenMemoryIndex,
  onNavigateToConcept,
  workspaceMode = false,
}: {
  conceptId: string;
  memories: Node[];
  identities: Map<string, CaptureEmergentIdentity>;
  returnTo: string;
  onOpenMemory?: (nodeId: string) => void;
  onOpenMemoryIndex?: () => void;
  onNavigateToConcept?: (contextId: string) => void;
  workspaceMode?: boolean;
}) {
  return (
    <section className={workspaceMode ? "space-y-3" : "space-y-4"} aria-label="Recuerdos">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-medium text-zinc-500">Recuerdos</h2>
          {workspaceMode ? null : (
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              Evidencia concreta asociada a este concepto, desde la más reciente.
            </p>
          )}
        </div>
        {conceptId ? (
          onOpenMemoryIndex ? (
            <button
              type="button"
              className="text-sm font-medium text-zinc-700 outline-none hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
              onClick={onOpenMemoryIndex}
            >
              Memoria
            </button>
          ) : (
            <Link
              href={`/memory?concept=${encodeURIComponent(conceptId)}`}
              className="text-sm font-medium text-zinc-700 outline-none hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
            >
              Memoria
            </Link>
          )
        ) : null}
      </div>
      <MemoryList
        memories={memories}
        identities={identities}
        returnTo={returnTo}
        onOpenMemory={onOpenMemory}
        onNavigateToConcept={onNavigateToConcept}
      />
    </section>
  );
}

function ConceptRelationsTab({
  connections,
  returnTo,
  onNavigateToConcept,
  onOpenMemory,
  workspaceMode = false,
}: {
  connections: ConceptProfile["relatedConcepts"];
  returnTo: string;
  onNavigateToConcept: (contextId: string) => void;
  onOpenMemory?: (nodeId: string) => void;
  workspaceMode?: boolean;
}) {
  if (connections.length === 0) {
    return (
      <EmptyConceptTab message="Todavía no hay relaciones respaldadas por recuerdos compartidos." />
    );
  }

  return (
    <MainConnections
      connections={connections}
      returnTo={returnTo}
      onNavigateToConcept={onNavigateToConcept}
      onOpenMemory={onOpenMemory}
      workspaceMode={workspaceMode}
    />
  );
}

function ConceptEvolutionTab({
  profile,
  signals,
  nodesById,
  returnTo,
  onOpenMemory,
}: {
  profile: ConceptProfile | null;
  signals: MemoryEvolutionSignal[];
  nodesById: Map<string, Node>;
  returnTo: string;
  onOpenMemory?: (nodeId: string) => void;
}) {
  const meaningfulSignals = signals
    .filter((signal) => signal.strength === "MEDIUM" || signal.strength === "STRONG")
    .sort((first, second) => first.observedAt.getTime() - second.observedAt.getTime());

  if (!profile || profile.memoryCount <= 1 || meaningfulSignals.length === 0) {
    return (
      <EmptyConceptTab message="Aún no hay suficiente información temporal para mostrar una evolución honesta." />
    );
  }

  return (
    <ObservedEvolution
      signals={meaningfulSignals}
      nodesById={nodesById}
      returnTo={returnTo}
      onOpenMemory={onOpenMemory}
    />
  );
}

function ConceptPatternsTab({
  patterns,
  currentConceptId,
  conceptsById,
  nodesById,
  returnTo,
  onOpenMemory,
}: {
  patterns: BehavioralPattern[];
  currentConceptId: string;
  conceptsById: Map<string, Context>;
  nodesById: Map<string, Node>;
  returnTo: string;
  onOpenMemory?: (nodeId: string) => void;
}) {
  if (patterns.length === 0) {
    return (
      <EmptyConceptTab message="Todavía no hay patrones observados con evidencia suficiente." />
    );
  }

  return (
    <ObservedPatterns
      patterns={patterns}
      currentConceptId={currentConceptId}
      conceptsById={conceptsById}
      nodesById={nodesById}
      returnTo={returnTo}
      onOpenMemory={onOpenMemory}
    />
  );
}

function EmptyConceptTab({ message }: { message: string }) {
  return (
    <div className="py-12">
      <p className="max-w-2xl text-sm leading-6 text-zinc-500">{message}</p>
    </div>
  );
}

function getUsefulPatterns({
  patterns,
  currentConceptId,
  connectionIds,
}: {
  patterns: BehavioralPattern[];
  currentConceptId: string;
  connectionIds: Set<string>;
}) {
  return patterns.filter(
    (pattern) =>
      pattern.kind !== "RECURRENT_PAIR" ||
      !pattern.conceptIds
        .filter((conceptId) => conceptId !== currentConceptId)
        .every((conceptId) => connectionIds.has(conceptId)),
  );
}

function MainConnections({
  connections,
  returnTo,
  onNavigateToConcept,
  onOpenMemory,
  workspaceMode = false,
}: {
  connections: ConceptProfile["relatedConcepts"];
  returnTo: string;
  onNavigateToConcept: (contextId: string) => void;
  onOpenMemory?: (nodeId: string) => void;
  workspaceMode?: boolean;
}) {
  const [expandedConnectionId, setExpandedConnectionId] = useState<string | null>(null);

  return (
    <section className={workspaceMode ? "space-y-2" : "space-y-4"} aria-label="Relaciones">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-medium text-zinc-500">Relaciones</h2>
          {workspaceMode ? null : (
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              Conceptos que comparten evidencia con este concepto.
            </p>
          )}
        </div>
      </div>
      <div className="divide-y divide-zinc-100">
        {connections.map((connection) => {
          const isExpanded = expandedConnectionId === connection.conceptId;
          const signal = formatExceptionalConnectionSignal(connection);

          return (
            <article key={connection.conceptId} className={workspaceMode ? "py-2.5" : "py-4"}>
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                  onClick={() => onNavigateToConcept(connection.conceptId)}
                >
                  <span
                    className={
                      workspaceMode
                        ? "block truncate text-sm font-medium text-zinc-900"
                        : "block truncate text-base font-medium text-zinc-900"
                    }
                  >
                    {connection.label}
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-zinc-500">
                    {connection.sharedMemoryCount}{" "}
                    {connection.sharedMemoryCount === 1
                      ? "recuerdo compartido"
                      : "recuerdos compartidos"}
                  </span>
                </button>
                {connection.evidence.length > 0 ? (
                  <button
                    type="button"
                    className="shrink-0 text-xs font-medium text-zinc-600 outline-none hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
                    aria-expanded={isExpanded}
                    onClick={() =>
                      setExpandedConnectionId(isExpanded ? null : connection.conceptId)
                    }
                  >
                    {isExpanded ? "Ocultar" : "Ver evidencia"}
                  </button>
                ) : null}
              </div>
              {isExpanded ? (
                <div className="mt-3 space-y-2 border-l-2 border-zinc-100 pl-3">
                  {signal || connection.lastSharedAt ? (
                    <p className="text-xs leading-5 text-zinc-500">
                      {signal ? `${signal}` : null}
                      {signal && connection.lastSharedAt ? " · " : null}
                      {connection.lastSharedAt
                        ? `Última actividad: ${formatShortDate(
                            connection.lastSharedAt.toISOString(),
                          )}`
                        : null}
                    </p>
                  ) : null}
                  {connection.evidence.slice(0, workspaceMode ? 1 : 2).map((evidence) =>
                    onOpenMemory ? (
                      <button
                        key={evidence.nodeId}
                        type="button"
                        className="block w-full text-left text-sm leading-6 text-zinc-500 outline-none hover:text-zinc-800 focus-visible:ring-2 focus-visible:ring-zinc-400"
                        onClick={() => onOpenMemory(evidence.nodeId)}
                      >
                        {evidence.excerpt}
                      </button>
                    ) : (
                      <Link
                        key={evidence.nodeId}
                        href={getNodeDetailPath(evidence.nodeId, { returnTo })}
                        className="block text-sm leading-6 text-zinc-500 outline-none hover:text-zinc-800 focus-visible:ring-2 focus-visible:ring-zinc-400"
                      >
                        {evidence.excerpt}
                      </Link>
                    ),
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function formatExceptionalConnectionSignal(
  connection: ConceptProfile["relatedConcepts"][number],
) {
  if (connection.recentSharedMemoryCount > 1) {
    return "Relación activa recientemente";
  }

  if (connection.strength === "STRONG" && connection.sharedMemoryCount >= 4) {
    return "Relación fuerte por evidencia";
  }

  return null;
}

function ObservedEvolution({
  signals,
  nodesById,
  returnTo,
  onOpenMemory,
}: {
  signals: MemoryEvolutionSignal[];
  nodesById: Map<string, Node>;
  returnTo: string;
  onOpenMemory?: (nodeId: string) => void;
}) {
  return (
    <section className="space-y-4" aria-label="Evolución">
      <div>
        <h2 className="text-sm font-medium text-zinc-500">Evolución</h2>
        <p className="mt-1 text-sm leading-6 text-zinc-600">
          Cambios temporales derivados de recuerdos existentes.
        </p>
      </div>
      <div className="space-y-4 border-l border-zinc-200 pl-4">
        {signals.map((signal) => (
          <div
            key={signal.id}
            className="relative space-y-2 text-sm leading-6 text-zinc-600 before:absolute before:-left-[1.3125rem] before:top-1.5 before:h-2 before:w-2 before:rounded-full before:bg-zinc-300"
          >
            <div>
              <time className="text-xs text-zinc-500">
                {formatShortDate(signal.observedAt.toISOString())}
              </time>
              <p className="font-medium text-zinc-900">
                {formatEvolutionSignal(signal)}
              </p>
              <p className="text-sm leading-6 text-zinc-600">
                {formatEvolutionSignalDetail(signal)}
              </p>
              <p className="text-xs leading-5 text-zinc-500">
                Observación del sistema basada en evidencia local.
              </p>
            </div>
            <div className="space-y-2">
              {signal.evidenceNodeIds.slice(0, 3).map((nodeId) => {
                const node = nodesById.get(nodeId);

                if (!node) {
                  return null;
                }

                return (
                  onOpenMemory ? (
                    <button
                      key={`${signal.id}-${nodeId}`}
                      type="button"
                      className="block w-full border-l-2 border-zinc-200 pl-3 text-left outline-none hover:text-zinc-800 focus-visible:ring-2 focus-visible:ring-zinc-400"
                      onClick={() => onOpenMemory(nodeId)}
                    >
                      <span className="block">{getCapturePreview(node.content, { maxLength: 120 })}</span>
                      <time className="block text-[11px] text-zinc-400">
                        {formatShortDate(getContentTimestamp(node))}
                      </time>
                    </button>
                  ) : (
                    <Link
                      key={`${signal.id}-${nodeId}`}
                      href={getNodeDetailPath(nodeId, { returnTo })}
                      className="block border-l-2 border-zinc-200 pl-3 outline-none hover:text-zinc-800 focus-visible:ring-2 focus-visible:ring-zinc-400"
                    >
                      <span className="block">{getCapturePreview(node.content, { maxLength: 120 })}</span>
                      <time className="block text-[11px] text-zinc-400">
                        {formatShortDate(getContentTimestamp(node))}
                      </time>
                    </Link>
                  )
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatEvolutionSignal(signal: MemoryEvolutionSignal) {
  switch (signal.kind) {
    case "NEW_CONCEPT":
      return "Concepto reciente";
    case "GROWING_CONCEPT":
      return "Ha ganado actividad";
    case "STABLE_CONCEPT":
      return "Se mantiene estable";
    case "DECLINING_CONCEPT":
      return "Su actividad ha disminuido";
    case "DORMANT_CONCEPT":
      return "Lleva tiempo sin aparecer";
    case "REVIVED_CONCEPT":
      return "Ha vuelto a aparecer";
    case "SHIFTING_CONTEXT":
      return "Sus conexiones recientes han cambiado";
  }
}

function formatEvolutionSignalDetail(signal: MemoryEvolutionSignal) {
  switch (signal.kind) {
    case "NEW_CONCEPT":
      return "Apareció recientemente en capturas aceptadas.";
    case "GROWING_CONCEPT":
      return "Tiene más presencia reciente que en el periodo anterior.";
    case "STABLE_CONCEPT":
      return "Mantiene una presencia sostenida en el tiempo.";
    case "DECLINING_CONCEPT":
      return "Su presencia reciente es menor que antes.";
    case "DORMANT_CONCEPT":
      return "No aparece en capturas recientes.";
    case "REVIVED_CONCEPT":
      return "Volvió a aparecer después de un periodo sin actividad.";
    case "SHIFTING_CONTEXT":
      return "Sus conexiones recientes cambiaron respecto de su historia.";
  }
}

function ObservedPatterns({
  patterns,
  currentConceptId,
  conceptsById,
  nodesById,
  returnTo,
  onOpenMemory,
}: {
  patterns: BehavioralPattern[];
  currentConceptId: string;
  conceptsById: Map<string, Context>;
  nodesById: Map<string, Node>;
  returnTo: string;
  onOpenMemory?: (nodeId: string) => void;
}) {
  return (
    <section className="space-y-4" aria-label="Patrones">
      <div>
        <h2 className="text-sm font-medium text-zinc-500">Patrones</h2>
        <p className="mt-1 text-sm leading-6 text-zinc-600">
          Observaciones derivadas desde recurrencias de la memoria local.
        </p>
      </div>
      <div className="divide-y divide-zinc-100">
        {patterns.map((pattern) => (
          <div
            key={pattern.id}
            className="space-y-2 py-4 text-sm leading-6 text-zinc-600"
          >
            <p className="text-xs font-medium uppercase text-zinc-400">
              Observación del sistema
            </p>
            <p className="text-zinc-800">
              {formatBehavioralPattern(pattern, currentConceptId, conceptsById)}
            </p>
            {pattern.evidenceNodeIds.length > 0 ? (
              <div className="space-y-1 border-l-2 border-zinc-100 pl-3">
                {pattern.evidenceNodeIds.slice(0, 3).map((nodeId) => {
                  const node = nodesById.get(nodeId);

                  if (!node) {
                    return null;
                  }

                  return onOpenMemory ? (
                    <button
                      key={`${pattern.id}-${nodeId}`}
                      type="button"
                      className="block w-full text-left text-xs leading-5 text-zinc-500 outline-none hover:text-zinc-800 focus-visible:ring-2 focus-visible:ring-zinc-400"
                      onClick={() => onOpenMemory(nodeId)}
                    >
                      <span className="block">
                        {getCapturePreview(node.content, { maxLength: 120 })}
                      </span>
                      <time className="block text-[11px] text-zinc-400">
                        {formatShortDate(getContentTimestamp(node))}
                      </time>
                    </button>
                  ) : (
                    <Link
                      key={`${pattern.id}-${nodeId}`}
                      href={getNodeDetailPath(nodeId, { returnTo })}
                      className="block text-xs leading-5 text-zinc-500 outline-none hover:text-zinc-800 focus-visible:ring-2 focus-visible:ring-zinc-400"
                    >
                      <span className="block">
                        {getCapturePreview(node.content, { maxLength: 120 })}
                      </span>
                      <time className="block text-[11px] text-zinc-400">
                        {formatShortDate(getContentTimestamp(node))}
                      </time>
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function formatBehavioralPattern(
  pattern: BehavioralPattern,
  currentConceptId: string,
  conceptsById: Map<string, Context>,
) {
  const relatedLabels = pattern.conceptIds
    .filter((conceptId) => conceptId !== currentConceptId)
    .map((conceptId) => conceptsById.get(conceptId)?.name ?? conceptId)
    .join(" + ");
  const labels =
    relatedLabels ||
    pattern.conceptIds
      .map((conceptId) => conceptsById.get(conceptId)?.name ?? conceptId)
      .join(" + ");

  switch (pattern.kind) {
    case "RECURRENT_PAIR":
      return `Aparece frecuentemente junto a ${labels}.`;
    case "EMERGING_RELATIONSHIP":
      return "La relación ha aumentado recientemente.";
    case "DECLINING_RELATIONSHIP":
      return "La actividad compartida ha disminuido.";
    case "STABLE_RELATIONSHIP":
      return "La relación se mantiene estable.";
    case "RECURRING_CLUSTER":
      return `Grupo recurrente observado: ${labels}.`;
  }
}

function MemoryList({
  memories,
  identities,
  returnTo,
  onOpenMemory,
  onNavigateToConcept,
}: {
  memories: Node[];
  identities: Map<string, CaptureEmergentIdentity>;
  returnTo: string;
  onOpenMemory?: (nodeId: string) => void;
  onNavigateToConcept?: (contextId: string) => void;
}) {
  if (memories.length === 0) {
    return (
      <div className="py-14">
        <p className="text-sm leading-6 text-zinc-500">
          Este concepto todavia tiene pocas asociaciones. Cuando aparezca en
          capturas aceptadas, sus recuerdos viviran aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {memories.map((node) => (
        <MemoryItem
          key={node.id}
          node={node}
          identity={identities.get(node.id) ?? null}
          returnTo={returnTo}
          onOpenMemory={onOpenMemory}
          onNavigateToConcept={onNavigateToConcept}
        />
      ))}
    </div>
  );
}

function MemoryItem({
  node,
  identity,
  returnTo,
  onOpenMemory,
  onNavigateToConcept,
}: {
  node: Node;
  identity: CaptureEmergentIdentity | null;
  returnTo: string;
  onOpenMemory?: (nodeId: string) => void;
  onNavigateToConcept?: (contextId: string) => void;
}) {
  const preview = getCapturePreview(node.content, { maxLength: 220 });

  return (
    <article className="space-y-1">
      {identity?.displayText ? (
        <CaptureEmergentIdentityLabel
          identity={identity}
          getConceptHref={
            onNavigateToConcept
              ? undefined
              : (contextId) => getConceptExplorationPath(contextId, { returnTo })
          }
          onConceptClick={onNavigateToConcept}
        />
      ) : null}
      {onOpenMemory ? (
        <button
          type="button"
          className="block w-full rounded-sm text-left text-base leading-7 text-zinc-800 outline-none hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
          onClick={() => onOpenMemory(node.id)}
        >
          {preview}
        </button>
      ) : (
        <Link
          href={getNodeDetailPath(node.id, { returnTo })}
          className="block rounded-sm text-base leading-7 text-zinc-800 outline-none hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
        >
          {preview}
        </Link>
      )}
      <time className="block text-xs text-zinc-500">
        {formatShortDate(getContentTimestamp(node))}
      </time>
    </article>
  );
}

function ConceptExplorationMessage({
  heading,
  message,
  workspaceMode = false,
}: {
  heading: string;
  message: string;
  workspaceMode?: boolean;
}) {
  return (
    <section
      className={
        workspaceMode
          ? "flex h-full min-h-0 w-full flex-col justify-center gap-4 px-4 py-6"
          : "mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8"
      }
    >
      <h1 className="text-2xl font-medium text-zinc-950">{heading}</h1>
      <p className="text-sm text-zinc-600">{message}</p>
      {workspaceMode ? null : (
        <Button asChild className="w-fit">
          <Link href="/">Volver a Inicio</Link>
        </Button>
      )}
    </section>
  );
}
