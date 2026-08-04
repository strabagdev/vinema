"use client";

import { useCallback, useEffect, useState } from "react";
import { useRef } from "react";
import type { NodeRepository } from "@/domain/node/node-repository";
import type { NodeContextRelationRepository } from "@/domain/context/node-context-relation-repository";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { ContextRepository } from "@/domain/context/context-repository";
import {
  evaluateCaptureInput,
} from "@/features/associations/capture-input-evaluation";
import type {
  AssociationSuggestion,
  ConceptSuggestion,
  SuggestionDiagnostics,
} from "@/features/associations/association-types";
import {
  normalizeAssociationError,
  reportAssociationError,
  type AssociationError,
} from "@/features/associations/association-errors";

const ASSOCIATION_DEBOUNCE_MS = 320;

export type AssociationSuggestionState =
  | {
      status: "idle" | "loading" | "ready";
      suggestions: AssociationSuggestion[];
      conceptSuggestions: ConceptSuggestion[];
      error: null;
      comparedCaptures: number;
      elapsedMs: number;
      diagnostics: SuggestionDiagnostics | null;
      retry: () => void;
    }
  | {
      status: "error";
      suggestions: AssociationSuggestion[];
      conceptSuggestions: ConceptSuggestion[];
      error: AssociationError;
      comparedCaptures: number;
      elapsedMs: number;
      diagnostics: SuggestionDiagnostics | null;
      retry: () => void;
    };

export function useAssociationSuggestions({
  text,
  workspaceId,
  currentNodeId,
  selectedCaptureIds,
  selectedContextIds = [],
  contextRepository,
  nodeRepository,
  relationRepository,
}: {
  text: string;
  workspaceId: string;
  currentNodeId?: string;
  selectedCaptureIds: string[];
  selectedContextIds?: string[];
  contextRepository: ContextRepository;
  nodeRepository: NodeRepository;
  relationRepository: NodeContextRelationRepository;
}): AssociationSuggestionState {
  const latestRequestId = useRef(0);
  const [retryToken, setRetryToken] = useState(0);
  const retry = useCallback(() => setRetryToken((value) => value + 1), []);
  const [state, setState] = useState<AssociationSuggestionState>({
    status: "idle",
    suggestions: [],
    conceptSuggestions: [],
    error: null,
    comparedCaptures: 0,
    elapsedMs: 0,
    diagnostics: null,
    retry,
  });
  const selectedCaptureIdsKey = selectedCaptureIds.join("\u0001");
  const selectedContextIdsKey = selectedContextIds.join("\u0001");

  useEffect(() => {
    const normalizedText = text.trim();
    const requestId = latestRequestId.current + 1;
    latestRequestId.current = requestId;
    let cancelled = false;
    const effectStartedAt = performance.now();

    if (!normalizedText) {
      queueMicrotask(() => {
        if (cancelled || requestId !== latestRequestId.current) {
          return;
        }

        setState({
          status: "idle",
          suggestions: [],
          conceptSuggestions: [],
          error: null,
          comparedCaptures: 0,
          elapsedMs: 0,
          diagnostics: null,
          retry,
        });
      });
      return () => {
        cancelled = true;
      };
    }

    const selectedContextIdsForImmediateState = selectedContextIdsKey
      ? selectedContextIdsKey.split("\u0001")
      : [];

    queueMicrotask(() => {
      if (cancelled || requestId !== latestRequestId.current) {
        return;
      }

      setState((current) => ({
        ...current,
        status: "loading",
        suggestions: [],
        conceptSuggestions: current.conceptSuggestions.filter(
          (suggestion) =>
            suggestion.kind === "existing" &&
            selectedContextIdsForImmediateState.includes(suggestion.conceptId),
        ),
        error: null,
        retry,
      }));
    });

    const timer = setTimeout(() => {
      async function runSuggestions() {
        const startedAt = performance.now();
        const selectedCaptureIdsForRequest = selectedCaptureIdsKey
          ? selectedCaptureIdsKey.split("\u0001")
          : [];
        const selectedContextIdsForRequest = selectedContextIdsKey
          ? selectedContextIdsKey.split("\u0001")
          : [];
        let indexedCaptures = 0;
        let relationCount = 0;
        let captureReadMs = 0;
        let contextReadMs = 0;
        let relationReadMs = 0;
        let indexPreparationMs = 0;
        let recoveryMs = 0;
        let conceptsMs = 0;
        let contextCount = 0;

        try {
          const captureReadStartedAt = performance.now();
          const nodes = await nodeRepository.listByWorkspace(workspaceId);
          captureReadMs = performance.now() - captureReadStartedAt;
          const contextReadStartedAt = performance.now();
          const contexts = await contextRepository.list({
            workspaceId,
            includeArchived: false,
          });
          contextReadMs = performance.now() - contextReadStartedAt;
          contextCount = contexts.length;
          let relations: NodeContextRelation[] = [];

          try {
            const relationReadStartedAt = performance.now();
            relations = await relationRepository.listByWorkspace(workspaceId);
            relationReadMs = performance.now() - relationReadStartedAt;
            relationCount = relations.length;
          } catch (error) {
            const normalizedError = normalizeAssociationError(error, {
              code: "RELATION_LOAD_FAILED",
              stage: "relation-load",
            });
            reportAssociationError(normalizedError, {
              queryLength: text.length,
              indexedCaptures,
              relationCount,
            });
          }

          const evaluation = evaluateCaptureInput({
            text,
            nodes,
            contexts,
            relations,
            currentNodeId,
            selectedCaptureIds: selectedCaptureIdsForRequest,
            selectedContextIds: selectedContextIdsForRequest,
            requestId,
            debounceMs: Math.round(startedAt - effectStartedAt),
            timings: {
              captureReadMs: Math.round(captureReadMs),
              contextReadMs: Math.round(contextReadMs),
              relationReadMs: Math.round(relationReadMs),
            },
          });
          indexedCaptures = evaluation.diagnostics.captureCount;
          indexPreparationMs = evaluation.diagnostics.indexPreparationMs;
          recoveryMs = evaluation.diagnostics.recoveryMs;
          conceptsMs = evaluation.diagnostics.conceptsMs;

          if (!cancelled && requestId === latestRequestId.current) {
            const stateUpdateStartedAt = performance.now();
            const diagnostics: SuggestionDiagnostics = {
              ...evaluation.diagnostics,
              stateUpdateMs: Math.round(performance.now() - stateUpdateStartedAt),
              totalMs: Math.round(performance.now() - effectStartedAt),
              contextCount,
              relationCount,
            };
            reportSuggestionDiagnostics(diagnostics);

            setState({
              status: "ready",
              suggestions: evaluation.recoveryMatches,
              conceptSuggestions: evaluation.conceptSuggestions,
              error: null,
              comparedCaptures: evaluation.diagnostics.captureCount,
              elapsedMs: diagnostics.totalMs,
              diagnostics,
              retry,
            });
          }
        } catch (error: unknown) {
          const normalizedError = normalizeAssociationError(error, {
            code: "QUERY_FAILED",
            stage: "association-query",
          });
          reportAssociationError(normalizedError, {
            queryLength: text.length,
            indexedCaptures,
            relationCount,
          });

          if (!cancelled && requestId === latestRequestId.current) {
            const diagnostics: SuggestionDiagnostics = {
              query: text,
              requestId,
              debounceMs: Math.round(startedAt - effectStartedAt),
              captureReadMs: Math.round(captureReadMs),
              contextReadMs: Math.round(contextReadMs),
              relationReadMs: Math.round(relationReadMs),
              indexPreparationMs: Math.round(indexPreparationMs),
              recoveryMs: Math.round(recoveryMs),
              conceptsMs: Math.round(conceptsMs),
              stateUpdateMs: 0,
              totalMs: Math.round(performance.now() - effectStartedAt),
              captureCount: indexedCaptures,
              contextCount,
              relationCount,
              recoveryResultCount: 0,
              conceptResultCount: 0,
              conceptTraces: [],
              evidenceCandidateCount: 0,
              clusterCount: 0,
              existingConceptSuggestionCount: 0,
              emergingConceptSuggestionCount: 0,
              clusterDetectionMs: 0,
              labelExtractionMs: 0,
              deduplicationMs: 0,
            };

            setState({
              status: "error",
              suggestions: [],
              conceptSuggestions: [],
              error: normalizedError,
              comparedCaptures: 0,
              elapsedMs: diagnostics.totalMs,
              diagnostics,
              retry,
            });
          }
        }
      }

      void runSuggestions();
    }, ASSOCIATION_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    currentNodeId,
    contextRepository,
    nodeRepository,
    relationRepository,
    selectedCaptureIdsKey,
    selectedContextIdsKey,
    text,
    retryToken,
    retry,
    workspaceId,
  ]);

  return state;
}

function reportSuggestionDiagnostics(diagnostics: SuggestionDiagnostics) {
  if (typeof window === "undefined") {
    return;
  }

  if (window.sessionStorage.getItem("vinema:association-diagnostics") !== "1") {
    return;
  }

  console.debug("[Vinema] association diagnostics", diagnostics);
}
