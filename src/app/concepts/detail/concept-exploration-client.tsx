"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Clock3, List, Network } from "lucide-react";
import type React from "react";
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
import {
  deriveConceptGraphNeighborhood,
  type ConceptGraphNeighborhood,
  type RelationshipStrength,
} from "@/features/exploration/concept-relationships";
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
type KnowledgeBaseMode = "memories" | "time" | "map";

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
  const [mode, setMode] = useState<KnowledgeBaseMode>("memories");
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
        !statement.hasContradictoryEvidence &&
        statement.confidence !== "LOW" &&
        (statement.sourceConceptId === contextId ||
          statement.targetConceptId === contextId),
    );
  }, [contextId, memoryResponse]);
  const graphNeighborhood = useMemo(() => {
    if (!contextId) {
      return null;
    }

    return deriveConceptGraphNeighborhood({
      currentConceptId: contextId,
      contexts,
      relations,
      nodes: workspaceNodes,
    });
  }, [contextId, contexts, relations, workspaceNodes]);

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
      className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-5 opacity-100 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none sm:px-6 lg:px-8"
      data-knowledge-base-surface=""
      data-expansion-source={expansionSource ?? undefined}
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={goBack}>
              ← Volver
            </Button>
            {center.archivedAt ? (
              <span className="rounded-full border border-zinc-200 px-2 py-1 text-xs text-zinc-500">
                Archivado
              </span>
            ) : null}
          </div>
          <div>
            <h1 className="text-2xl font-medium tracking-normal text-zinc-950 sm:text-3xl">
              {center.name}
            </h1>
            <p className="mt-2 text-sm leading-6 text-zinc-500" aria-live="polite">
              Base de conocimiento · {memories.length} recuerdos relacionados
              {neighborhood
                ? ` · ${neighborhood.relatedConcepts.length} conceptos conectados`
                : ""}
            </p>
            {center.aliases && center.aliases.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
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
        </div>
        <div className="flex items-center gap-1" aria-label="Representacion">
          <ModeButton
            active={mode === "memories"}
            icon={<List className="h-4 w-4" aria-hidden="true" />}
            label="Recuerdos"
            onClick={() => setMode("memories")}
          />
          <ModeButton
            active={mode === "time"}
            icon={<Clock3 className="h-4 w-4" aria-hidden="true" />}
            label="Tiempo"
            onClick={() => setMode("time")}
          />
          <ModeButton
            active={mode === "map"}
            icon={<Network className="h-4 w-4" aria-hidden="true" />}
            label="Mapa"
            onClick={() => setMode("map")}
          />
        </div>
      </header>

      {profile && profile.memoryCount > 0 ? (
        <ConceptProfileSummary
          profile={profile}
          behavioralPatterns={behavioralPatterns}
          evolutionSignals={evolutionSignals}
          semanticStatements={semanticStatements}
          conceptsById={new Map(contexts.map((context) => [context.id, context]))}
          nodesById={new Map(workspaceNodes.map((node) => [node.id, node]))}
          returnTo={getConceptExplorationPath(center.id, { returnTo })}
          onNavigateToConcept={navigateToConcept}
        />
      ) : null}

      <div className="min-w-0">
        {mode === "memories" ? (
          <MemoryList
            memories={memories}
            identities={identities}
            returnTo={getConceptExplorationPath(center.id, { returnTo })}
          />
        ) : null}
        {mode === "time" ? (
          <TimeMemoryList
            memories={memories}
            identities={identities}
            returnTo={getConceptExplorationPath(center.id, { returnTo })}
          />
        ) : null}
        {mode === "map" ? (
          <PreparedMapView
            center={center}
            memories={memories}
            graphNeighborhood={graphNeighborhood}
            onNavigateToConcept={navigateToConcept}
          />
        ) : null}
      </div>
    </section>
  );
}

function ConceptProfileSummary({
  profile,
  behavioralPatterns,
  evolutionSignals,
  semanticStatements,
  conceptsById,
  nodesById,
  returnTo,
  onNavigateToConcept,
}: {
  profile: ConceptProfile;
  behavioralPatterns: BehavioralPattern[];
  evolutionSignals: MemoryEvolutionSignal[];
  semanticStatements: SemanticStatement[];
  conceptsById: Map<string, Context>;
  nodesById: Map<string, Node>;
  returnTo: string;
  onNavigateToConcept: (contextId: string) => void;
}) {
  const hasTemporalProfile = profile.memoryCount > 1;
  const hasSecondaryProfile =
    profile.relatedConcepts.length > 0 ||
    hasTemporalProfile ||
    behavioralPatterns.length > 0 ||
    evolutionSignals.length > 0 ||
    semanticStatements.length > 0;

  return (
    <section
      className={
        hasSecondaryProfile
          ? "grid gap-5 rounded-2xl bg-zinc-50/70 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_18rem]"
          : "rounded-2xl bg-zinc-50/70 p-4 sm:p-5"
      }
      aria-label="Perfil conceptual"
    >
      <div className="min-w-0 space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <ProfileMetric
            label="Recuerdos"
            value={String(profile.memoryCount)}
          />
          {hasTemporalProfile ? (
            <>
              <ProfileMetric
                label="Primera aparición"
                value={formatProfileDate(profile.firstSeenAt)}
              />
              <ProfileMetric
                label="Última actividad"
                value={formatProfileDate(profile.lastSeenAt)}
              />
            </>
          ) : null}
        </div>

        {profile.representativeMemories.length > 0 ? (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-zinc-700">
              Recuerdos representativos
            </h2>
            <div className="space-y-3">
              {profile.representativeMemories.map((memory) => (
                <Link
                  key={memory.nodeId}
                  href={getNodeDetailPath(memory.nodeId, { returnTo })}
                  className="block rounded-lg bg-white/70 p-3 outline-none transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-zinc-400 motion-reduce:transition-none"
                >
                  {memory.identityLabels.length > 0 ? (
                    <span className="mb-1 block truncate text-xs text-zinc-500">
                      {memory.identityLabels.join(" · ")}
                    </span>
                  ) : null}
                  <span className="block text-sm leading-6 text-zinc-800">
                    {memory.excerpt}
                  </span>
                  <time className="mt-1 block text-xs text-zinc-500">
                    {formatShortDate(memory.createdAt.toISOString())}
                  </time>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {hasTemporalProfile && profile.activity.monthlyBuckets.length > 0 ? (
          <ActivityBuckets activity={profile.activity} />
        ) : null}
      </div>

      {hasSecondaryProfile ? (
        <aside className="space-y-4">
          {profile.relatedConcepts.length > 0 ? (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-zinc-700">Conectado con</h2>
              <div className="space-y-2">
                {profile.relatedConcepts.map((concept) => (
                  <div
                    key={concept.conceptId}
                    className="rounded-lg bg-white/70 px-3 py-2"
                  >
                    <button
                      type="button"
                      className="w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                      onClick={() => onNavigateToConcept(concept.conceptId)}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="block truncate text-sm font-medium text-zinc-800">
                          {concept.label}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${getStrengthClass(concept.strength)}`}
                        >
                          {formatStrength(concept.strength)}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs text-zinc-500">
                        {concept.sharedMemoryCount} recuerdos compartidos
                        {concept.lastSharedAt
                          ? ` · ${formatShortDate(concept.lastSharedAt.toISOString())}`
                          : ""}
                      </span>
                    </button>
                    {concept.evidence[0] ? (
                      <Link
                        href={getNodeDetailPath(concept.evidence[0].nodeId, { returnTo })}
                        className="mt-2 block rounded-md border-l-2 border-zinc-200 pl-2 text-xs leading-5 text-zinc-500 outline-none hover:text-zinc-800 focus-visible:ring-2 focus-visible:ring-zinc-400"
                      >
                        {concept.evidence[0].excerpt}
                      </Link>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {profile.activity.total > 1 ? (
            <div className="space-y-2 text-sm text-zinc-600">
              <p>{profile.activity.last7Days} en los últimos 7 días</p>
              <p>{profile.activity.last30Days} en los últimos 30 días</p>
            </div>
          ) : null}

          {evolutionSignals.length > 0 ? (
            <ObservedEvolution
              signals={evolutionSignals.slice(0, 4)}
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
            />
          ) : null}
        </aside>
      ) : null}
    </section>
  );
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
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-zinc-700">Significados observados</h2>
      <div className="space-y-3">
        {statements.map((statement) => (
          <div key={statement.id} className="rounded-lg bg-white/70 px-3 py-2">
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
          </div>
        ))}
      </div>
    </div>
  );
}

function ObservedPatterns({
  patterns,
  currentConceptId,
  conceptsById,
}: {
  patterns: BehavioralPattern[];
  currentConceptId: string;
  conceptsById: Map<string, Context>;
}) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-zinc-700">Patrones observados</h2>
      <div className="space-y-2">
        {patterns.map((pattern) => (
          <div
            key={pattern.id}
            className="rounded-lg bg-white/70 px-3 py-2 text-xs leading-5 text-zinc-600"
          >
            {formatBehavioralPattern(pattern, currentConceptId, conceptsById)}
          </div>
        ))}
      </div>
    </div>
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

function ActivityBuckets({ activity }: { activity: ConceptProfile["activity"] }) {
  const maxCount = Math.max(...activity.monthlyBuckets.map((bucket) => bucket.count), 1);

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-zinc-700">Evolución</h2>
      <div className="space-y-2">
        {activity.monthlyBuckets.map((bucket) => (
          <div key={bucket.month} className="grid grid-cols-[4.5rem_minmax(0,1fr)_2rem] items-center gap-3">
            <span className="text-xs text-zinc-500">{formatMonth(bucket.month)}</span>
            <span className="h-2 overflow-hidden rounded-full bg-zinc-200">
              <span
                className="block h-full rounded-full bg-emerald-500/70"
                style={{ width: `${Math.max(8, (bucket.count / maxCount) * 100)}%` }}
              />
            </span>
            <span className="text-right text-xs text-zinc-500">{bucket.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatStrength(strength: RelationshipStrength) {
  return strength === "STRONG"
    ? "Fuerte"
    : strength === "MEDIUM"
      ? "Media"
      : "Débil";
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

function getMapStrengthClass(strength: RelationshipStrength) {
  if (strength === "STRONG") {
    return "border-emerald-300 bg-emerald-50/80 text-emerald-800";
  }

  if (strength === "MEDIUM") {
    return "border-sky-300 bg-sky-50/80 text-sky-800";
  }

  return "border-zinc-200 bg-white text-zinc-600";
}

function PreparedMapView({
  center,
  memories,
  graphNeighborhood,
  onNavigateToConcept,
}: {
  center: Context;
  memories: Node[];
  graphNeighborhood: ConceptGraphNeighborhood | null;
  onNavigateToConcept: (contextId: string) => void;
}) {
  return (
    <section className="space-y-6" aria-label="Mapa preparado">
      <div className="space-y-2">
        <h2 className="text-sm font-medium text-zinc-500">
          Mapa conceptual preparado
        </h2>
        <p className="text-sm font-medium text-zinc-800">{center.name}</p>
        <p className="max-w-2xl text-sm leading-6 text-zinc-500">
          Este modo conserva el centro actual y muestra las conexiones que ya se
          pueden derivar por recuerdos comunes, sin introducir un grafo visual
          todavia.
        </p>
      </div>
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-zinc-500">Actividad conectada</h2>
        <p className="text-sm leading-6 text-zinc-700">
          {memories.length} recuerdos sostienen este concepto.
        </p>
      </div>
      {graphNeighborhood && graphNeighborhood.edges.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-zinc-500">Conceptos cercanos</h2>
          <div className="flex flex-wrap gap-2">
            {graphNeighborhood.edges.map((edge) => {
              const concept = graphNeighborhood.nodes.find(
                (node) => node.conceptId === edge.targetId,
              );

              if (!concept) {
                return null;
              }

              return (
                <button
                  key={edge.targetId}
                  type="button"
                  className={`rounded-full border px-3 py-1.5 text-sm outline-none transition-colors hover:bg-zinc-50 hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400 motion-reduce:transition-none ${getMapStrengthClass(edge.strength)}`}
                  onClick={() => onNavigateToConcept(edge.targetId)}
                >
                  {concept.label} · {edge.sharedMemoryCount}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-sm leading-6 text-zinc-500">
          Todavia no hay conexiones suficientes para dibujar un mapa util.
        </p>
      )}
    </section>
  );
}

function ModeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={
        active
          ? "inline-flex h-9 w-9 items-center justify-center rounded-md bg-zinc-900 text-white outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          : "inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-500 outline-none hover:bg-zinc-100 hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
      }
      onClick={onClick}
    >
      {icon}
    </button>
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

function TimeMemoryList({
  memories,
  identities,
  returnTo,
}: {
  memories: Node[];
  identities: Map<string, CaptureEmergentIdentity>;
  returnTo: string;
}) {
  const groups = groupMemoriesByTime(memories);

  if (groups.length === 0) {
    return <MemoryList memories={memories} identities={identities} returnTo={returnTo} />;
  }

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.label} className="space-y-3">
          <h2 className="text-sm font-medium text-zinc-500">{group.label}</h2>
          <div className="space-y-5">
            {group.nodes.map((node) => (
              <MemoryItem
                key={node.id}
                node={node}
                identity={identities.get(node.id) ?? null}
                returnTo={returnTo}
              />
            ))}
          </div>
        </section>
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

function groupMemoriesByTime(nodes: Node[]) {
  const now = new Date();
  const groups = new Map<string, Node[]>();

  for (const node of nodes) {
    const date = new Date(getContentTimestamp(node));
    const days = Math.floor(
      (startOfDay(now).getTime() - startOfDay(date).getTime()) /
        86_400_000,
    );
    const label =
      days === 0
        ? "Hoy"
        : days === 1
          ? "Ayer"
          : days <= 7
            ? "Ultimos 7 dias"
            : new Intl.DateTimeFormat("es", {
                month: "long",
                year: "numeric",
              }).format(date);

    groups.set(label, [...(groups.get(label) ?? []), node]);
  }

  return Array.from(groups.entries()).map(([label, groupNodes]) => ({
    label,
    nodes: groupNodes,
  }));
}

function formatProfileDate(date: Date | null) {
  return date ? formatShortDate(date.toISOString()) : "Aún sin recuerdos";
}

function formatMonth(month: string) {
  const [year, monthNumber] = month.split("-");
  const date = new Date(Date.UTC(Number(year), Number(monthNumber) - 1, 1));

  if (Number.isNaN(date.getTime())) {
    return month;
  }

  return new Intl.DateTimeFormat("es", {
    month: "short",
    year: "numeric",
  }).format(date);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
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
