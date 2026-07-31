"use client";

import { SendHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Device } from "@/domain/device/device";
import type { Workspace } from "@/domain/workspace/workspace";
import type {
  ConceptSuggestion,
  EmergingConceptSuggestion,
} from "@/features/associations/association-types";
import { CaptureRecoveryResults } from "@/features/associations/capture-recovery-results";
import { ConceptSuggestionChips } from "@/features/associations/concept-suggestion-chips";
import { useAssociationSuggestions } from "@/features/associations/use-association-suggestions";
import {
  loadCaptureDraft,
  saveCaptureDraft,
} from "@/features/capture/capture-draft";
import { FOCUS_CAPTURE_EVENT } from "@/features/capture/capture-events";
import {
  CAPTURE_DRAFT_DEBOUNCE_MS,
  commitCaptureText,
} from "@/features/capture/capture-flow";
import type { SearchNodesRepositories } from "@/features/recovery/search-nodes";
import type { StorageAdapter } from "@/infrastructure/storage/storage-adapter";

const EMPTY_SELECTED_CAPTURE_IDS: string[] = [];

type DraftStatus = "idle" | "saving" | "saved" | "error";

export type CaptureSurfaceProps = {
  device: Device;
  workspace: Workspace;
  storage: StorageAdapter;
  repositories: SearchNodesRepositories;
};

export function CaptureSurface({
  device,
  workspace,
  storage,
  repositories,
}: CaptureSurfaceProps) {
  const [content, setContent] = useState("");
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftStatus, setDraftStatus] = useState<DraftStatus>("idle");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [captureFeedback, setCaptureFeedback] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>([]);
  const [selectedEmergingConcepts, setSelectedEmergingConcepts] = useState<
    EmergingConceptSuggestion[]
  >([]);
  const [conceptsExpanded, setConceptsExpanded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePromiseRef = useRef<Promise<unknown> | null>(null);
  const captureInFlightRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const hasContent = content.trim().length > 0;

  const associationState = useAssociationSuggestions({
    text: content,
    workspaceId: workspace.id,
    selectedCaptureIds: EMPTY_SELECTED_CAPTURE_IDS,
    selectedContextIds,
    contextRepository: repositories.contextRepository,
    nodeRepository: repositories.nodeRepository,
    relationRepository: repositories.nodeContextRelationRepository,
  });

  useEffect(() => {
    let cancelled = false;

    async function restoreDraft() {
      try {
        const draft = await loadCaptureDraft(storage);

        if (!cancelled && draft) {
          setContent(draft.content);
          setSelectedContextIds(draft.selectedContextIds);
          setSelectedEmergingConcepts(draft.selectedEmergingConcepts);
          setDraftStatus("saved");
        }
      } catch {
        if (!cancelled) {
          setDraftStatus("error");
          setDraftError("Error al cargar el borrador.");
        }
      } finally {
        if (!cancelled) {
          setDraftLoaded(true);
        }
      }
    }

    void restoreDraft();

    return () => {
      cancelled = true;
    };
  }, [storage]);

  useEffect(() => {
    function focusEditor() {
      queueMicrotask(() => {
        textareaRef.current?.focus();
      });
    }

    focusEditor();

    window.addEventListener(FOCUS_CAPTURE_EVENT, focusEditor);

    return () => {
      window.removeEventListener(FOCUS_CAPTURE_EVENT, focusEditor);
    };
  }, []);

  useEffect(() => {
    if (!draftLoaded) {
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    if (!content.trim()) {
      saveTimerRef.current = setTimeout(() => {
        const savePromise = saveCaptureDraft(storage, content)
          .then(() => {
            setDraftStatus("idle");
            setDraftError(null);
          })
          .catch(() => {
            setDraftStatus("error");
            setDraftError("Error al guardar el borrador.");
          });
        savePromiseRef.current = savePromise;
      }, CAPTURE_DRAFT_DEBOUNCE_MS);
      return;
    }

    saveTimerRef.current = setTimeout(() => {
      const savePromise = saveCaptureDraft(
        storage,
        content,
        selectedContextIds,
        selectedEmergingConcepts,
      )
        .then(() => {
          setDraftStatus("saved");
          setDraftError(null);
        })
        .catch(() => {
          setDraftStatus("error");
          setDraftError("Error al guardar el borrador.");
        });
      savePromiseRef.current = savePromise;
    }, CAPTURE_DRAFT_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [content, draftLoaded, selectedContextIds, selectedEmergingConcepts, storage]);

  async function handleCapture() {
    if (captureInFlightRef.current) {
      return;
    }

    if (!content.trim()) {
      setCaptureError("Escribe algo antes de capturar.");
      setCaptureFeedback(null);
      return;
    }

    captureInFlightRef.current = true;
    setCapturing(true);
    setCaptureError(null);
    setCaptureFeedback(null);

    try {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      await savePromiseRef.current;

      const result = await commitCaptureText({
        content,
        workspace,
        device,
        repository: repositories.nodeRepository,
        contextRepository: repositories.contextRepository,
        relationRepository: repositories.nodeContextRelationRepository,
        storage,
        selectedContextIds,
        selectedEmergingConcepts,
      });
      setContent("");
      setSelectedContextIds([]);
      setSelectedEmergingConcepts([]);
      setConceptsExpanded(false);
      setDraftStatus("idle");
      setCaptureFeedback(
        result.relationError
          ? "Captura guardada. Algunas asociaciones no pudieron persistirse."
          : "Captura guardada.",
      );
      queueMicrotask(() => {
        textareaRef.current?.focus();
      });
    } catch (error) {
      setCaptureError(
        error instanceof Error
          ? error.message
          : "No se pudo guardar la captura.",
      );
    } finally {
      captureInFlightRef.current = false;
      setCapturing(false);
    }
  }

  function toggleConcept(contextId: string) {
    setSelectedContextIds((current) =>
      current.includes(contextId)
        ? current.filter((selectedId) => selectedId !== contextId)
        : [...current, contextId],
    );
  }

  function toggleEmergingConcept(candidateId: string) {
    setSelectedEmergingConcepts((current) => {
      if (current.some((concept) => concept.candidateId === candidateId)) {
        return current.filter((concept) => concept.candidateId !== candidateId);
      }

      const suggestion = associationState.conceptSuggestions.find(
        (concept): concept is EmergingConceptSuggestion =>
          concept.kind === "emerging" && concept.candidateId === candidateId,
      );

      return suggestion ? [...current, suggestion] : current;
    });
  }

  async function persistCurrentDraft() {
    if (!content.trim()) {
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    await saveCaptureDraft(
      storage,
      content,
      selectedContextIds,
      selectedEmergingConcepts,
    );
    setDraftStatus("saved");
    setDraftError(null);
  }

  return (
    <main className="flex w-full flex-1 px-4 py-6 sm:px-6 lg:px-10">
      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-start pt-[10vh] sm:pt-[14vh]">
        <h1 className="sr-only">Empieza a escribir</h1>
        <div className="space-y-5">
          <Textarea
            id="capture"
            ref={textareaRef}
            aria-label="Empieza a escribir"
            className="min-h-[42vh] resize-none border-0 bg-transparent px-0 py-0 text-[1.55rem] font-normal leading-[1.75] text-zinc-950 shadow-none outline-none ring-0 placeholder:text-zinc-300 focus-visible:ring-0 focus-visible:ring-offset-0 focus:placeholder:text-transparent sm:min-h-[46vh] sm:text-[1.8rem]"
            placeholder="Escribe..."
            value={content}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                (event.ctrlKey === true || event.metaKey === true)
              ) {
                event.preventDefault();
                void handleCapture();
              }
            }}
            onChange={(event) => {
              const nextContent = event.target.value;

              setContent(nextContent);
              setDraftStatus(nextContent.trim() ? "saving" : "idle");
              setDraftError(null);
              setCaptureError(null);
              setCaptureFeedback(null);
            }}
          />
          {hasContent ? (
            <CaptureRecoveryResults
              suggestions={associationState.suggestions}
              loading={associationState.status === "loading"}
              error={associationState.error}
              onRetry={associationState.retry}
              onOpenCapture={persistCurrentDraft}
            />
          ) : null}
          {hasContent ? (
            <ConceptSuggestionChips
              suggestions={mergeSelectedConceptSuggestions(
                associationState.conceptSuggestions,
                selectedEmergingConcepts,
              )}
              selectedContextIds={selectedContextIds}
              selectedEmergingCandidateIds={selectedEmergingConcepts.map(
                (concept) => concept.candidateId,
              )}
              expanded={conceptsExpanded}
              onExpandedChange={setConceptsExpanded}
              onToggleExisting={toggleConcept}
              onToggleEmerging={toggleEmergingConcept}
            />
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-h-5 text-sm text-zinc-500" aria-live="polite">
              {draftStatus === "saving" ? "Guardando borrador" : null}
              {draftStatus === "saved" ? "Borrador guardado" : null}
              {draftStatus === "error" ? "Error al guardar" : null}
              {draftError ? `: ${draftError}` : null}
            </div>
            {hasContent ? (
              <Button
                type="button"
                onClick={() => void handleCapture()}
                disabled={capturing}
                variant="ghost"
                className="self-start border border-zinc-200 bg-white/40 text-zinc-700 hover:bg-white hover:text-zinc-950 sm:self-auto"
              >
                <SendHorizontal className="h-4 w-4" />
                {capturing ? "Capturando" : "Capturar"}
              </Button>
            ) : null}
          </div>
          <div className="min-h-5 text-sm" aria-live="polite">
            {captureError ? (
              <p className="text-red-600">{captureError}</p>
            ) : null}
            {captureFeedback ? (
              <p className="text-zinc-600">{captureFeedback}</p>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}

function mergeSelectedConceptSuggestions(
  suggestions: ConceptSuggestion[],
  selectedEmergingConcepts: EmergingConceptSuggestion[],
) {
  const merged = new Map<string, ConceptSuggestion>();

  for (const suggestion of suggestions) {
    const key =
      suggestion.kind === "existing"
        ? `existing:${suggestion.conceptId}`
        : `emerging:${suggestion.candidateId}`;
    merged.set(key, suggestion);
  }

  for (const suggestion of selectedEmergingConcepts) {
    merged.set(`emerging:${suggestion.candidateId}`, suggestion);
  }

  return Array.from(merged.values());
}
