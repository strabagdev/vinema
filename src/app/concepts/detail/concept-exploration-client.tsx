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
import { deriveConceptNeighborhood } from "@/features/exploration/concept-neighborhood";
import {
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
type ExplorationMode = "memories" | "time";

const CONCEPT_EXPLORATION_INVALIDATION_TYPES = [
  "capture",
  "concept",
  "captureConcept",
] as const;

export function ConceptExplorationClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const contextId = getConceptIdFromSearchParams(searchParams);
  const returnTo = getReturnToFromSearchParams(searchParams);
  const vinemaContext = useVinemaContext();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [center, setCenter] = useState<Context | null>(null);
  const [memories, setMemories] = useState<Node[]>([]);
  const [relations, setRelations] = useState<NodeContextRelation[]>([]);
  const [contexts, setContexts] = useState<Context[]>([]);
  const [identities, setIdentities] = useState<
    Map<string, CaptureEmergentIdentity>
  >(new Map());
  const [mode, setMode] = useState<ExplorationMode>("memories");
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
      setMemories(nextMemories);
      setIdentities(
        await loadCaptureEmergentIdentities(
          { contextRepository, nodeContextRelationRepository },
          nextMemories.map((node) => node.id),
        ),
      );
      setLoadState("ready");
    } catch {
      setError("No se pudo cargar la exploracion del concepto.");
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
        <p className="text-sm text-zinc-500">Cargando exploracion...</p>
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
    <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-5 sm:px-6 lg:px-8">
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
              {memories.length} recuerdos relacionados
              {neighborhood
                ? ` · ${neighborhood.relatedConcepts.length} conceptos conectados`
                : ""}
            </p>
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
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          {mode === "memories" ? (
            <MemoryList
              memories={memories}
              identities={identities}
              returnTo={getConceptExplorationPath(center.id, { returnTo })}
            />
          ) : (
            <TimeMemoryList
              memories={memories}
              identities={identities}
              returnTo={getConceptExplorationPath(center.id, { returnTo })}
            />
          )}
        </div>
        <aside className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-700">
            <Network className="h-4 w-4" aria-hidden="true" />
            Caminos cercanos
          </div>
          {neighborhood && neighborhood.relatedConcepts.length > 0 ? (
            <div className="flex flex-col gap-2">
              {neighborhood.relatedConcepts.map((concept) => (
                <button
                  key={concept.id}
                  type="button"
                  className="rounded-md px-1 py-1.5 text-left outline-none transition-colors hover:bg-zinc-100/70 focus-visible:ring-2 focus-visible:ring-zinc-400"
                  onClick={() => navigateToConcept(concept.id)}
                >
                  <span className="block text-sm font-medium text-zinc-800">
                    {concept.label}
                  </span>
                  <span className="block text-xs text-zinc-500">
                    {concept.sharedCaptureCount} recuerdos en comun ·{" "}
                    {formatShortDate(concept.lastSharedActivityAt)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm leading-6 text-zinc-500">
              Todavia no hay conceptos conectados por recuerdos comunes.
            </p>
          )}
        </aside>
      </div>
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
