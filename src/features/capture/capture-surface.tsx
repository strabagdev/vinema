"use client";

import Link from "next/link";
import { Brain, Check, Lightbulb, SendHorizontal, X } from "lucide-react";
import type { FocusEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Node } from "@/domain/node/node";
import type { Context } from "@/domain/context/context";
import type { Device } from "@/domain/device/device";
import type { Workspace } from "@/domain/workspace/workspace";
import type {
  AssociationSuggestion,
  ConceptSuggestion,
  EmergingConceptSuggestion,
  ExistingConceptSuggestion,
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
  createSelectionEmergingConcept,
  readValidTextareaSelection,
  resolveCapturedSelectionConcept,
  type CapturedTextSelection,
  type CaptureSelectionResolution,
} from "@/features/capture/capture-selection";
import { CaptureSelectionAction } from "@/features/capture/capture-selection-action";
import type { KnowledgeSuggestionKind } from "@/features/cognition/knowledge-suggestions";
import type { CaptureEmergentIdentity } from "@/features/identity/capture-emergent-identity";
import { CaptureEmergentIdentityLabel } from "@/features/identity/capture-emergent-identity-view";
import { loadCaptureEmergentIdentities } from "@/features/identity/load-capture-emergent-identities";
import { getConceptKnowledgeExplorerPath } from "@/features/exploration/concept-routes";
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
const CONCEPT_HIGHLIGHT_MS = 1200;

type DraftStatus = "idle" | "saving" | "saved" | "error";
type ActivePanel = "concepts" | "memories" | null;
type PanelInteractionSource = "hover" | "focus" | "click" | "tap" | null;
type PanelPlacement = {
  layout: "mobile-sheet" | "desktop-popover";
};

export type CaptureSurfaceProps = {
  device: Device;
  workspace: Workspace;
  storage: StorageAdapter;
  repositories: SearchNodesRepositories;
  onCaptureCommitted?: () => void | Promise<void>;
};

export function CaptureSurface({
  device,
  workspace,
  storage,
  repositories,
  onCaptureCommitted,
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
  const [selectedExistingConceptSuggestions, setSelectedExistingConceptSuggestions] =
    useState<ExistingConceptSuggestion[]>([]);
  const [highlightedConceptKeys, setHighlightedConceptKeys] = useState<Set<string>>(
    new Set(),
  );
  const [memoryIdentities, setMemoryIdentities] = useState<
    Map<string, CaptureEmergentIdentity>
  >(new Map());
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [capturedSelection, setCapturedSelection] =
    useState<CapturedTextSelection | null>(null);
  const [selectionResolution, setSelectionResolution] =
    useState<CaptureSelectionResolution | null>(null);
  const [selectionProcessing, setSelectionProcessing] = useState(false);
  const [interactionSource, setInteractionSource] =
    useState<PanelInteractionSource>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePromiseRef = useRef<Promise<unknown> | null>(null);
  const closePanelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const captureInFlightRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
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
    selectedExistingConceptSuggestions,
  );
  const memorySuggestions = associationState.suggestions;
  const showConceptIndicator = hasContent && conceptSuggestions.length > 0;
  const showMemoryIndicator = hasContent && memorySuggestions.length > 0;
  const showIndicators = showConceptIndicator || showMemoryIndicator;
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

  useEffect(() => {
    if (!activePanel) {
      return;
    }

    function updatePanelPlacement() {
      setPanelPlacement({
        layout: canUseDesktopPopover() ? "desktop-popover" : "mobile-sheet",
      });
    }

    updatePanelPlacement();
    window.addEventListener("resize", updatePanelPlacement);

    return () => {
      window.removeEventListener("resize", updatePanelPlacement);
    };
  }, [activePanel, showIndicators]);

  useEffect(() => {
    const highlightTimers = highlightTimersRef.current;

    return () => {
      clearPanelCloseTimer();
      for (const timer of highlightTimers.values()) {
        clearTimeout(timer);
      }
      highlightTimers.clear();
    };
  }, [clearPanelCloseTimer]);

  useEffect(() => {
    if (
      (activePanel === "concepts" && !showConceptIndicator) ||
      (activePanel === "memories" && !showMemoryIndicator)
    ) {
      clearPanelCloseTimer();
      queueMicrotask(() => {
        setActivePanel(null);
        setInteractionSource(null);
      });
    }
  }, [activePanel, clearPanelCloseTimer, showConceptIndicator, showMemoryIndicator]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      if (capturedSelection) {
        event.preventDefault();
        clearCapturedSelection();
        return;
      }

      if (activePanel) {
        event.preventDefault();
        closePanels();
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [activePanel, capturedSelection, closePanels]);

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
      setSelectedExistingConceptSuggestions([]);
      setHighlightedConceptKeys(new Set());
      clearCapturedSelection();
      setActivePanel(null);
      setInteractionSource(null);
      setDraftStatus("idle");
      feedback.capture();
      void onCaptureCommitted?.();
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

  function addSelectedExistingConceptSuggestion(
    context: Context,
    matchedAlias?: string,
  ) {
    const suggestion = createSelectedExistingConceptSuggestion(context, matchedAlias);

    setSelectedExistingConceptSuggestions((current) => {
      if (current.some((item) => item.conceptId === suggestion.conceptId)) {
        return current;
      }

      return [...current, suggestion];
    });
  }

  function highlightConcept(key: string) {
    const existingTimer = highlightTimersRef.current.get(key);

    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    setHighlightedConceptKeys((current) => new Set(current).add(key));

    const timer = setTimeout(() => {
      highlightTimersRef.current.delete(key);
      setHighlightedConceptKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }, CONCEPT_HIGHLIGHT_MS);

    highlightTimersRef.current.set(key, timer);
  }

  function updateCapturedSelection() {
    setCapturedSelection(readValidTextareaSelection(textareaRef.current));
    setSelectionResolution(null);
  }

  function clearCapturedSelection() {
    setCapturedSelection(null);
    setSelectionResolution(null);
  }

  async function captureSelectedText() {
    const selection = capturedSelection ?? readValidTextareaSelection(textareaRef.current);

    if (!selection || selectionProcessing) {
      clearCapturedSelection();
      return;
    }

    setCapturedSelection(selection);
    setSelectionProcessing(true);
    feedback.saving();

    try {
      const contexts = await repositories.contextRepository.list({
        workspaceId: workspace.id,
        includeArchived: false,
      });
      const resolution = resolveCapturedSelectionConcept(selection, contexts);

      if (resolution.status === "EXACT" || resolution.status === "ALIAS") {
        const alreadyAssociated = selectedContextIds.includes(resolution.conceptId);
        const context = contexts.find((item) => item.id === resolution.conceptId);

        if (context) {
          addSelectedExistingConceptSuggestion(
            context,
            resolution.status === "ALIAS" ? resolution.matchedAlias : undefined,
          );
        }

        setSelectedContextIds((current) =>
          current.includes(resolution.conceptId)
            ? current
            : [...current, resolution.conceptId],
        );
        highlightConcept(`existing:${resolution.conceptId}`);
        clearCapturedSelection();
        showSelectionFeedback(
          feedback,
          alreadyAssociated ? "Ya estaba asociado" : "Concepto asociado",
        );
        queueMicrotask(() => textareaRef.current?.focus());
        return;
      }

      setSelectionResolution(resolution);
    } catch {
      feedback.error("No se pudo capturar la seleccion.");
      clearCapturedSelection();
    } finally {
      setSelectionProcessing(false);
    }
  }

  function confirmNewSelectionConcept(selection = capturedSelection) {
    if (!selection) {
      return;
    }

    const emergingConcept = createSelectionEmergingConcept(selection);
    const alreadySelected = selectedEmergingConcepts.some(
      (concept) => concept.candidateId === emergingConcept.candidateId,
    );
    setSelectedEmergingConcepts((current) =>
      current.some((concept) => concept.candidateId === emergingConcept.candidateId)
        ? current
        : [...current, emergingConcept],
    );
    highlightConcept(`emerging:${emergingConcept.candidateId}`);
    clearCapturedSelection();
    showSelectionFeedback(
      feedback,
      alreadySelected ? "Ya estaba asociado" : "Concepto incorporado",
    );
    queueMicrotask(() => textareaRef.current?.focus());
  }

  function chooseAmbiguousSelectionConcept(contextId: string) {
    const alreadyAssociated = selectedContextIds.includes(contextId);
    const context = selectionResolution?.status === "AMBIGUOUS"
      ? selectionResolution.candidates.find((item) => item.id === contextId)
      : null;

    if (context) {
      addSelectedExistingConceptSuggestion(context);
    }

    setSelectedContextIds((current) =>
      current.includes(contextId) ? current : [...current, contextId],
    );
    highlightConcept(`existing:${contextId}`);
    clearCapturedSelection();
    showSelectionFeedback(
      feedback,
      alreadyAssociated ? "Ya estaba asociado" : "Concepto asociado",
    );
    queueMicrotask(() => textareaRef.current?.focus());
  }

  function openPanel(
    panel: Exclude<ActivePanel, null>,
    source: Exclude<PanelInteractionSource, null>,
  ) {
    clearPanelCloseTimer();
    setPanelPlacement({
      layout: canUseDesktopPopover() ? "desktop-popover" : "mobile-sheet",
    });
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
    <main
      className="flex h-full min-h-0 w-full flex-1 overflow-hidden px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 md:px-6 md:pb-[max(1rem,env(safe-area-inset-bottom))] md:pt-4 lg:px-10"
      data-capture-canvas=""
    >
      <section className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-1 flex-col justify-end md:justify-start md:pt-[clamp(1.5rem,7vh,5rem)]">
        <h1 className="sr-only">Capturar</h1>
        <div
          className="relative flex min-h-0 w-full flex-col gap-3 rounded-[1.35rem] border border-zinc-200/80 bg-white/90 p-3 shadow-[0_12px_40px_rgba(24,24,27,0.10)] backdrop-blur-md md:flex-1 md:gap-5 md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-0"
          data-mobile-capture-composer=""
        >
          <Textarea
            id="capture"
            ref={textareaRef}
            aria-label="Capturar"
            className="vinema-scrollbar min-h-[5.5rem] max-h-[min(34dvh,12rem)] flex-none resize-none overflow-y-auto scroll-smooth border-0 bg-transparent px-1 py-1 text-[1.08rem] font-normal leading-[1.55] text-zinc-950 shadow-none outline-none ring-0 placeholder:text-zinc-400 focus-visible:ring-0 focus-visible:ring-offset-0 md:min-h-0 md:max-h-none md:flex-1 md:px-0 md:py-0 md:text-[1.42rem] md:leading-[1.75] md:placeholder:text-zinc-300 md:focus:placeholder:text-transparent sm:md:text-[1.65rem]"
            placeholder="Escribe algo..."
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
            onMouseUp={updateCapturedSelection}
            onKeyUp={updateCapturedSelection}
            onSelect={updateCapturedSelection}
            onChange={(event) => {
              const nextContent = event.target.value;

              closePanelsForWriting();
              clearCapturedSelection();
              setContent(nextContent);
              setDraftStatus(nextContent.trim() ? "saving" : "idle");
              setDraftError(null);
            }}
          />
          <CaptureSelectionAction
            selection={capturedSelection}
            resolution={selectionResolution}
            processing={selectionProcessing}
            touch={!canUseDesktopPopover()}
            onCapture={() => void captureSelectedText()}
            onConfirmNew={() => confirmNewSelectionConcept()}
            onChoose={chooseAmbiguousSelectionConcept}
            onCancel={clearCapturedSelection}
          />
          <div
            className="flex min-h-10 w-full shrink-0 items-center justify-between gap-3 overflow-visible md:gap-4"
            data-capture-action-row=""
          >
            {showIndicators ? (
              <div
                className="relative flex min-h-10 w-fit min-w-0 max-w-[calc(100%-3.5rem)] items-center justify-start"
                aria-label="Area contextual"
                data-contextual-panel-root=""
                data-capture-context-tools=""
              >
                {activePanel === "concepts" ? (
                  <ProgressivePanel
                    title="Conceptos detectados"
                    expandHref={getConceptKnowledgeExplorerPath()}
                    expandLabel="Explorar conocimiento"
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
                      highlightedConceptKeys={highlightedConceptKeys}
                      onToggleExisting={toggleConcept}
                      onToggleEmerging={toggleEmergingConcept}
                    />
                  </ProgressivePanel>
                ) : null}
                {activePanel === "memories" ? (
                  <ProgressivePanel
                    title="Me recuerda a…"
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
                <div
                  className="flex min-h-10 max-w-full items-center justify-start gap-2 overflow-x-auto transition-opacity motion-reduce:transition-none"
                  aria-label="Indicadores contextuales"
                  data-context-indicator-group=""
                >
                  {showConceptIndicator ? (
                    <ContextIndicator
                      panel="concepts"
                      icon="concepts"
                      count={conceptSuggestions.length}
                      active={activePanel === "concepts"}
                      label={`${conceptSuggestions.length} conceptos sugeridos`}
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
                      label={`${memorySuggestions.length} ideas relacionadas`}
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
              </div>
            ) : null}
            <Button
              type="button"
              onClick={() => void handleCapture()}
              disabled={capturing}
              variant="ghost"
              className="ml-auto h-10 w-10 shrink-0 rounded-full border border-zinc-200 bg-zinc-950 p-0 text-white hover:bg-zinc-800 hover:text-white md:bg-white/40 md:text-zinc-700 md:hover:bg-white md:hover:text-zinc-950"
              aria-label="Capturar"
              title="Capturar con Ctrl/Cmd + Enter"
              data-capture-submit=""
            >
              <SendHorizontal className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">
                {capturing ? "Capturando" : "Capturar"}
              </span>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}

function mergeSelectedConceptSuggestions(
  suggestions: ConceptSuggestion[],
  selectedEmergingConcepts: EmergingConceptSuggestion[],
  selectedExistingConcepts: ExistingConceptSuggestion[],
) {
  const merged = new Map<string, ConceptSuggestion>();

  for (const suggestion of suggestions) {
    const key =
      suggestion.kind === "existing"
        ? `existing:${suggestion.conceptId}`
        : `emerging:${suggestion.candidateId}`;
    merged.set(key, suggestion);
  }

  for (const suggestion of selectedExistingConcepts) {
    merged.set(`existing:${suggestion.conceptId}`, suggestion);
  }

  for (const suggestion of selectedEmergingConcepts) {
    merged.set(`emerging:${suggestion.candidateId}`, suggestion);
  }

  return Array.from(merged.values());
}

function createSelectedExistingConceptSuggestion(
  context: Context,
  matchedAlias?: string,
): ExistingConceptSuggestion {
  return {
    kind: "existing",
    context,
    conceptId: context.id,
    label: context.name,
    score: 1,
    evidenceCaptureIds: [],
    matchedTerms: [],
    matchedAlias,
    knowledgeSuggestionKind: "RELATED_NOW",
  };
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
  const Icon = icon === "concepts" ? Brain : Lightbulb;
  const colorClassName = getContextIndicatorColorClassName({ icon, active });

  return (
    <button
      type="button"
      data-context-indicator=""
      data-context-indicator-panel={panel}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-9 w-9 min-w-9 items-center justify-center rounded-full outline-none transition-colors hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-zinc-400 motion-reduce:transition-none",
        colorClassName,
      )}
      onMouseEnter={onHover}
      onMouseLeave={onIntentEnd}
      onFocus={onFocus}
      onBlur={onBlur}
      onClick={onClick}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      <span className="sr-only">{count}</span>
    </button>
  );
}

function getContextIndicatorColorClassName({
  icon,
  active,
}: {
  icon: "concepts" | "memories";
  active: boolean;
}) {
  const colorByIcon = {
    concepts: active
      ? "text-indigo-600 hover:text-indigo-600"
      : "text-indigo-300 hover:text-indigo-500",
    memories: active
      ? "text-amber-600 hover:text-amber-600"
      : "text-amber-300 hover:text-amber-500",
  } satisfies Record<typeof icon, string>;

  return colorByIcon[icon];
}

function ProgressivePanel({
  title,
  expandHref,
  expandLabel,
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
  expandLabel?: string;
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
      className={cn(
        "z-40 overflow-hidden rounded-2xl bg-white/95 shadow-[0_12px_40px_rgba(24,24,27,0.10)] outline-none backdrop-blur-sm transition duration-150 ease-out motion-reduce:transition-none",
        isMobileSheet
          ? "fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] max-h-[70dvh] border border-zinc-200/70"
          : "absolute bottom-[calc(100%+10px)] left-1/2 max-h-[min(52dvh,26rem)] w-[min(25rem,calc(100vw-2rem))] -translate-x-1/2 border border-zinc-200/50 shadow-[0_10px_32px_rgba(24,24,27,0.08)]",
      )}
      onMouseEnter={onIntentStart}
      onMouseLeave={onIntentEnd}
      onFocus={onIntentStart}
      onBlur={onBlur}
    >
      <div
        className={cn(
          "vinema-scrollbar overflow-y-auto scroll-smooth overscroll-contain px-4 py-4",
          isMobileSheet
            ? "max-h-[calc(70dvh-1.5rem)]"
            : "max-h-[calc(min(52dvh,26rem)-1.5rem)]",
        )}
      >
        {isMobileSheet ? (
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 outline-none hover:bg-zinc-100 hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
              aria-label="Cerrar panel"
              onClick={onClose}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}
        {children}
        {expandHref ? (
          <Link
            href={expandHref}
            className="mt-3 inline-flex h-8 items-center rounded-md px-1 text-xs font-medium text-zinc-500 outline-none hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
            aria-label={expandLabel ?? "Explorar"}
            onClick={() => {
              void onExpand?.();
            }}
          >
            {expandLabel ?? "Explorar"}
          </Link>
        ) : null}
      </div>
    </aside>
  );
}

function canUseDesktopPopover() {
  if (
    typeof window === "undefined" ||
    window.innerWidth < DESKTOP_PANEL_BREAKPOINT
  ) {
    return false;
  }

  if (typeof window.matchMedia !== "function") {
    return true;
  }

  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

function showSelectionFeedback(
  feedback: ReturnType<typeof useVisualFeedback>,
  message: string,
) {
  feedback.dismissKind("success");
  feedback.success(message);
}

function ConceptPanelContent({
  suggestions,
  selectedContextIds,
  selectedEmergingCandidateIds,
  highlightedConceptKeys,
  onToggleExisting,
  onToggleEmerging,
}: {
  suggestions: ConceptSuggestion[];
  selectedContextIds: string[];
  selectedEmergingCandidateIds: string[];
  highlightedConceptKeys: Set<string>;
  onToggleExisting: (contextId: string) => void;
  onToggleEmerging: (candidateId: string) => void;
}) {
  if (suggestions.length === 0) {
    return <p className="text-sm text-zinc-500">No hay conceptos detectados.</p>;
  }

  const groupedSuggestions = groupConceptSuggestions(suggestions);

  return (
    <div className="space-y-2">
      {groupedSuggestions.map(({ kind, items }) => (
        <section key={kind} className="space-y-2">
          <div className="space-y-2">
            {items.map((suggestion) => (
              <ConceptSuggestionRow
                key={`${suggestion.kind}-${getConceptSuggestionId(suggestion)}`}
                suggestion={suggestion}
                selectedContextIds={selectedContextIds}
                selectedEmergingCandidateIds={selectedEmergingCandidateIds}
                highlighted={highlightedConceptKeys.has(
                  `${suggestion.kind}:${getConceptSuggestionId(suggestion)}`,
                )}
                onToggleExisting={onToggleExisting}
                onToggleEmerging={onToggleEmerging}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ConceptSuggestionRow({
  suggestion,
  selectedContextIds,
  selectedEmergingCandidateIds,
  highlighted,
  onToggleExisting,
  onToggleEmerging,
}: {
  suggestion: ConceptSuggestion;
  selectedContextIds: string[];
  selectedEmergingCandidateIds: string[];
  highlighted: boolean;
  onToggleExisting: (contextId: string) => void;
  onToggleEmerging: (candidateId: string) => void;
}) {
  const selected =
    suggestion.kind === "existing"
      ? selectedContextIds.includes(suggestion.conceptId)
      : selectedEmergingCandidateIds.includes(suggestion.candidateId);
  const label =
    suggestion.kind === "existing"
      ? suggestion.label
      : suggestion.suggestedLabel;

  return (
    <div
      data-concept-suggestion-highlighted={highlighted ? "" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-md transition-colors motion-reduce:transition-none",
        selected ? "bg-zinc-950 text-white" : "text-zinc-700 hover:bg-zinc-50",
        highlighted ? "ring-2 ring-indigo-200" : "",
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
        <span className="min-w-0">
          <span className="block truncate">{label}</span>
          {suggestion.kind === "existing" && suggestion.matchedAlias ? (
            <span
              className={cn(
                "block truncate text-xs",
                selected ? "text-zinc-300" : "text-zinc-500",
              )}
            >
              Detectado como {suggestion.matchedAlias}
            </span>
          ) : null}
        </span>
        {selected ? (
          <Check className="h-4 w-4 shrink-0 text-zinc-200" aria-hidden="true" />
        ) : null}
      </button>
      {suggestion.kind === "existing" ? (
        <span className="sr-only">Concepto existente</span>
      ) : null}
    </div>
  );
}

function groupConceptSuggestions(suggestions: ConceptSuggestion[]) {
  const groups: { kind: KnowledgeSuggestionKind; items: ConceptSuggestion[] }[] = [
    { kind: "RELATED_NOW", items: [] },
    { kind: "MISSING_CONTEXT", items: [] },
    { kind: "REVISIT", items: [] },
  ];
  const fallback = groups[0];

  for (const suggestion of suggestions.slice(0, 5)) {
    if (suggestion.kind === "emerging") {
      fallback.items.push(suggestion);
      continue;
    }

    const group =
      groups.find((item) => item.kind === suggestion.knowledgeSuggestionKind) ??
      fallback;
    group.items.push(suggestion);
  }

  return groups.filter((group) => group.items.length > 0);
}

function getConceptSuggestionId(suggestion: ConceptSuggestion) {
  return suggestion.kind === "existing"
    ? suggestion.conceptId
    : suggestion.candidateId;
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
      <Link
        href="/memory"
        className="inline-flex h-8 items-center rounded-md px-1 text-xs text-zinc-500 outline-none hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
      >
        Memoria
      </Link>
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
    <article className="min-w-0 rounded-md text-sm leading-6 text-zinc-700">
      {identity?.displayText ? (
        <CaptureEmergentIdentityLabel
          identity={identity}
          className="px-3 pt-2 text-sm leading-6"
        />
      ) : null}
      <Link
        href={getNodeDetailPath(node.id, { returnTo: "/" })}
        aria-label={`Abrir recuerdo: ${preview}`}
        title={preview}
        className="block min-w-0 rounded-md px-3 py-2 outline-none hover:bg-zinc-50 hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
        onClick={() => {
          void onOpenCapture();
        }}
      >
        <span className="block min-w-0 truncate">{preview}</span>
        <time className="mt-1 block text-xs text-zinc-400">
          {formatCompactDate(getContentTimestamp(node))}
        </time>
      </Link>
    </article>
  );
}

function formatCompactDate(value: string) {
  return new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
