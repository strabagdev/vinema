"use client";

import Link from "next/link";
import { ArrowLeft, Brain, Network } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
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

export function ConceptIndexClient() {
  const vinemaContext = useVinemaContext();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [concepts, setConcepts] = useState<Context[]>([]);
  const [relations, setRelations] = useState<NodeContextRelation[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [error, setError] = useState<string | null>(null);

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
          includeArchived: false,
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

  if (vinemaContext.status === "loading" || loadState === "loading") {
    return (
      <ConceptIndexShell>
        <p className="text-sm text-zinc-500">Cargando conocimiento...</p>
      </ConceptIndexShell>
    );
  }

  if (vinemaContext.status === "error") {
    return (
      <ConceptIndexShell>
        <ConceptIndexMessage
          heading="No se pudo cargar Vinema"
          message={vinemaContext.error}
        />
      </ConceptIndexShell>
    );
  }

  if (loadState === "error") {
    return (
      <ConceptIndexShell>
        <ConceptIndexMessage
          heading="No se pudo abrir Conocimiento"
          message={error ?? "Intenta volver al inicio y abrirlo nuevamente."}
        />
      </ConceptIndexShell>
    );
  }

  if (concepts.length === 0) {
    return (
      <ConceptIndexShell>
        <ConceptIndexMessage
          heading="Aun no hay conceptos"
          message="Los conceptos apareceran cuando tu memoria empiece a formar conexiones."
        />
      </ConceptIndexShell>
    );
  }

  return (
    <ConceptIndexShell>
      <div className="grid gap-2 sm:grid-cols-2">
        {concepts.map((concept) => (
          <Link
            key={concept.id}
            href={getConceptExplorationPath(concept.id, { returnTo: "/concepts" })}
            className="group min-w-0 rounded-lg p-4 outline-none transition-colors hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-400 motion-reduce:transition-none"
          >
            <span className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 group-hover:bg-zinc-200">
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
          </Link>
        ))}
      </div>
    </ConceptIndexShell>
  );
}

function ConceptIndexShell({ children }: { children: ReactNode }) {
  return (
    <section
      className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-5 sm:px-6 lg:px-8"
      data-concept-index=""
    >
      <header className="flex flex-col gap-5">
        <div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Volver
            </Link>
          </Button>
        </div>
        <div className="flex items-start gap-3">
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
        <div>
          <Button variant="ghost" size="sm" asChild>
            <Link href={getConceptKnowledgeExplorerPath()}>
              Explorar conocimiento
            </Link>
          </Button>
        </div>
      </header>
      {children}
    </section>
  );
}

function ConceptIndexMessage({
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
      <Button variant="ghost" size="sm" asChild className="mt-4">
        <Link href="/">Volver al inicio</Link>
      </Button>
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
