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
import {
  getSemanticRelationHumanLabel,
  type SemanticStatement,
} from "@/features/cognition/semantic-understanding";
import { deriveConceptNeighborhood } from "@/features/exploration/concept-neighborhood";
import type { ConceptProfile } from "@/features/exploration/concept-profile";
import type { RelationshipStrength } from "@/features/exploration/concept-relationships";
import {
  getConceptExpansionSourceFromSearchParams,
  getConceptExplorationPath,
  getConceptKnowledgeExplorerPath,
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

const CONCEPT_EXPLORATION_INVALIDATION_TYPES = [
  "capture",
  "concept",
  "captureConcept",
] as const;

export function ConceptExplorationClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const contextId = getConceptIdFromSearchParams(searchParams);
  const expansionSource = getConceptExpansionSourceFromSearchParams(searchParams);
  const returnTo = getReturnToFromSearchParams(searchParams);
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
  const semanticStatements = useMemo(() => {
    if (!contextId || !memoryResponse) {
      return [];
    }

    return memoryResponse.semanticStatements.filter(
      (statement) =>
        statement.confidence !== "LOW" &&
        (statement.sourceConceptId === contextId ||
          statement.targetConceptId === contextId),
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
          includeArchived: true,
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
      />
    );
  }

  if (loadState === "loading" || vinemaContext.status === "loading") {
    return (
      <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <p className="text-sm text-zinc-500">Cargando conocimiento...</p>
      </section>
    );
  }

  if (vinemaContext.status === "error") {
    return (
      <ConceptExplorationMessage
        heading="No se pudo cargar Vinema"
        message={vinemaContext.error}
      />
    );
  }

  if (!center || loadState === "error") {
    return (
      <ConceptExplorationMessage
        heading="Concepto no encontrado"
        message={error ?? "No existe o no pertenece a este workspace."}
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
    router.push(getConceptExplorationPath(nextContextId, { returnTo }));
  }

  function goBack() {
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
      className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-4 py-6 opacity-100 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none sm:px-6 lg:px-8"
      data-knowledge-base-surface=""
      data-expansion-source={expansionSource ?? undefined}
    >
      <ConceptIdentityHeader
        center={center}
        profile={profile}
        relatedConceptCount={neighborhood?.relatedConcepts.length ?? 0}
        memoryCount={memories.length}
        onBack={goBack}
      />

      <ConceptLivingProfile
        profile={profile}
        memories={memories}
        identities={identities}
        behavioralPatterns={behavioralPatterns}
        evolutionSignals={evolutionSignals}
        semanticStatements={semanticStatements}
        conceptsById={new Map(contexts.map((context) => [context.id, context]))}
        nodesById={new Map(workspaceNodes.map((node) => [node.id, node]))}
        returnTo={getConceptExplorationPath(center.id, { returnTo })}
        onNavigateToConcept={navigateToConcept}
      />
    </section>
  );
}

function ConceptIdentityHeader({
  center,
  profile,
  relatedConceptCount,
  memoryCount,
  onBack,
}: {
  center: Context;
  profile: ConceptProfile | null;
  relatedConceptCount: number;
  memoryCount: number;
  onBack: () => void;
}) {
  return (
    <header className="space-y-6" aria-label="Identidad del concepto">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← Volver
        </Button>
        <span
          className={
            center.archivedAt
              ? "rounded-full border border-zinc-200 px-2 py-1 text-xs text-zinc-500"
              : "rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700"
          }
        >
          {center.archivedAt ? "Archivado" : "Activo"}
        </span>
      </div>

      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-medium tracking-normal text-zinc-950 sm:text-4xl">
            {center.name}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500" aria-live="polite">
            Perfil vivo · {memoryCount} {memoryCount === 1 ? "recuerdo" : "recuerdos"}
            {relatedConceptCount > 0
              ? ` · ${relatedConceptCount} ${
                  relatedConceptCount === 1 ? "conexión" : "conexiones"
                }`
              : ""}
          </p>
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

        {profile ? (
          <div className="grid gap-4 border-y border-zinc-100 py-4 sm:grid-cols-3">
            <ProfileMetric
              label="Primera aparición"
              value={formatProfileDate(profile.firstSeenAt)}
            />
            <ProfileMetric
              label="Última actividad"
              value={formatProfileDate(profile.lastSeenAt)}
            />
            <ProfileMetric
              label="Memoria"
              value={`${profile.memoryCount} ${
                profile.memoryCount === 1 ? "recuerdo" : "recuerdos"
              }`}
            />
          </div>
        ) : null}
      </div>
    </header>
  );
}

function ConceptLivingProfile({
  profile,
  memories,
  identities,
  behavioralPatterns,
  evolutionSignals,
  semanticStatements,
  conceptsById,
  nodesById,
  returnTo,
  onNavigateToConcept,
}: {
  profile: ConceptProfile | null;
  memories: Node[];
  identities: Map<string, CaptureEmergentIdentity>;
  behavioralPatterns: BehavioralPattern[];
  evolutionSignals: MemoryEvolutionSignal[];
  semanticStatements: SemanticStatement[];
  conceptsById: Map<string, Context>;
  nodesById: Map<string, Node>;
  returnTo: string;
  onNavigateToConcept: (contextId: string) => void;
}) {
  if (!profile) {
    return (
      <MemoryList
        memories={memories}
        identities={identities}
        returnTo={returnTo}
      />
    );
  }

  const activitySignal = getPrimaryActivitySignal({ profile, evolutionSignals });
  const evolutionOnlySignals = evolutionSignals
    .filter((signal) => signal.id !== activitySignal?.signalId)
    .slice(0, 3);
  const mainConnections = profile.relatedConcepts.slice(0, 6);
  const recentMemories = memories.slice(0, 5);

  return (
    <div className="space-y-10" aria-label="Perfil vivo del concepto">
      {activitySignal ? <ConceptActivitySection signal={activitySignal} /> : null}

      {mainConnections.length > 0 ? (
        <MainConnections
          conceptId={profile.concept.id}
          connections={mainConnections}
          returnTo={returnTo}
          onNavigateToConcept={onNavigateToConcept}
        />
      ) : null}

      {evolutionOnlySignals.length > 0 && profile.memoryCount > 1 ? (
        <ObservedEvolution
          signals={evolutionOnlySignals}
          nodesById={nodesById}
          returnTo={returnTo}
        />
      ) : null}

      {semanticStatements.length > 0 ? (
        <ObservedMeanings
          statements={semanticStatements.slice(0, 5)}
          returnTo={returnTo}
          onNavigateToConcept={onNavigateToConcept}
        />
      ) : null}

      {behavioralPatterns.length > 0 ? (
        <ObservedPatterns
          patterns={behavioralPatterns.slice(0, 5)}
          currentConceptId={profile.concept.id}
          conceptsById={conceptsById}
          connectionIds={new Set(mainConnections.map((connection) => connection.conceptId))}
        />
      ) : null}

      {profile.representativeMemories.length > 0 ? (
        <RepresentativeMemories
          memories={profile.representativeMemories.slice(0, 4)}
          returnTo={returnTo}
        />
      ) : null}

      {recentMemories.length > 0 ? (
        <RecentMemories
          conceptId={profile.concept.id}
          memories={recentMemories}
          identities={identities}
          returnTo={returnTo}
        />
      ) : null}
    </div>
  );
}

interface ActivitySignal {
  label: string;
  detail: string;
  signalId: string | null;
}

function getPrimaryActivitySignal({
  profile,
  evolutionSignals,
}: {
  profile: ConceptProfile;
  evolutionSignals: MemoryEvolutionSignal[];
}): ActivitySignal | null {
  const signal = evolutionSignals[0] ?? null;

  if (signal) {
    return {
      label: formatEvolutionSignal(signal),
      detail: formatActivitySignalDetail(signal),
      signalId: signal.id,
    };
  }

  if (profile.activity.last7Days > 0) {
    return {
      label: "Concepto reciente",
      detail: `${profile.activity.last7Days} ${
        profile.activity.last7Days === 1 ? "recuerdo" : "recuerdos"
      } en los últimos 7 días.`,
      signalId: null,
    };
  }

  if (profile.activity.last30Days > 0) {
    return {
      label: "Actividad reciente",
      detail: `${profile.activity.last30Days} ${
        profile.activity.last30Days === 1 ? "recuerdo" : "recuerdos"
      } en los últimos 30 días.`,
      signalId: null,
    };
  }

  if (profile.memoryCount > 0) {
    return {
      label: "Actividad estable",
      detail: "Este concepto permanece disponible en tu memoria local.",
      signalId: null,
    };
  }

  return null;
}

function formatActivitySignalDetail(signal: MemoryEvolutionSignal) {
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

function ConceptActivitySection({ signal }: { signal: ActivitySignal }) {
  return (
    <section className="space-y-2" aria-label="Actividad">
      <h2 className="text-sm font-medium text-zinc-500">Actividad</h2>
      <p className="text-lg font-medium text-zinc-900">{signal.label}</p>
      <p className="max-w-2xl text-sm leading-6 text-zinc-600">{signal.detail}</p>
    </section>
  );
}

function MainConnections({
  conceptId,
  connections,
  returnTo,
  onNavigateToConcept,
}: {
  conceptId: string;
  connections: ConceptProfile["relatedConcepts"];
  returnTo: string;
  onNavigateToConcept: (contextId: string) => void;
}) {
  return (
    <section className="space-y-4" aria-label="Conexiones principales">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-medium text-zinc-500">
            Conexiones principales
          </h2>
          <p className="mt-1 text-sm leading-6 text-zinc-600">
            Conceptos que aparecen junto a este en recuerdos aceptados.
          </p>
        </div>
        <Link
          href={getConceptKnowledgeExplorerPath({ focus: conceptId })}
          className="text-sm font-medium text-zinc-700 outline-none hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
        >
          Explorar conexiones
        </Link>
      </div>
      <div className="divide-y divide-zinc-100">
        {connections.map((connection) => (
          <article key={connection.conceptId} className="py-4">
            <button
              type="button"
              className="w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
              onClick={() => onNavigateToConcept(connection.conceptId)}
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-base font-medium text-zinc-900">
                  {connection.label}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${getStrengthClass(connection.strength)}`}>
                  {formatConnectionSignal(connection)}
                </span>
              </span>
              <span className="mt-1 block text-sm leading-6 text-zinc-500">
                {connection.sharedMemoryCount}{" "}
                {connection.sharedMemoryCount === 1
                  ? "recuerdo compartido"
                  : "recuerdos compartidos"}
                {connection.lastSharedAt
                  ? ` · ${formatShortDate(connection.lastSharedAt.toISOString())}`
                  : ""}
              </span>
            </button>
            {connection.evidence[0] ? (
              <Link
                href={getNodeDetailPath(connection.evidence[0].nodeId, { returnTo })}
                className="mt-2 block border-l-2 border-zinc-200 pl-3 text-sm leading-6 text-zinc-500 outline-none hover:text-zinc-800 focus-visible:ring-2 focus-visible:ring-zinc-400"
              >
                {connection.evidence[0].excerpt}
              </Link>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function formatConnectionSignal(connection: ConceptProfile["relatedConcepts"][number]) {
  if (connection.recentSharedMemoryCount > 0) {
    return "Reciente";
  }

  if (connection.monthlySpread > 1) {
    return "Estable";
  }

  return connection.strength === "STRONG"
    ? "Frecuente"
    : connection.strength === "MEDIUM"
      ? "Recurrente"
      : "Ocasional";
}

function ObservedEvolution({
  signals,
  nodesById,
  returnTo,
}: {
  signals: MemoryEvolutionSignal[];
  nodesById: Map<string, Node>;
  returnTo: string;
}) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-zinc-700">Evolución</h2>
      <div className="space-y-2">
        {signals.map((signal) => (
          <div
            key={signal.id}
            className="rounded-lg bg-white/70 px-3 py-2 text-xs leading-5 text-zinc-600"
          >
            <p className="font-medium text-zinc-800">
              {formatEvolutionSignal(signal)}
            </p>
            <div className="mt-1 space-y-1">
              {signal.evidenceNodeIds.slice(0, 3).map((nodeId) => {
                const node = nodesById.get(nodeId);

                if (!node) {
                  return null;
                }

                return (
                  <Link
                    key={`${signal.id}-${nodeId}`}
                    href={getNodeDetailPath(nodeId, { returnTo })}
                    className="block border-l-2 border-zinc-200 pl-2 outline-none hover:text-zinc-800 focus-visible:ring-2 focus-visible:ring-zinc-400"
                  >
                    <span className="block">{getCapturePreview(node.content, { maxLength: 120 })}</span>
                    <time className="block text-[11px] text-zinc-400">
                      {formatShortDate(getContentTimestamp(node))}
                    </time>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
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

function ObservedMeanings({
  statements,
  returnTo,
  onNavigateToConcept,
}: {
  statements: SemanticStatement[];
  returnTo: string;
  onNavigateToConcept: (contextId: string) => void;
}) {
  return (
    <section className="space-y-3" aria-label="Significados observados">
      <h2 className="text-sm font-medium text-zinc-500">Significados observados</h2>
      <div className="space-y-3">
        {statements.map((statement) => (
          <article key={statement.id} className="border-l-2 border-zinc-100 pl-3">
            {statement.hasContradictoryEvidence ? (
              <p className="mb-2 text-sm font-medium text-amber-700">
                Existe evidencia contradictoria
              </p>
            ) : null}
            <div className="grid gap-1 text-sm text-zinc-800">
              <button
                type="button"
                className="w-fit text-left font-medium outline-none hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
                onClick={() => onNavigateToConcept(statement.sourceConceptId)}
              >
                {statement.sourceLabel}
              </button>
              <span className="text-xs text-zinc-500">
                {getSemanticRelationHumanLabel(statement.relation)}
              </span>
              <button
                type="button"
                className="w-fit text-left font-medium outline-none hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
                onClick={() => onNavigateToConcept(statement.targetConceptId)}
              >
                {statement.targetLabel}
              </button>
            </div>
            <div className="mt-2 space-y-1">
              {statement.evidence.slice(0, 3).map((evidence) => (
                <Link
                  key={`${statement.id}-${evidence.nodeId}`}
                  href={getNodeDetailPath(evidence.nodeId, { returnTo })}
                  className="block rounded-md border-l-2 border-zinc-200 pl-2 text-xs leading-5 text-zinc-500 outline-none hover:text-zinc-800 focus-visible:ring-2 focus-visible:ring-zinc-400"
                >
                  <span className="block">{evidence.excerpt}</span>
                  <time className="block text-[11px] text-zinc-400">
                    {formatShortDate(evidence.createdAt.toISOString())}
                  </time>
                </Link>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ObservedPatterns({
  patterns,
  currentConceptId,
  conceptsById,
  connectionIds,
}: {
  patterns: BehavioralPattern[];
  currentConceptId: string;
  conceptsById: Map<string, Context>;
  connectionIds: Set<string>;
}) {
  const usefulPatterns = patterns.filter(
    (pattern) =>
      pattern.kind !== "RECURRENT_PAIR" ||
      !pattern.conceptIds
        .filter((conceptId) => conceptId !== currentConceptId)
        .every((conceptId) => connectionIds.has(conceptId)),
  );

  if (usefulPatterns.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3" aria-label="Patrones observados">
      <h2 className="text-sm font-medium text-zinc-500">Patrones observados</h2>
      <div className="space-y-2">
        {usefulPatterns.map((pattern) => (
          <div
            key={pattern.id}
            className="border-l-2 border-zinc-100 pl-3 text-sm leading-6 text-zinc-600"
          >
            {formatBehavioralPattern(pattern, currentConceptId, conceptsById)}
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

function ProfileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-base font-medium text-zinc-900">{value}</p>
    </div>
  );
}

function getStrengthClass(strength: RelationshipStrength) {
  if (strength === "STRONG") {
    return "bg-emerald-100 text-emerald-800";
  }

  if (strength === "MEDIUM") {
    return "bg-sky-100 text-sky-800";
  }

  return "bg-zinc-100 text-zinc-600";
}

function RepresentativeMemories({
  memories,
  returnTo,
}: {
  memories: ConceptProfile["representativeMemories"];
  returnTo: string;
}) {
  return (
    <section className="space-y-3" aria-label="Recuerdos representativos">
      <h2 className="text-sm font-medium text-zinc-500">
        Recuerdos representativos
      </h2>
      <div className="space-y-4">
        {memories.map((memory) => (
          <Link
            key={memory.nodeId}
            href={getNodeDetailPath(memory.nodeId, { returnTo })}
            className="block border-l-2 border-zinc-100 pl-3 outline-none hover:border-zinc-300 focus-visible:ring-2 focus-visible:ring-zinc-400"
          >
            {memory.identityLabels.length > 0 ? (
              <span className="mb-1 block truncate text-xs text-zinc-500">
                {memory.identityLabels.join(" · ")}
              </span>
            ) : null}
            <span className="block text-base leading-7 text-zinc-800">
              {memory.excerpt}
            </span>
            <time className="mt-1 block text-xs text-zinc-500">
              {formatShortDate(memory.createdAt.toISOString())}
            </time>
          </Link>
        ))}
      </div>
    </section>
  );
}

function RecentMemories({
  conceptId,
  memories,
  identities,
  returnTo,
}: {
  conceptId: string;
  memories: Node[];
  identities: Map<string, CaptureEmergentIdentity>;
  returnTo: string;
}) {
  return (
    <section className="space-y-4" aria-label="Recuerdos recientes">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-medium text-zinc-500">Recuerdos recientes</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-600">
            Últimas capturas donde este concepto aparece.
          </p>
        </div>
        <Link
          href={`/memory?concept=${encodeURIComponent(conceptId)}`}
          className="text-sm font-medium text-zinc-700 outline-none hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
        >
          Explorar memoria
        </Link>
      </div>
      <MemoryList memories={memories} identities={identities} returnTo={returnTo} />
    </section>
  );
}

function MemoryList({
  memories,
  identities,
  returnTo,
}: {
  memories: Node[];
  identities: Map<string, CaptureEmergentIdentity>;
  returnTo: string;
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
        />
      ))}
    </div>
  );
}

function MemoryItem({
  node,
  identity,
  returnTo,
}: {
  node: Node;
  identity: CaptureEmergentIdentity | null;
  returnTo: string;
}) {
  const preview = getCapturePreview(node.content, { maxLength: 220 });

  return (
    <article className="space-y-1">
      {identity?.displayText ? (
        <CaptureEmergentIdentityLabel
          identity={identity}
          getConceptHref={(contextId) => getConceptExplorationPath(contextId, { returnTo })}
        />
      ) : null}
      <Link
        href={getNodeDetailPath(node.id, { returnTo })}
        className="block rounded-sm text-base leading-7 text-zinc-800 outline-none hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
      >
        {preview}
      </Link>
      <time className="block text-xs text-zinc-500">
        {formatShortDate(getContentTimestamp(node))}
      </time>
    </article>
  );
}

function formatProfileDate(date: Date | null) {
  return date ? formatShortDate(date.toISOString()) : "Aún sin recuerdos";
}

function ConceptExplorationMessage({
  heading,
  message,
}: {
  heading: string;
  message: string;
}) {
  return (
    <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-medium text-zinc-950">{heading}</h1>
      <p className="text-sm text-zinc-600">{message}</p>
      <Button asChild className="w-fit">
        <Link href="/">Volver a Inicio</Link>
      </Button>
    </section>
  );
}
