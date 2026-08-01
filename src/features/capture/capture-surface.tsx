"use client";

import Link from "next/link";
import { Brain, Check, History, SendHorizontal, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Node } from "@/domain/node/node";
import type { Device } from "@/domain/device/device";
import type { Workspace } from "@/domain/workspace/workspace";
import type {
  AssociationSuggestion,
  ConceptSuggestion,
  EmergingConceptSuggestion,
} from "@/features/associations/association-types";
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
import { getCapturePreview } from "@/features/node/node-display";
import { getNodeDetailPath } from "@/features/node/node-routes";
import type { SearchNodesRepositories } from "@/features/recovery/search-nodes";
import type { StorageAdapter } from "@/infrastructure/storage/storage-adapter";
import { cn } from "@/lib/cn";

const EMPTY_SELECTED_CAPTURE_IDS: string[] = [];
const INITIAL_MEMORY_RESULT_LIMIT = 3;

type DraftStatus = "idle" | "saving" | "saved" | "error";
type ActivePanel = "concepts" | "memories" | null;

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
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [pinnedPanel, setPinnedPanel] = useState<ActivePanel>(null);
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
  const conceptSuggestions = mergeSelectedConceptSuggestions(
    associationState.conceptSuggestions,
    selectedEmergingConcepts,
  );
  const memorySuggestions = associationState.suggestions;
  const showConceptIndicator = hasContent && conceptSuggestions.length > 0;
  const showMemoryIndicator =
    hasContent &&
    (memorySuggestions.length > 0 ||
      associationState.status === "loading" ||
      associationState.error !== null);
  const showIndicators = showConceptIndicator || showMemoryIndicator;

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || !activePanel) {
        return;
      }

      event.preventDefault();
      closePanels();
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [activePanel]);

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
      setActivePanel(null);
      setPinnedPanel(null);
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

  function openPanelPreview(panel: Exclude<ActivePanel, null>) {
    if (pinnedPanel) {
      return;
    }

    setActivePanel(panel);
  }

  function pinPanel(panel: Exclude<ActivePanel, null>) {
    setActivePanel(panel);
    setPinnedPanel((current) => (current === panel ? null : panel));
  }

  function closePanels() {
    setActivePanel(null);
    setPinnedPanel(null);
    queueMicrotask(() => {
      textareaRef.current?.focus();
    });
  }

  function closePanelsForWriting() {
    setActivePanel(null);
    setPinnedPanel(null);
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
        <div className="relative space-y-5">
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

              closePanelsForWriting();
              setContent(nextContent);
              setDraftStatus(nextContent.trim() ? "saving" : "idle");
              setDraftError(null);
              setCaptureError(null);
              setCaptureFeedback(null);
            }}
          />
          {showIndicators ? (
            <div
              className="flex min-h-10 items-center gap-2 transition-opacity motion-reduce:transition-none"
              aria-label="Indicadores contextuales"
            >
              {showConceptIndicator ? (
                <ContextIndicator
                  icon="concepts"
                  count={conceptSuggestions.length}
                  active={activePanel === "concepts"}
                  label={`${conceptSuggestions.length} conceptos detectados`}
                  onPreview={() => openPanelPreview("concepts")}
                  onPin={() => pinPanel("concepts")}
                />
              ) : null}
              {showMemoryIndicator ? (
                <ContextIndicator
                  icon="memories"
                  count={memorySuggestions.length}
                  active={activePanel === "memories"}
                  label={
                    associationState.error
                      ? "No se pudo buscar recuerdos"
                      : `${memorySuggestions.length} recuerdos relacionados`
                  }
                  onPreview={() => openPanelPreview("memories")}
                  onPin={() => pinPanel("memories")}
                />
              ) : null}
            </div>
          ) : null}
          {activePanel === "concepts" ? (
            <ProgressivePanel
              title="Conceptos detectados"
              pinned={pinnedPanel === "concepts"}
              onClose={closePanels}
            >
              <ConceptPanelContent
                suggestions={conceptSuggestions}
                selectedContextIds={selectedContextIds}
                selectedEmergingCandidateIds={selectedEmergingConcepts.map(
                  (concept) => concept.candidateId,
                )}
                onToggleExisting={toggleConcept}
                onToggleEmerging={toggleEmergingConcept}
              />
            </ProgressivePanel>
          ) : null}
          {activePanel === "memories" ? (
            <ProgressivePanel
              title="Me recuerda a…"
              pinned={pinnedPanel === "memories"}
              onClose={closePanels}
            >
              <MemoryPanelContent
                suggestions={memorySuggestions}
                loading={associationState.status === "loading"}
                error={associationState.error !== null}
                onRetry={associationState.retry}
                onOpenCapture={persistCurrentDraft}
              />
            </ProgressivePanel>
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
                className="h-10 w-10 self-start rounded-full border border-zinc-200 bg-white/40 p-0 text-zinc-700 hover:bg-white hover:text-zinc-950 sm:self-auto"
                aria-label="Capturar"
                title="Capturar con Ctrl/Cmd + Enter"
              >
                <SendHorizontal className="h-4 w-4" />
                <span className="sr-only">
                  {capturing ? "Capturando" : "Capturar"}
                </span>
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

function ContextIndicator({
  icon,
  count,
  active,
  label,
  onPreview,
  onPin,
}: {
  icon: "concepts" | "memories";
  count: number;
  active: boolean;
  label: string;
  onPreview: () => void;
  onPin: () => void;
}) {
  const Icon = icon === "concepts" ? Brain : History;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="inline-flex h-9 min-w-12 items-center justify-center gap-1.5 rounded-full px-3 text-sm text-zinc-500 outline-none transition-colors hover:bg-zinc-100 hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400 motion-reduce:transition-none"
      onMouseEnter={onPreview}
      onFocus={onPreview}
      onClick={onPin}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {active ? null : <span>{count}</span>}
    </button>
  );
}

function ProgressivePanel({
  title,
  pinned,
  onClose,
  children,
}: {
  title: string;
  pinned: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-label={title}
      className="fixed inset-x-3 bottom-3 z-40 max-h-[70vh] overflow-hidden rounded-xl border border-zinc-200 bg-white/95 shadow-lg outline-none backdrop-blur transition duration-150 motion-reduce:transition-none sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-[calc(100%+0.75rem)] sm:w-[min(34rem,calc(100vw-3rem))]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3">
        <h2 className="text-sm font-medium text-zinc-900">{title}</h2>
        <div className="flex items-center gap-2">
          {pinned ? (
            <span className="text-xs text-zinc-400">fijado</span>
          ) : null}
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 outline-none hover:bg-zinc-100 hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
            aria-label="Cerrar panel"
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="max-h-[calc(70vh-3.5rem)] overflow-y-auto px-4 py-3">
        {children}
      </div>
    </aside>
  );
}

function ConceptPanelContent({
  suggestions,
  selectedContextIds,
  selectedEmergingCandidateIds,
  onToggleExisting,
  onToggleEmerging,
}: {
  suggestions: ConceptSuggestion[];
  selectedContextIds: string[];
  selectedEmergingCandidateIds: string[];
  onToggleExisting: (contextId: string) => void;
  onToggleEmerging: (candidateId: string) => void;
}) {
  if (suggestions.length === 0) {
    return <p className="text-sm text-zinc-500">No hay conceptos detectados.</p>;
  }

  return (
    <div className="space-y-2">
      {suggestions.slice(0, 5).map((suggestion) => {
        const selected =
          suggestion.kind === "existing"
            ? selectedContextIds.includes(suggestion.conceptId)
            : selectedEmergingCandidateIds.includes(suggestion.candidateId);
        const label =
          suggestion.kind === "existing"
            ? suggestion.label
            : suggestion.suggestedLabel;
        const id =
          suggestion.kind === "existing"
            ? suggestion.conceptId
            : suggestion.candidateId;

        return (
          <button
            key={`${suggestion.kind}-${id}`}
            type="button"
            aria-pressed={selected}
            className={cn(
              "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-400 motion-reduce:transition-none",
              selected ? "bg-zinc-950 text-white hover:bg-zinc-900" : "text-zinc-700",
            )}
            onClick={() =>
              suggestion.kind === "existing"
                ? onToggleExisting(suggestion.conceptId)
                : onToggleEmerging(suggestion.candidateId)
            }
          >
            <span className="min-w-0 truncate">{label}</span>
            {selected ? (
              <Check className="h-4 w-4 shrink-0 text-zinc-200" aria-hidden="true" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function MemoryPanelContent({
  suggestions,
  loading,
  error,
  onRetry,
  onOpenCapture,
}: {
  suggestions: AssociationSuggestion[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onOpenCapture: () => void | Promise<void>;
}) {
  const visibleSuggestions = suggestions.slice(0, INITIAL_MEMORY_RESULT_LIMIT);

  if (loading && suggestions.length === 0) {
    return <p className="text-sm text-zinc-500">Recordando...</p>;
  }

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-zinc-500">No pude buscar asociaciones.</p>
        <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
          Reintentar
        </Button>
      </div>
    );
  }

  if (visibleSuggestions.length === 0) {
    return <p className="text-sm text-zinc-500">No hay recuerdos relacionados.</p>;
  }

  return (
    <div className="space-y-1">
      {visibleSuggestions.map((suggestion) => (
        <MemoryResult
          key={suggestion.node.id}
          node={suggestion.node}
          onOpenCapture={onOpenCapture}
        />
      ))}
      {suggestions.length > INITIAL_MEMORY_RESULT_LIMIT ? (
        <Link
          href="/notes"
          className="inline-flex h-8 items-center rounded-md px-1 text-xs text-zinc-500 outline-none hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
        >
          Ver en Explorar
        </Link>
      ) : null}
    </div>
  );
}

function MemoryResult({
  node,
  onOpenCapture,
}: {
  node: Node;
  onOpenCapture: () => void | Promise<void>;
}) {
  const preview = getCapturePreview(node.content, { maxLength: 600 });

  return (
    <Link
      href={getNodeDetailPath(node.id, { returnTo: "/" })}
      aria-label={`Abrir captura: ${preview}`}
      title={preview}
      className="block min-w-0 rounded-md px-3 py-2 text-sm leading-6 text-zinc-700 outline-none hover:bg-zinc-50 hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
      onClick={() => {
        void onOpenCapture();
      }}
    >
      <span className="block min-w-0 truncate">{preview}</span>
      <time className="mt-1 block text-xs text-zinc-400">
        {formatCompactDate(getContentTimestamp(node))}
      </time>
    </Link>
  );
}

function formatCompactDate(value: string) {
  return new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
