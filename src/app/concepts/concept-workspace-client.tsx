"use client";

import { X } from "lucide-react";
import type { UIEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConceptIndexClient } from "@/app/concepts/concept-index-client";
import { ConceptExplorationClient } from "@/app/concepts/detail/concept-exploration-client";
import { ConceptKnowledgeExplorerClient } from "@/app/concepts/explore/concept-knowledge-explorer-client";

export function ConceptWorkspaceClient({
  initialConceptId = null,
  initialState,
  onOpenMemory,
  onOpenConcept,
  onStateChange,
  onClose,
}: {
  initialConceptId?: string | null;
  initialState?: ConceptWorkspaceState;
  onOpenMemory?: (nodeId: string) => void;
  onOpenConcept?: (conceptId: string) => void;
  onStateChange?: (state: ConceptWorkspaceState) => void;
  onClose?: () => void;
}) {
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(
    initialState?.selectedConceptId ?? initialConceptId,
  );
  const [mobileView, setMobileView] = useState<"profile" | "map">("profile");
  const [query, setQuery] = useState(initialState?.query ?? "");
  const profileRef = useRef<HTMLDivElement | null>(null);
  const mapTransformRef = useRef(initialState?.mapTransform);

  const reportState = useCallback(
    (state: Partial<ConceptWorkspaceState>) => {
      onStateChange?.({
        selectedConceptId,
        query,
        profileScrollTop: profileRef.current?.scrollTop ?? initialState?.profileScrollTop ?? 0,
        mapTransform: mapTransformRef.current,
        ...state,
      });
    },
    [initialState?.profileScrollTop, onStateChange, query, selectedConceptId],
  );

  const selectConcept = useCallback((conceptId: string) => {
    setSelectedConceptId(conceptId);
    setMobileView("profile");
    reportState({ selectedConceptId: conceptId });
  }, [reportState]);

  const pushConcept = useCallback((conceptId: string) => {
    if (!onOpenConcept) {
      selectConcept(conceptId);
      return;
    }

    onOpenConcept?.(conceptId);
  }, [onOpenConcept, selectConcept]);

  const updateQuery = useCallback((nextQuery: string) => {
    setQuery(nextQuery);
    reportState({ query: nextQuery });
  }, [reportState]);

  const handleProfileScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    reportState({ profileScrollTop: event.currentTarget.scrollTop });
  }, [reportState]);

  const handleMapTransformChange = useCallback((mapTransform: ConceptWorkspaceState["mapTransform"]) => {
    mapTransformRef.current = mapTransform;
    reportState({ mapTransform });
  }, [reportState]);

  useEffect(() => {
    const profile = profileRef.current;
    if (!profile || initialState?.profileScrollTop === undefined) {
      return;
    }

    queueMicrotask(() => {
      profile.scrollTop = initialState.profileScrollTop ?? 0;
    });
  }, [initialState?.profileScrollTop, selectedConceptId]);

  return (
    <section
      className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden px-3 py-3 sm:px-4"
      data-concept-workspace=""
    >
      <div
        className="flex min-h-0 items-center gap-3 overflow-hidden"
        data-concept-workspace-topbar=""
      >
        <h2 className="shrink-0 text-lg font-semibold text-zinc-950">Conceptos</h2>
        <ConceptIndexClient
          embedded
          workspaceMode
          selectedConceptId={selectedConceptId}
          initialQuery={query}
          onQueryChange={updateQuery}
          onOpenConcept={selectConcept}
        />
        {onClose ? (
          <button
            type="button"
            className="shrink-0 rounded-md p-2 text-zinc-500 outline-none hover:bg-zinc-100 hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
            aria-label="Cerrar Conceptos"
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div
        className="my-2 flex shrink-0 rounded-md border border-zinc-100 bg-white p-1 md:hidden"
        aria-label="Vistas de Conceptos"
        data-concept-workspace-mobile-nav=""
      >
        <button
          type="button"
          className={
            mobileView === "profile"
              ? "h-8 flex-1 rounded bg-zinc-950 px-3 text-sm font-medium text-white"
              : "h-8 flex-1 rounded px-3 text-sm font-medium text-zinc-600"
          }
          onClick={() => setMobileView("profile")}
        >
          Perfil
        </button>
        <button
          type="button"
          className={
            mobileView === "map"
              ? "h-8 flex-1 rounded bg-zinc-950 px-3 text-sm font-medium text-white"
              : "h-8 flex-1 rounded px-3 text-sm font-medium text-zinc-600"
          }
          onClick={() => setMobileView("map")}
        >
          Mapa
        </button>
      </div>

      <div
        className={
          "grid min-h-0 overflow-hidden md:grid-cols-[minmax(16rem,44%)_minmax(0,56%)] xl:grid-cols-[minmax(20rem,40%)_minmax(0,60%)]"
        }
        data-concept-workspace-main=""
      >
        <div
          className={
            mobileView === "profile"
              ? "min-h-0 overflow-hidden rounded-lg border border-zinc-100 bg-white md:mr-3 md:block"
              : "hidden min-h-0 overflow-hidden rounded-lg border border-zinc-100 bg-white md:mr-3 md:block"
          }
          data-concept-workspace-profile=""
          ref={profileRef}
          onScroll={handleProfileScroll}
        >
          {selectedConceptId ? (
            <ConceptExplorationClient
              embeddedContextId={selectedConceptId}
              workspaceMode
              onOpenConcept={pushConcept}
              onOpenMemory={onOpenMemory}
            />
          ) : (
            <div className="flex h-full min-h-0 items-center px-4 py-6 text-sm leading-6 text-zinc-500">
              Selecciona un concepto para ver su detalle.
            </div>
          )}
        </div>

        <div
          className={
            mobileView === "map"
              ? "min-h-0 overflow-hidden rounded-lg border border-zinc-100 bg-white md:block"
              : "hidden min-h-0 overflow-hidden rounded-lg border border-zinc-100 bg-white md:block"
          }
          data-concept-workspace-map=""
        >
          <ConceptKnowledgeExplorerClient
            embedded
            workspaceMode
            selectedConceptId={selectedConceptId}
            onSelectConcept={selectConcept}
            onOpenConcept={selectConcept}
            initialViewTransform={initialState?.mapTransform}
            onViewTransformChange={handleMapTransformChange}
          />
        </div>
      </div>
    </section>
  );
}

export type ConceptWorkspaceState = {
  selectedConceptId?: string | null;
  query?: string;
  profileScrollTop?: number;
  mapTransform?: {
    scale: number;
    x: number;
    y: number;
  };
};
