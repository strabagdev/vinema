"use client";

import { useState } from "react";
import { ConceptIndexClient } from "@/app/concepts/concept-index-client";
import { ConceptExplorationClient } from "@/app/concepts/detail/concept-exploration-client";
import { ConceptKnowledgeExplorerClient } from "@/app/concepts/explore/concept-knowledge-explorer-client";

export function ConceptWorkspaceClient({
  initialConceptId = null,
  onOpenMemory,
}: {
  initialConceptId?: string | null;
  onOpenMemory?: (nodeId: string) => void;
}) {
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(
    initialConceptId,
  );

  return (
    <section
      className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_minmax(12rem,0.72fr)] gap-4 overflow-hidden px-4 py-4 sm:px-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)_minmax(14rem,0.68fr)]"
      data-concept-workspace=""
    >
      <div
        className="min-h-0 overflow-hidden rounded-lg border border-zinc-100 bg-white"
        data-concept-workspace-index=""
      >
        <ConceptIndexClient
          embedded
          workspaceMode
          selectedConceptId={selectedConceptId}
          onOpenConcept={setSelectedConceptId}
        />
      </div>

      <div
        className="min-h-0 overflow-hidden rounded-lg border border-zinc-100 bg-white"
        data-concept-workspace-map=""
      >
        <ConceptKnowledgeExplorerClient
          embedded
          workspaceMode
          selectedConceptId={selectedConceptId}
          onSelectConcept={setSelectedConceptId}
          onOpenConcept={setSelectedConceptId}
        />
      </div>

      <div
        className="min-h-0 overflow-hidden rounded-lg border border-zinc-100 bg-white lg:col-span-2"
        data-concept-workspace-profile=""
      >
        {selectedConceptId ? (
          <ConceptExplorationClient
            embeddedContextId={selectedConceptId}
            workspaceMode
            onOpenConcept={setSelectedConceptId}
            onOpenMemory={onOpenMemory}
            onOpenMap={setSelectedConceptId}
          />
        ) : (
          <div className="flex h-full min-h-0 items-center justify-center px-4 py-8 text-center">
            <div>
              <h2 className="text-sm font-medium text-zinc-950">Perfil</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">
                Selecciona un concepto en el indice o en el mapa.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
