"use client";

import Link from "next/link";
import { Brain, Check, History, Maximize2, SendHorizontal, X } from "lucide-react";
import type { CSSProperties, FocusEvent, ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
import {
  calculateDesktopPanelPlacement,
} from "@/features/capture/contextual-panel-positioning";
import type { CaptureEmergentIdentity } from "@/features/identity/capture-emergent-identity";
import { CaptureEmergentIdentityLabel } from "@/features/identity/capture-emergent-identity-view";
import { loadCaptureEmergentIdentities } from "@/features/identity/load-capture-emergent-identities";
import { getConceptExplorationPath } from "@/features/exploration/concept-routes";
import { useVisualFeedback } from "@/features/feedback/visual-feedback-provider";
import { isKnowledgeResetRunning } from "@/features/knowledge-reset/knowledge-reset";
import { getCapturePreview } from "@/features/node/node-display";
import { getNodeDetailPath } from "@/features/node/node-routes";
import type { SearchNodesRepositories } from "@/features/recovery/search-nodes";
import type { StorageAdapter } from "@/infrastructure/storage/storage-adapter";
import { cn } from "@/lib/cn";

const EMPTY_SELECTED_CAPTURE_IDS: string[] = [];
const INITIAL_MEMORY_RESULT_LIMIT = 3;
const DESKTOP_PANEL_BREAKPOINT = 768;
const EPHEMERAL_PANEL_CLOSE_DELAY_MS = 350;

type DraftStatus = "idle" | "saving" | "saved" | "error";
type ActivePanel = "concepts" | "memories" | null;
type PanelInteractionSource = "hover" | "focus" | "click" | "tap" | null;
type PanelPlacement = {
  layout: "mobile-sheet" | "desktop-popover";
  style?: CSSProperties;
};

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
  const feedback = useVisualFeedback();
  const [content, setContent] = useState("");
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftStatus, setDraftStatus] = useState<DraftStatus>("idle");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>([]);
  const [selectedEmergingConcepts, setSelectedEmergingConcepts] = useState<
    EmergingConceptSuggestion[]
  >([]);
  const [memoryIdentities, setMemoryIdentities] = useState<
    Map<string, CaptureEmergentIdentity>
  >(new Map());
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [interactionSource, setInteractionSource] =
    useState<PanelInteractionSource>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePromiseRef = useRef<Promise<unknown> | null>(null);
  const closePanelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captureInFlightRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const indicatorRowRef = useRef<HTMLDivElement | null>(null);
  const [panelPlacement, setPanelPlacement] = useState<PanelPlacement>({
    layout: "mobile-sheet",
  });
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
  const conceptExpansionContextId = getConceptExpansionContextId(
    conceptSuggestions,
    selectedContextIds,
  );
  const memoryExpansionContextId = getMemoryExpansionContextId(
    memorySuggestions,
    memoryIdentities,
  );
  const clearPanelCloseTimer = useCallback(() => {
    if (closePanelTimerRef.current) {
      clearTimeout(closePanelTimerRef.current);
      closePanelTimerRef.current = null;
    }
  }, []);
  const closePanels = useCallback(() => {
    clearPanelCloseTimer();
    setActivePanel(null);
    setInteractionSource(null);
    queueMicrotask(() => {
      textareaRef.current?.focus();
    });
  }, [clearPanelCloseTimer]);
  const closePanelsForWriting = useCallback(() => {
    clearPanelCloseTimer();
    setActivePanel(null);
    setInteractionSource(null);
  }, [clearPanelCloseTimer]);

  useEffect(() => {
    let cancelled = false;

    async function loadMemoryIdentities() {
      const identities = await loadCaptureEmergentIdentities(
        {
          contextRepository: repositories.contextRepository,
          nodeContextRelationRepository: repositories.nodeContextRelationRepository,
        },
        memorySuggestions.map((suggestion) => suggestion.node.id),
      );

      if (!cancelled) {
        setMemoryIdentities(identities);
      }
    }

    if (memorySuggestions.length === 0) {
      queueMicrotask(() => {
        if (!cancelled) {
          setMemoryIdentities(new Map());
        }
      });
      return;
    }

    void loadMemoryIdentities();

    return () => {
      cancelled = true;
    };
  }, [
    memorySuggestions,
    repositories.contextRepository,
    repositories.nodeContextRelationRepository,
  ]);

  useLayoutEffect(() => {
    if (!activePanel) {
      return;
    }

    function updatePanelPlacement() {
      const anchor = indicatorRowRef.current?.querySelector(
        `[data-context-indicator-panel="${activePanel}"]`,
      );

      if (!anchor || !canUseDesktopPopover()) {
        setPanelPlacement({ layout: "mobile-sheet" });
        return;
      }

      setPanelPlacement({
        layout: "desktop-popover",
        style: getDesktopPanelStyle(anchor.getBoundingClientRect()),
      });
    }

    updatePanelPlacement();
    window.addEventListener("resize", updatePanelPlacement);
    window.addEventListener("scroll", updatePanelPlacement, true);

    return () => {
      window.removeEventListener("resize", updatePanelPlacement);
      window.removeEventListener("scroll", updatePanelPlacement, true);
    };
  }, [activePanel, showIndicators]);

  useEffect(() => {
    return () => {
      clearPanelCloseTimer();
    };
  }, [clearPanelCloseTimer]);

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
  }, [activePanel, closePanels]);

  useEffect(() => {
    if (!activePanel) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!(event.target instanceof Element)) {
        return;
      }

      if (
        event.target.closest("[data-progressive-panel]") ||
        event.target.closest("[data-context-indicator]")
      ) {
        return;
      }

      closePanels();
    }

    window.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [activePanel, closePanels]);

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

  useEffect(() => {
    if (draftStatus === "saving") {
      feedback.saving();
    }

    if (draftStatus === "error") {
      feedback.error(draftError ?? "Error al guardar el borrador.");
    }
  }, [draftError, draftStatus, feedback]);

  async function handleCapture() {
    if (captureInFlightRef.current) {
      return;
    }

    if (isKnowledgeResetRunning()) {
      feedback.error("Espera a que termine el vaciado de conocimiento.");
      return;
    }

    if (!content.trim()) {
      feedback.error("Escribe algo antes de capturar.");
      return;
    }

    captureInFlightRef.current = true;
    setCapturing(true);
    closePanelsForWriting();

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
      setInteractionSource(null);
      setDraftStatus("idle");
      feedback.capture();
      if (result.relationError) {
        feedback.error("Algunas asociaciones no pudieron persistirse.");
      }
      queueMicrotask(() => {
        textareaRef.current?.focus();
      });
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "No se pudo guardar la captura.";
      feedback.error(message);
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

  function openPanel(
    panel: Exclude<ActivePanel, null>,
    source: Exclude<PanelInteractionSource, null>,
  ) {
    clearPanelCloseTimer();
    setActivePanel(panel);
    setInteractionSource(source);
  }

  function schedulePanelClose() {
    clearPanelCloseTimer();
    closePanelTimerRef.current = setTimeout(() => {
      closePanelTimerRef.current = null;

      if (isFocusWithinContextualPanel()) {
        return;
      }

      setActivePanel(null);
      setInteractionSource(null);
    }, EPHEMERAL_PANEL_CLOSE_DELAY_MS);
  }

  function closePanelAfterFocusLeaves(event: FocusEvent<HTMLElement>) {
    if (
      event.relatedTarget instanceof Element &&
      (event.relatedTarget.closest("[data-progressive-panel]") ||
        event.relatedTarget.closest("[data-context-indicator]"))
    ) {
      return;
    }

    schedulePanelClose();
  }

  function isFocusWithinContextualPanel() {
    const activeElement = document.activeElement;

    return (
      activeElement instanceof Element &&
      (activeElement.closest("[data-progressive-panel]") !== null ||
        activeElement.closest("[data-context-indicator]") !== null)
    );
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
            }}
          />
          {showIndicators ? (
            <div
              ref={indicatorRowRef}
              className="flex min-h-10 items-center gap-2 transition-opacity motion-reduce:transition-none"
              aria-label="Indicadores contextuales"
            >
              {showConceptIndicator ? (
                <ContextIndicator
                  panel="concepts"
                  icon="concepts"
                  count={conceptSuggestions.length}
                  active={activePanel === "concepts"}
                  label={`${conceptSuggestions.length} conceptos detectados`}
                  onHover={() => openPanel("concepts", "hover")}
                  onFocus={() => openPanel("concepts", "focus")}
                  onClick={() =>
                    openPanel(
                      "concepts",
                      canUseDesktopPopover() ? "click" : "tap",
                    )
                  }
                  onIntentEnd={schedulePanelClose}
                  onBlur={closePanelAfterFocusLeaves}
                />
              ) : null}
              {showMemoryIndicator ? (
                <ContextIndicator
                  panel="memories"
                  icon="memories"
                  count={memorySuggestions.length}
                  active={activePanel === "memories"}
                  label={
                    associationState.error
                      ? "No se pudo buscar recuerdos"
                      : `${memorySuggestions.length} recuerdos relacionados`
                  }
                  onHover={() => openPanel("memories", "hover")}
                  onFocus={() => openPanel("memories", "focus")}
                  onClick={() =>
                    openPanel(
                      "memories",
                      canUseDesktopPopover() ? "click" : "tap",
                    )
                  }
                  onIntentEnd={schedulePanelClose}
                  onBlur={closePanelAfterFocusLeaves}
                />
              ) : null}
            </div>
          ) : null}
          {activePanel === "concepts" ? (
            <ProgressivePanel
              title="Conceptos detectados"
              expandHref={
                conceptExpansionContextId
                  ? getConceptExplorationPath(conceptExpansionContextId, {
                      returnTo: "/",
                      from: "panel",
                    })
                  : null
              }
              interactionSource={interactionSource}
              placement={panelPlacement}
              onIntentStart={clearPanelCloseTimer}
              onIntentEnd={schedulePanelClose}
              onBlur={closePanelAfterFocusLeaves}
              onClose={closePanels}
              onExpand={persistCurrentDraft}
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
              expandHref={
                memoryExpansionContextId
                  ? getConceptExplorationPath(memoryExpansionContextId, {
                      returnTo: "/",
                      from: "panel",
                    })
                  : null
              }
              interactionSource={interactionSource}
              placement={panelPlacement}
              onIntentStart={clearPanelCloseTimer}
              onIntentEnd={schedulePanelClose}
              onBlur={closePanelAfterFocusLeaves}
              onClose={closePanels}
              onExpand={persistCurrentDraft}
            >
              <MemoryPanelContent
                suggestions={memorySuggestions}
                identities={memoryIdentities}
                loading={associationState.status === "loading"}
                error={associationState.error !== null}
                onRetry={associationState.retry}
                onOpenCapture={persistCurrentDraft}
              />
            </ProgressivePanel>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-h-5" aria-hidden="true" />
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
          <div className="min-h-5" aria-hidden="true" />
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

function getConceptExpansionContextId(
  suggestions: ConceptSuggestion[],
  selectedContextIds: string[],
) {
  const selectedSuggestion = suggestions.find(
    (suggestion) =>
      suggestion.kind === "existing" &&
      selectedContextIds.includes(suggestion.conceptId),
  );

  if (selectedSuggestion?.kind === "existing") {
    return selectedSuggestion.conceptId;
  }

  return suggestions.find((suggestion) => suggestion.kind === "existing")
    ?.conceptId ?? null;
}

function getMemoryExpansionContextId(
  suggestions: AssociationSuggestion[],
  identities: Map<string, CaptureEmergentIdentity>,
) {
  for (const suggestion of suggestions) {
    const concept = identities.get(suggestion.node.id)?.concepts[0];

    if (concept) {
      return concept.id;
    }
  }

  return null;
}

function ContextIndicator({
  panel,
  icon,
  count,
  active,
  label,
  onHover,
  onFocus,
  onClick,
  onIntentEnd,
  onBlur,
}: {
  panel: Exclude<ActivePanel, null>;
  icon: "concepts" | "memories";
  count: number;
  active: boolean;
  label: string;
  onHover: () => void;
  onFocus: () => void;
  onClick: () => void;
  onIntentEnd: () => void;
  onBlur: (event: FocusEvent<HTMLElement>) => void;
}) {
  const Icon = icon === "concepts" ? Brain : History;

  return (
    <button
      type="button"
      data-context-indicator=""
      data-context-indicator-panel={panel}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-1.5 rounded-full text-sm text-zinc-500 outline-none transition-colors hover:bg-zinc-100 hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400 motion-reduce:transition-none",
        active ? "w-9 min-w-9 px-0" : "min-w-12 px-3",
      )}
      onMouseEnter={onHover}
      onMouseLeave={onIntentEnd}
      onFocus={onFocus}
      onBlur={onBlur}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {active ? null : <span>{count}</span>}
    </button>
  );
}

function ProgressivePanel({
  title,
  expandHref,
  interactionSource,
  placement,
  onIntentStart,
  onIntentEnd,
  onBlur,
  onClose,
  onExpand,
  children,
}: {
  title: string;
  expandHref?: string | null;
  interactionSource: PanelInteractionSource;
  placement: PanelPlacement;
  onIntentStart: () => void;
  onIntentEnd: () => void;
  onBlur: (event: FocusEvent<HTMLElement>) => void;
  onClose: () => void;
  onExpand?: () => void | Promise<void>;
  children: ReactNode;
}) {
  const isMobileSheet = placement.layout === "mobile-sheet";

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-label={title}
      data-layout={placement.layout}
      data-progressive-panel=""
      data-interaction-source={interactionSource ?? undefined}
      style={placement.style}
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 max-h-[70vh] overflow-hidden rounded-2xl border border-zinc-200/70 bg-white/95 shadow-[0_12px_40px_rgba(24,24,27,0.10)] outline-none backdrop-blur-sm transition duration-150 ease-out motion-reduce:transition-none md:inset-auto md:max-h-[60vh] md:w-[22.5rem] md:border-zinc-200/50 md:shadow-[0_10px_32px_rgba(24,24,27,0.08)]"
      onMouseEnter={onIntentStart}
      onMouseLeave={onIntentEnd}
      onFocus={onIntentStart}
      onBlur={onBlur}
    >
      <div className="max-h-[calc(70vh-1.5rem)] overflow-y-auto px-4 py-4 md:max-h-[calc(60vh-1.5rem)]">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-zinc-800">{title}</h2>
          <div className="flex items-center gap-1">
            {expandHref ? (
              <Link
                href={expandHref}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 outline-none transition-colors hover:bg-zinc-100 hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400 motion-reduce:transition-none"
                aria-label="Profundizar en Base de conocimiento"
                title="Profundizar"
                onClick={() => {
                  void onExpand?.();
                }}
              >
                <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            ) : null}
            {isMobileSheet ? (
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 outline-none hover:bg-zinc-100 hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400 md:hidden"
                aria-label="Cerrar panel"
                onClick={onClose}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
        {children}
      </div>
    </aside>
  );
}

function canUseDesktopPopover() {
  if (window.innerWidth < DESKTOP_PANEL_BREAKPOINT) {
    return false;
  }

  if (typeof window.matchMedia !== "function") {
    return true;
  }

  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

function getDesktopPanelStyle(anchorRect: DOMRect): CSSProperties {
  const placement = calculateDesktopPanelPlacement({
    anchorRect,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  });

  return {
    left: placement.left,
    maxHeight: placement.maxHeight,
    top: placement.top,
    width: placement.width,
  };
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
          <div
            key={`${suggestion.kind}-${id}`}
            className={cn(
              "flex items-center gap-2 rounded-md transition-colors motion-reduce:transition-none",
              selected ? "bg-zinc-950 text-white" : "text-zinc-700 hover:bg-zinc-50",
            )}
          >
            <button
              type="button"
              aria-pressed={selected}
              className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
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
            {suggestion.kind === "existing" ? (
              <Link
                href={getConceptExplorationPath(suggestion.conceptId)}
                className={cn(
                  "mr-1 rounded-sm px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-zinc-400",
                  selected
                    ? "text-zinc-200 hover:text-white"
                    : "text-zinc-500 hover:text-zinc-950",
                )}
              >
                Abrir
              </Link>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function MemoryPanelContent({
  suggestions,
  identities,
  loading,
  error,
  onRetry,
  onOpenCapture,
}: {
  suggestions: AssociationSuggestion[];
  identities: Map<string, CaptureEmergentIdentity>;
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
          identity={identities.get(suggestion.node.id) ?? null}
          onOpenCapture={onOpenCapture}
        />
      ))}
      {suggestions.length > INITIAL_MEMORY_RESULT_LIMIT ? (
        <Link
          href="/notes"
          className="inline-flex h-8 items-center rounded-md px-1 text-xs text-zinc-500 outline-none hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
        >
          Ver historial
        </Link>
      ) : null}
    </div>
  );
}

function MemoryResult({
  node,
  identity,
  onOpenCapture,
}: {
  node: Node;
  identity: CaptureEmergentIdentity | null;
  onOpenCapture: () => void | Promise<void>;
}) {
  const preview = getCapturePreview(node.content, { maxLength: 600 });

  return (
    <article className="min-w-0 rounded-md px-3 py-2 text-sm leading-6 text-zinc-700 hover:bg-zinc-50">
      {identity?.displayText ? (
        <CaptureEmergentIdentityLabel
          identity={identity}
          className="truncate text-sm leading-6"
          getConceptHref={getConceptExplorationPath}
        />
      ) : null}
      <Link
        href={getNodeDetailPath(node.id, { returnTo: "/" })}
        aria-label={`Abrir captura: ${preview}`}
        title={preview}
        className="block min-w-0 rounded-sm outline-none hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
        onClick={() => {
          void onOpenCapture();
        }}
      >
        <span className="block min-w-0 truncate">{preview}</span>
      </Link>
      <time className="mt-1 block text-xs text-zinc-400">
        {formatCompactDate(getContentTimestamp(node))}
      </time>
    </article>
  );
}

function formatCompactDate(value: string) {
  return new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
