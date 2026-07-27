"use client";

import Link from "next/link";
import { SendHorizontal } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Device } from "@/domain/device/device";
import type { Node } from "@/domain/node/node";
import type { Workspace } from "@/domain/workspace/workspace";
import type {
  ConceptSuggestion,
  EmergingConceptSuggestion,
} from "@/features/associations/association-types";
import { CaptureRecoveryResults } from "@/features/associations/capture-recovery-results";
import { ConceptSuggestionChips } from "@/features/associations/concept-suggestion-chips";
import { useAssociationSuggestions } from "@/features/associations/use-association-suggestions";
import { getContentTimestamp } from "@/features/capture/capture-timestamps";
import {
  loadCaptureDraft,
  saveCaptureDraft,
} from "@/features/capture/capture-draft";
import { FOCUS_CAPTURE_EVENT } from "@/features/capture/capture-events";
import {
  CAPTURE_DRAFT_DEBOUNCE_MS,
  commitCaptureText,
} from "@/features/capture/capture-flow";
import { listKnowledgeCaptures } from "@/features/capture/list-knowledge-captures";
import {
  getCapturePreview,
} from "@/features/node/node-display";
import { getNodeDetailPath } from "@/features/node/node-routes";
import type { SearchNodesRepositories } from "@/features/recovery/search-nodes";
import type { StorageAdapter } from "@/infrastructure/storage/storage-adapter";

const RECENT_LIMIT = 8;
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
  const [recent, setRecent] = useState<Node[]>([]);
  const [recentError, setRecentError] = useState<string | null>(null);
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

  const refreshRecent = useCallback(async () => {
    setRecentError(null);

    try {
      setRecent(
        await listKnowledgeCaptures(repositories.nodeRepository, {
          workspaceId: workspace.id,
          limit: RECENT_LIMIT,
        }),
      );
    } catch {
      setRecentError("No se pudo cargar la Base de Conocimiento.");
    }
  }, [repositories.nodeRepository, workspace.id]);
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
    queueMicrotask(() => {
      void refreshRecent();
    });

    return () => {
      cancelled = true;
    };
  }, [refreshRecent, storage]);

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
          : "Captura guardada en la Base de Conocimiento.",
      );
      await refreshRecent();
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
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 py-4 sm:px-6 lg:px-10">
      <section className="space-y-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-normal text-zinc-950 sm:text-3xl">
            Empieza a escribir
          </h1>
        </div>

        <div className="space-y-4">
          <Textarea
            id="capture"
            ref={textareaRef}
            aria-label="Empieza a escribir"
            className="min-h-64 max-h-[52vh] resize-y border-zinc-200 bg-white/70 p-5 text-lg leading-8 shadow-none focus-visible:ring-zinc-400 sm:min-h-72"
            placeholder="Empieza a escribir..."
            value={content}
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

      {!hasContent ? (
        <section className="space-y-3">
          <h2 className="text-base font-medium text-zinc-950">
            Reciente
          </h2>
          {recentError ? (
            <p className="text-sm text-red-600">{recentError}</p>
          ) : null}
          {recent.length > 0 ? (
            <div className="space-y-2">
              {recent.map((node) => (
                <KnowledgeCaptureItem key={node.id} node={node} />
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-zinc-200 bg-white p-4 text-sm text-zinc-500">
              Todavia no hay capturas.
            </p>
          )}
        </section>
      ) : null}
    </main>
  );
}

function KnowledgeCaptureItem({ node }: { node: Node }) {
  return (
    <KnowledgeResult
      href={getNodeDetailPath(node.id, { returnTo: "/" })}
      preview={getCapturePreview(node.content, { maxLength: 140 })}
      updatedAt={getContentTimestamp(node)}
    />
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

function KnowledgeResult({
  href,
  preview,
  updatedAt,
}: {
  href: string;
  preview: string;
  updatedAt: string;
}) {
  return (
    <Link
      href={href}
      aria-label={`Abrir captura: ${getCapturePreview(preview, { maxLength: 80 })}`}
      className="block rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="line-clamp-2 text-sm leading-6 text-zinc-700">{preview}</p>
        </div>
        <time className="shrink-0 text-xs text-zinc-500">
          {formatCompactDate(updatedAt)}
        </time>
      </div>
    </Link>
  );
}

function formatCompactDate(value: string) {
  return new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
