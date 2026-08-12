"use client";

import Link from "next/link";
import { Activity, Brain, Check, Lightbulb, Network, Settings2, X } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConceptWorkspaceClient } from "@/app/concepts/concept-workspace-client";
import { NoteDetailClient } from "@/app/notes/detail/note-detail-client";
import { KnowledgeBaseClient } from "@/app/notes/knowledge-base-client";
import { ApplicationWorkspaceDialog } from "@/components/app-shell/application-workspace-dialog";
import { Button } from "@/components/ui/button";
import type { Node } from "@/domain/node/node";
import type { Context } from "@/domain/context/context";
import type { Device } from "@/domain/device/device";
import type { Workspace } from "@/domain/workspace/workspace";
import { useCanvasPreferences } from "@/features/canvas/canvas-preferences";
import { useStableCanvasPrompt } from "@/features/canvas/canvas-prompts";
import {
  CanvasCaptureDock,
  CanvasIconRail,
  CanvasMainRegion,
  CanvasPanelColumn,
  CanvasPreferencesContent,
  CanvasSubmitButton,
  CanvasWritingSurface,
  VinemaCanvas,
  VinemaCanvasEditor,
} from "@/features/canvas/vinema-canvas";
import type {
  AssociationSuggestion,
  ConceptSuggestion,
  EmergingConceptSuggestion,
  ExistingConceptSuggestion,
} from "@/features/associations/association-types";
import { getUsefulDetectedAlias } from "@/features/associations/concept-alias-display";
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
import { loadCaptureEmergentIdentities } from "@/features/identity/load-capture-emergent-identities";
import { useVisualFeedback } from "@/features/feedback/visual-feedback-provider";
import { isKnowledgeResetRunning } from "@/features/knowledge-reset/knowledge-reset";
import { getCapturePreview } from "@/features/node/node-display";
import { getNodeDetailPath } from "@/features/node/node-routes";
import type { SearchNodesRepositories } from "@/features/recovery/search-nodes";
import { MemorySyncStatusPanel } from "@/features/sync/observability/memory-sync-status-panel";
import type { StorageAdapter } from "@/infrastructure/storage/storage-adapter";
import { cn } from "@/lib/cn";

const EMPTY_SELECTED_CAPTURE_IDS: string[] = [];
const INITIAL_MEMORY_RESULT_LIMIT = 5;
const DESKTOP_PANEL_BREAKPOINT = 768;
const CONCEPT_HIGHLIGHT_MS = 1200;
const PANEL_HOVER_CLOSE_DELAY_MS = 240;
const PANEL_PREVIEW_EXIT_MS = 240;

type DraftStatus = "idle" | "saving" | "saved" | "error";
type ActivePanel = "concepts" | "memories" | "preferences" | "memoryStatus" | null;
type ToolPanel = Exclude<ActivePanel, null>;
type ContextHoverPart = "trigger" | "corridor" | "panel";
type ContextHoverState = {
  activePanel: ToolPanel | null;
  trigger: boolean;
  corridor: boolean;
  panel: boolean;
};
export type WorkspaceView =
  | { kind: "memory-index" }
  | { kind: "memory-detail"; nodeId: string }
  | { kind: "concept-workspace"; selectedConceptId?: string | null };
export type WorkspaceMapTransform = {
  scale: number;
  x: number;
  y: number;
};
export type WorkspaceViewState = {
  scrollTop?: number;
  memory?: {
    query?: string;
    scrollTop?: number;
  };
  concept?: {
    selectedConceptId?: string | null;
    query?: string;
    profileScrollTop?: number;
    mapTransform?: WorkspaceMapTransform;
  };
  capture?: {
    mode?: "read" | "edit";
    scrollTop?: number;
  };
};
export type WorkspaceHistoryEntry = {
  view: WorkspaceView;
  params?: Record<string, string>;
  state: WorkspaceViewState;
};
type PanelSnapshot = {
  panel: Exclude<ActivePanel, null>;
  signature: string;
  conceptSuggestions: ConceptSuggestion[];
  memorySuggestions: AssociationSuggestion[];
  memoryIdentities: Map<string, CaptureEmergentIdentity>;
  memoryLoading: boolean;
  memoryError: boolean;
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
  const canvasPreferences = useCanvasPreferences(storage);
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
  const [pinnedPanel, setPinnedPanel] = useState<ActivePanel>(null);
  const [previewPanel, setPreviewPanel] = useState<ActivePanel>(null);
  const [closingPreviewPanel, setClosingPreviewPanel] = useState<ActivePanel>(null);
  const [panelSnapshots, setPanelSnapshots] = useState<
    Partial<Record<ToolPanel, PanelSnapshot>>
  >({});
  const [confirmedContextSignals, setConfirmedContextSignals] = useState({
    memories: false,
    concepts: false,
    conceptCount: 0,
  });
  const [workspaceHistory, setWorkspaceHistory] = useState<WorkspaceHistoryEntry[]>([]);
  const [capturedSelection, setCapturedSelection] =
    useState<CapturedTextSelection | null>(null);
  const [selectionResolution, setSelectionResolution] =
    useState<CaptureSelectionResolution | null>(null);
  const [selectionProcessing, setSelectionProcessing] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePromiseRef = useRef<Promise<unknown> | null>(null);
  const closePanelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contextHoverStateRef = useRef<ContextHoverState>({
    activePanel: null,
    trigger: false,
    corridor: false,
    panel: false,
  });
  const previousPanelContentRef = useRef(content);
  const highlightTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const captureInFlightRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const workspaceDialogTriggerRef = useRef<HTMLElement | null>(null);
  const currentWorkspaceEntry = workspaceHistory.at(-1) ?? null;
  const currentWorkspaceView = currentWorkspaceEntry?.view ?? null;
  const hasContent = content.trim().length > 0;
  const placeholder = useStableCanvasPrompt({
    category: "mixed",
    content,
  });
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
  const showConceptIndicator =
    hasContent && (confirmedContextSignals.concepts || conceptSuggestions.length > 0);
  const showMemoryIndicator =
    hasContent && (confirmedContextSignals.memories || memorySuggestions.length > 0);
  const contextualConceptCount = Math.max(
    confirmedContextSignals.conceptCount,
    conceptSuggestions.length,
  );
  const hasSelectedConceptSuggestions =
    selectedContextIds.length > 0 ||
    selectedEmergingConcepts.length > 0 ||
    selectedExistingConceptSuggestions.length > 0;
  const visiblePanel = pinnedPanel ?? previewPanel ?? closingPreviewPanel;
  const visiblePanelIsContextual = isContextualCanvasPanel(visiblePanel);
  const previewClosing =
    pinnedPanel === null &&
    previewPanel === null &&
    closingPreviewPanel !== null;
  const visiblePanelSnapshot = visiblePanel
    ? panelSnapshots[visiblePanel] ?? null
    : null;
  const displayedPanelSnapshot =
    visiblePanel === "concepts" && visiblePanelSnapshot
      ? createEnrichedConceptPanelSnapshot({
          snapshot: visiblePanelSnapshot,
          latestConceptSuggestions: conceptSuggestions,
          memorySuggestions,
          memoryLoading: associationState.status === "loading",
          memoryError: associationState.error !== null,
        })
      : visiblePanel === "memories" && visiblePanelSnapshot
        ? createResolvedMemoryPanelSnapshot({
            snapshot: visiblePanelSnapshot,
            memorySuggestions,
            memoryIdentities,
            memoryLoading: associationState.status === "loading",
            memoryError: associationState.error !== null,
          })
      : visiblePanelSnapshot;
  const clearPanelCloseTimer = useCallback(() => {
    if (closePanelTimerRef.current) {
      clearTimeout(closePanelTimerRef.current);
      closePanelTimerRef.current = null;
    }

    if (previewExitTimerRef.current) {
      clearTimeout(previewExitTimerRef.current);
      previewExitTimerRef.current = null;
    }
  }, []);
  const closePanels = useCallback(() => {
    clearPanelCloseTimer();
    resetContextHoverState();
    setPinnedPanel(null);
    setPreviewPanel(null);
    setClosingPreviewPanel(null);
    queueMicrotask(() => {
      textareaRef.current?.focus();
    });
  }, [clearPanelCloseTimer]);

  useEffect(() => {
    if (!hasContent) {
      queueMicrotask(() => {
        setConfirmedContextSignals({
          memories: false,
          concepts: false,
          conceptCount: 0,
        });
      });
      return;
    }

    if (associationState.status !== "ready") {
      return;
    }

    queueMicrotask(() => {
      setConfirmedContextSignals({
        memories: memorySuggestions.length > 0,
        concepts: conceptSuggestions.length > 0,
        conceptCount: conceptSuggestions.length,
      });
    });
  }, [
    associationState.status,
    conceptSuggestions.length,
    hasContent,
    memorySuggestions.length,
  ]);

  useEffect(() => {
    if (previousPanelContentRef.current === content) {
      return;
    }

    previousPanelContentRef.current = content;

    if (
      visiblePanel &&
      !(visiblePanel === "concepts" && hasSelectedConceptSuggestions)
    ) {
      queueMicrotask(() => {
        closePanels();
      });
    }
  }, [closePanels, content, hasSelectedConceptSuggestions, visiblePanel]);

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
    const pinnedUnavailable = !isPanelAvailable({
      panel: pinnedPanel,
      showConceptIndicator,
      showMemoryIndicator,
    });
    const previewUnavailable = !isPanelAvailable({
      panel: previewPanel,
      showConceptIndicator,
      showMemoryIndicator,
    });
    const closingPreviewUnavailable = !isPanelAvailable({
      panel: closingPreviewPanel,
      showConceptIndicator,
      showMemoryIndicator,
    });

    if (pinnedUnavailable || previewUnavailable || closingPreviewUnavailable) {
      clearPanelCloseTimer();
      queueMicrotask(() => {
        if (pinnedUnavailable) {
          setPinnedPanel(null);
        }

        if (previewUnavailable) {
          setPreviewPanel(null);
        }

        if (closingPreviewUnavailable) {
          setClosingPreviewPanel(null);
        }
      });
    }
  }, [
    closingPreviewPanel,
    clearPanelCloseTimer,
    pinnedPanel,
    previewPanel,
    showConceptIndicator,
    showMemoryIndicator,
  ]);

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
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      if (currentWorkspaceView !== null) {
        return;
      }

      if (capturedSelection) {
        event.preventDefault();
        clearCapturedSelection();
        queueMicrotask(() => textareaRef.current?.focus());
        return;
      }

      if (visiblePanel) {
        event.preventDefault();
        closePanels();
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [capturedSelection, closePanels, currentWorkspaceView, visiblePanel]);

  useEffect(() => {
    if (!visiblePanel) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!(event.target instanceof Element)) {
        return;
      }

      if (
        event.target.closest("[data-canvas-side-panel]") ||
        event.target.closest("[data-canvas-panel-trigger]")
      ) {
        return;
      }

      closePanels();
    }

    window.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [closePanels, visiblePanel]);

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
    clearPanelCloseTimer();

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
      setPinnedPanel(null);
      setPreviewPanel(null);
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

  function snapshotPanel(panel: ToolPanel) {
    setPanelSnapshots((current) => ({
      ...current,
      [panel]: createPanelSnapshot(panel, {
        conceptSuggestions,
        memorySuggestions,
        memoryIdentities,
        memoryLoading: associationState.status === "loading",
        memoryError: associationState.error !== null,
      }),
    }));
  }

  function activatePreviewPanel(panel: ToolPanel) {
    if (pinnedPanel) {
      return;
    }

    clearPanelCloseTimer();
    setClosingPreviewPanel(null);
    snapshotPanel(panel);
    setPreviewPanel(panel);
  }

  function leavePreviewTrigger(panel: ToolPanel) {
    if (!pinnedPanel) {
      schedulePreviewClose(panel);
    }
  }

  function activateContextPreviewPanel(panel: ToolPanel) {
    setContextHoverPart("trigger", panel, true);
    activatePreviewPanel(panel);
  }

  function leaveContextPreviewTrigger(panel: ToolPanel) {
    setContextHoverPart("trigger", panel, false);

    if (!pinnedPanel && !isContextHoverRegionActive(panel)) {
      schedulePreviewClose(panel);
    }
  }

  function enterContextPreviewSurface(panel: ToolPanel, part: ContextHoverPart) {
    if (pinnedPanel) {
      return;
    }

    setContextHoverPart(part, panel, true);
    clearPanelCloseTimer();
    setClosingPreviewPanel(null);
    setPreviewPanel(panel);
  }

  function leaveContextPreviewSurface(panel: ToolPanel, part: ContextHoverPart) {
    if (!pinnedPanel) {
      setContextHoverPart(part, panel, false);

      if (!isContextHoverRegionActive(panel)) {
        schedulePreviewClose(panel);
      }
    }
  }

  function enterPreviewSurface(panel: ToolPanel) {
    if (pinnedPanel) {
      return;
    }

    clearPanelCloseTimer();
    setClosingPreviewPanel(null);
    setPreviewPanel(panel);
  }

  function leavePreviewSurface(panel: ToolPanel) {
    if (!pinnedPanel) {
      schedulePreviewClose(panel);
    }
  }

  function schedulePreviewClose(panel: ToolPanel) {
    clearPanelCloseTimer();
    closePanelTimerRef.current = setTimeout(() => {
      if (isContextualCanvasPanel(panel) && isContextHoverRegionActive(panel)) {
        closePanelTimerRef.current = null;
        return;
      }

      closePanelTimerRef.current = null;
      setClosingPreviewPanel(panel);
      setPreviewPanel(null);
      previewExitTimerRef.current = setTimeout(() => {
        previewExitTimerRef.current = null;
        setClosingPreviewPanel((closing) => (closing === panel ? null : closing));
      }, PANEL_PREVIEW_EXIT_MS);
    }, PANEL_HOVER_CLOSE_DELAY_MS);
  }

  function openPanel(panel: ToolPanel) {
    clearPanelCloseTimer();
    resetContextHoverState();
    setPreviewPanel(null);
    setClosingPreviewPanel(null);

    if (pinnedPanel === panel) {
      setPinnedPanel(null);
      return;
    }

    snapshotPanel(panel);
    setPinnedPanel(panel);
  }

  function resetContextHoverState() {
    contextHoverStateRef.current = {
      activePanel: null,
      trigger: false,
      corridor: false,
      panel: false,
    };
  }

  function setContextHoverPart(
    part: ContextHoverPart,
    panel: ToolPanel,
    hovered: boolean,
  ) {
    const current = contextHoverStateRef.current;
    const samePanel = current.activePanel === panel;
    const nextState = {
      trigger: samePanel ? current.trigger : false,
      corridor: samePanel ? current.corridor : false,
      panel: samePanel ? current.panel : false,
      [part]: hovered,
    };
    const active =
      nextState.trigger || nextState.corridor || nextState.panel;

    contextHoverStateRef.current = {
      activePanel: active ? panel : null,
      trigger: nextState.trigger,
      corridor: nextState.corridor,
      panel: nextState.panel,
    };
  }

  function isContextHoverRegionActive(panel: ToolPanel) {
    const hoverState = contextHoverStateRef.current;

    return (
      hoverState.activePanel === panel &&
      (hoverState.trigger || hoverState.corridor || hoverState.panel)
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

  function openWorkspaceDialog(
    view: WorkspaceView,
    event: MouseEvent<HTMLElement>,
  ) {
    workspaceDialogTriggerRef.current = event.currentTarget;
    setWorkspaceHistory([createWorkspaceHistoryEntry(view)]);
  }

  const closeWorkspaceDialog = useCallback(() => {
    setWorkspaceHistory([]);
    queueMicrotask(() => {
      workspaceDialogTriggerRef.current?.focus();
    });
  }, []);

  const changeWorkspaceDialog = useCallback((open: boolean) => {
    if (open) {
      return;
    }

    closeWorkspaceDialog();
  }, [closeWorkspaceDialog]);

  function pushWorkspaceView(view: WorkspaceView) {
    setWorkspaceHistory((current) => [...current, createWorkspaceHistoryEntry(view)]);
  }

  const replaceWorkspaceState = useCallback((state: WorkspaceViewState) => {
    setWorkspaceHistory((current) => replaceWorkspaceHistoryState(current, state));
  }, []);

  const replaceMemoryWorkspaceState = useCallback(
    (memoryState: NonNullable<WorkspaceViewState["memory"]>) => {
      replaceWorkspaceState({ memory: memoryState });
    },
    [replaceWorkspaceState],
  );

  const replaceCaptureWorkspaceState = useCallback(
    (captureState: NonNullable<WorkspaceViewState["capture"]>) => {
      replaceWorkspaceState({ capture: captureState });
    },
    [replaceWorkspaceState],
  );

  const replaceConceptWorkspaceState = useCallback(
    (conceptState: NonNullable<WorkspaceViewState["concept"]>) => {
      replaceWorkspaceState({ concept: conceptState });
    },
    [replaceWorkspaceState],
  );

  const openWorkspaceMemoryDetail = useCallback((nodeId: string) => {
    pushWorkspaceView({ kind: "memory-detail", nodeId });
  }, []);

  const openWorkspaceMemoryIndex = useCallback(() => {
    pushWorkspaceView({ kind: "memory-index" });
  }, []);

  async function openContextualMemoryCapture(nodeId: string) {
    await persistCurrentDraft();
    openWorkspaceMemoryDetail(nodeId);
  }

  const openWorkspaceConcept = useCallback((contextId: string) => {
    pushWorkspaceView({
      kind: "concept-workspace",
      selectedConceptId: contextId,
    });
  }, []);

  const closeRootWorkspaceDialog = useCallback(() => {
    changeWorkspaceDialog(false);
  }, [changeWorkspaceDialog]);

  const workspaceDialogBack =
    workspaceHistory.length > 1
      ? goBackWorkspace
      : currentWorkspaceView?.kind === "memory-detail"
        ? closeWorkspaceDialog
        : undefined;

  function goBackWorkspace() {
    setWorkspaceHistory((current) =>
      current.length > 1 ? current.slice(0, -1) : current,
    );
  }

  return (
    <VinemaCanvas
      preferences={canvasPreferences.preferences}
    >
      <CanvasMainRegion>
        <CanvasIconRail>
          <CanvasRailWorkspaceButton
            label="Explorar conocimiento"
            active={currentWorkspaceView?.kind === "memory-index"}
            onClick={(event) => openWorkspaceDialog({ kind: "memory-index" }, event)}
          >
            <Brain
              className="h-5 w-5"
              aria-hidden="true"
              data-canvas-rail-icon="knowledge"
            />
          </CanvasRailWorkspaceButton>
          <CanvasRailWorkspaceButton
            label="Explorar conceptos"
            active={currentWorkspaceView?.kind === "concept-workspace"}
            onClick={(event) =>
              openWorkspaceDialog({ kind: "concept-workspace" }, event)
            }
          >
            <Network
              className="h-5 w-5"
              aria-hidden="true"
              data-canvas-rail-icon="concept-network"
            />
          </CanvasRailWorkspaceButton>
          <CanvasPanelIconButton
            active={visiblePanel === "preferences"}
            pressed={pinnedPanel === "preferences"}
            icon="preferences"
            panelId="canvas-tool-panel"
            label="Canvas"
            preferencesTrigger
            onHover={() => activatePreviewPanel("preferences")}
            onHoverEnd={() => leavePreviewTrigger("preferences")}
            onClick={() => openPanel("preferences")}
          >
            <Settings2 className="h-5 w-5" aria-hidden="true" />
          </CanvasPanelIconButton>
          <CanvasPanelIconButton
            active={visiblePanel === "memoryStatus"}
            pressed={pinnedPanel === "memoryStatus"}
            icon="memoryStatus"
            panelId="canvas-tool-panel"
            label="Estado"
            memoryStatusTrigger
            onHover={() => activatePreviewPanel("memoryStatus")}
            onHoverEnd={() => leavePreviewTrigger("memoryStatus")}
            onClick={() => openPanel("memoryStatus")}
          >
            <Activity
              className="h-5 w-5"
              aria-hidden="true"
              data-canvas-rail-icon="activity"
            />
          </CanvasPanelIconButton>
        </CanvasIconRail>
        <CanvasPanelColumn
          onMouseEnter={() => {
            if (visiblePanel && !visiblePanelIsContextual) {
              enterPreviewSurface(visiblePanel);
            }
          }}
          onMouseLeave={() => {
            if (visiblePanel && !visiblePanelIsContextual) {
              leavePreviewSurface(visiblePanel);
            }
          }}
          onFocus={() => {
            if (visiblePanel && !visiblePanelIsContextual) {
              enterPreviewSurface(visiblePanel);
            }
          }}
          onBlur={(event) => {
            if (
              visiblePanel &&
              !visiblePanelIsContextual &&
              !(event.relatedTarget instanceof Element &&
                event.currentTarget.contains(event.relatedTarget))
            ) {
              leavePreviewSurface(visiblePanel);
            }
          }}
        >
          {visiblePanel && !visiblePanelIsContextual ? (
            <CanvasSidePanel
              title={getActivePanelTitle(visiblePanel)}
              panel={visiblePanel}
              pinned={pinnedPanel === visiblePanel}
              closing={previewClosing}
              onClose={closePanels}
            >
            {visiblePanel === "preferences" ? (
              <CanvasPreferencesContent
                preferences={canvasPreferences.preferences}
                onChange={canvasPreferences.updatePreferences}
                onReset={canvasPreferences.resetPreferences}
              />
            ) : null}
            {visiblePanel === "memoryStatus" ? (
              <MemorySyncStatusPanel variant="rail-panel" onClose={closePanels} />
            ) : null}
            </CanvasSidePanel>
          ) : null}
        </CanvasPanelColumn>
        <CanvasWritingSurface
          contextLayer={
            <CanvasContextualLayer
              visiblePanel={visiblePanel}
              pinnedPanel={pinnedPanel}
              previewClosing={previewClosing}
              showMemoryIndicator={showMemoryIndicator}
              showConceptIndicator={showConceptIndicator}
              conceptCount={contextualConceptCount}
              displayedPanelSnapshot={displayedPanelSnapshot}
              selectedContextIds={selectedContextIds}
              selectedEmergingCandidateIds={selectedEmergingConcepts.map(
                (concept) => concept.candidateId,
              )}
              highlightedConceptKeys={highlightedConceptKeys}
              associationRetry={associationState.retry}
              onActivatePreviewPanel={activateContextPreviewPanel}
              onLeavePreviewTrigger={leaveContextPreviewTrigger}
              onEnterPreviewSurface={enterContextPreviewSurface}
              onLeavePreviewSurface={leaveContextPreviewSurface}
              onOpenPanel={openPanel}
              onClosePanels={closePanels}
              onToggleExisting={toggleConcept}
              onToggleEmerging={toggleEmergingConcept}
              onOpenCapture={openContextualMemoryCapture}
            />
          }
        >
          <VinemaCanvasEditor
            id="capture"
            ref={textareaRef}
            preferences={canvasPreferences.preferences}
            aria-label="Capturar"
            className="row-[2] w-full"
            placeholder={placeholder}
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
            anchorElement={textareaRef.current}
            onCapture={() => void captureSelectedText()}
            onConfirmNew={() => confirmNewSelectionConcept()}
            onChoose={chooseAmbiguousSelectionConcept}
            onCancel={clearCapturedSelection}
          />
        </CanvasWritingSurface>
        <CanvasCaptureDock>
          <CanvasSubmitButton
            visible={hasContent}
            capturing={capturing}
            onCapture={() => void handleCapture()}
          />
        </CanvasCaptureDock>
      </CanvasMainRegion>
      <ApplicationWorkspaceDialog
        open={currentWorkspaceView !== null}
        title={getWorkspaceViewTitle(currentWorkspaceView)}
        description={getWorkspaceViewDescription(currentWorkspaceView)}
        hideHeader={
          currentWorkspaceView?.kind === "concept-workspace" &&
          workspaceHistory.length <= 1
        }
        returnFocusRef={workspaceDialogTriggerRef}
        onBack={workspaceDialogBack}
        onOpenChange={changeWorkspaceDialog}
      >
        {currentWorkspaceView?.kind === "memory-index" ? (
          <KnowledgeBaseClient
            key={`memory-index-${workspaceHistory.length}`}
            embedded
            embeddedState={currentWorkspaceEntry?.state.memory}
            onEmbeddedStateChange={replaceMemoryWorkspaceState}
            onOpenMemory={openWorkspaceMemoryDetail}
            onOpenConcept={openWorkspaceConcept}
          />
        ) : null}
        {currentWorkspaceView?.kind === "memory-detail" ? (
          <NoteDetailClient
            key={`memory-detail-${workspaceHistory.length}-${currentWorkspaceView.nodeId}`}
            embeddedNodeId={currentWorkspaceView.nodeId}
            embeddedState={currentWorkspaceEntry?.state.capture}
            onEmbeddedStateChange={replaceCaptureWorkspaceState}
            onBack={workspaceDialogBack}
            onOpenConcept={openWorkspaceConcept}
          />
        ) : null}
        {currentWorkspaceView?.kind === "concept-workspace" ? (
          <ConceptWorkspaceClient
            key={`concept-workspace-${workspaceHistory.length}`}
            initialConceptId={currentWorkspaceView.selectedConceptId ?? null}
            initialState={{
              selectedConceptId:
                currentWorkspaceEntry?.state.concept?.selectedConceptId ??
                currentWorkspaceView.selectedConceptId ??
                null,
              query: currentWorkspaceEntry?.state.concept?.query,
              profileScrollTop: currentWorkspaceEntry?.state.concept?.profileScrollTop,
              mapTransform: currentWorkspaceEntry?.state.concept?.mapTransform,
            }}
            onStateChange={replaceConceptWorkspaceState}
            onClose={
              workspaceHistory.length <= 1
                ? closeRootWorkspaceDialog
                : undefined
            }
            onOpenConcept={openWorkspaceConcept}
            onOpenMemory={openWorkspaceMemoryDetail}
            onOpenMemoryIndex={openWorkspaceMemoryIndex}
          />
        ) : null}
      </ApplicationWorkspaceDialog>
    </VinemaCanvas>
  );
}

function getWorkspaceViewTitle(view: WorkspaceView | null) {
  switch (view?.kind) {
    case "memory-index":
      return "Memoria";
    case "memory-detail":
      return "Captura";
    case "concept-workspace":
      return "Conceptos";
    default:
      return "Vinema";
  }
}

function getWorkspaceViewDescription(view: WorkspaceView | null) {
  switch (view?.kind) {
    case "memory-index":
      return "Tus capturas organizadas por contexto.";
    case "memory-detail":
      return "Detalle de una captura de la Memoria.";
    case "concept-workspace":
      return undefined;
    default:
      return undefined;
  }
}

function createWorkspaceHistoryEntry(view: WorkspaceView): WorkspaceHistoryEntry {
  return {
    view,
    params: {},
    state: getInitialWorkspaceViewState(view),
  };
}

function getInitialWorkspaceViewState(view: WorkspaceView): WorkspaceViewState {
  switch (view.kind) {
    case "memory-index":
      return { memory: { query: "" }, scrollTop: 0 };
    case "memory-detail":
      return { capture: { mode: "read" }, scrollTop: 0 };
    case "concept-workspace":
      return {
        concept: {
          selectedConceptId: view.selectedConceptId ?? null,
        },
        scrollTop: 0,
      };
  }
}

export function mergeWorkspaceState(
  current: WorkspaceViewState,
  next: WorkspaceViewState,
): WorkspaceViewState {
  return {
    ...current,
    ...next,
    memory: next.memory ? { ...current.memory, ...next.memory } : current.memory,
    concept: next.concept ? { ...current.concept, ...next.concept } : current.concept,
    capture: next.capture ? { ...current.capture, ...next.capture } : current.capture,
  };
}

export function replaceWorkspaceHistoryState(
  current: WorkspaceHistoryEntry[],
  state: WorkspaceViewState,
) {
  if (current.length === 0) {
    return current;
  }

  const active = current[current.length - 1];
  const nextState = mergeWorkspaceState(active.state, state);

  if (areWorkspaceStatesEquivalent(active.state, nextState)) {
    return current;
  }

  const next = current.slice();
  next[next.length - 1] = {
    ...active,
    state: nextState,
  };
  return next;
}

export function areWorkspaceStatesEquivalent(
  first: WorkspaceViewState,
  second: WorkspaceViewState,
) {
  return (
    first.scrollTop === second.scrollTop &&
    first.memory?.query === second.memory?.query &&
    first.memory?.scrollTop === second.memory?.scrollTop &&
    first.concept?.selectedConceptId === second.concept?.selectedConceptId &&
    first.concept?.query === second.concept?.query &&
    first.concept?.profileScrollTop === second.concept?.profileScrollTop &&
    areMapTransformsEqual(first.concept?.mapTransform, second.concept?.mapTransform) &&
    first.capture?.mode === second.capture?.mode &&
    first.capture?.scrollTop === second.capture?.scrollTop
  );
}

export function areMapTransformsEqual(
  first: WorkspaceMapTransform | undefined,
  second: WorkspaceMapTransform | undefined,
) {
  if (!first || !second) {
    return first === second;
  }

  return (
    areNearlyEqual(first.scale, second.scale) &&
    areNearlyEqual(first.x, second.x) &&
    areNearlyEqual(first.y, second.y)
  );
}

function areNearlyEqual(first: number, second: number) {
  return Math.abs(first - second) < 0.0001;
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
    const key = `existing:${suggestion.conceptId}`;
    const current = merged.get(key);
    merged.set(
      key,
      current ? mergeExistingConceptSuggestionMetadata(suggestion, current) : suggestion,
    );
  }

  for (const suggestion of selectedEmergingConcepts) {
    merged.set(`emerging:${suggestion.candidateId}`, suggestion);
  }

  return Array.from(merged.values());
}

function mergeExistingConceptSuggestionMetadata(
  base: ExistingConceptSuggestion,
  source: ConceptSuggestion,
): ExistingConceptSuggestion {
  if (source.kind !== "existing") {
    return base;
  }

  return {
    ...base,
    evidenceCaptureIds: mergeUniqueStrings(
      base.evidenceCaptureIds,
      source.evidenceCaptureIds,
    ),
    matchedTerms: mergeUniqueStrings(base.matchedTerms, source.matchedTerms),
    matchedAlias: base.matchedAlias ?? source.matchedAlias,
    knowledgeSuggestionKind:
      base.knowledgeSuggestionKind ?? source.knowledgeSuggestionKind,
    knowledgeSuggestionReasons: mergeUniqueStrings(
      base.knowledgeSuggestionReasons ?? [],
      source.knowledgeSuggestionReasons ?? [],
    ),
  };
}

function mergeUniqueStrings(first: string[], second: string[]) {
  return Array.from(new Set([...first, ...second]));
}

function enrichVisibleConceptSuggestions(
  visibleSuggestions: ConceptSuggestion[],
  latestSuggestions: ConceptSuggestion[],
) {
  const latestByKey = new Map(
    latestSuggestions.map((suggestion) => [
      getConceptSuggestionSnapshotKey(suggestion),
      suggestion,
    ]),
  );
  let changed = false;
  const enriched = visibleSuggestions.map((suggestion) => {
    const latest = latestByKey.get(getConceptSuggestionSnapshotKey(suggestion));

    if (!latest || suggestion.kind !== "existing" || latest.kind !== "existing") {
      return suggestion;
    }

    const merged = mergeExistingConceptSuggestionMetadata(suggestion, latest);

    if (!haveSameConceptSuggestionMetadata(suggestion, merged)) {
      changed = true;
    }

    return merged;
  });

  return changed ? enriched : visibleSuggestions;
}

function createEnrichedConceptPanelSnapshot({
  snapshot,
  latestConceptSuggestions,
  memorySuggestions,
  memoryLoading,
  memoryError,
}: {
  snapshot: PanelSnapshot;
  latestConceptSuggestions: ConceptSuggestion[];
  memorySuggestions: AssociationSuggestion[];
  memoryLoading: boolean;
  memoryError: boolean;
}) {
  const conceptSuggestions = enrichVisibleConceptSuggestions(
    snapshot.conceptSuggestions,
    latestConceptSuggestions,
  );

  if (conceptSuggestions === snapshot.conceptSuggestions) {
    return snapshot;
  }

  return {
    ...snapshot,
    signature: getPanelSignature("concepts", {
      conceptSuggestions,
      memorySuggestions,
      memoryLoading,
      memoryError,
    }),
    conceptSuggestions,
  };
}

function createResolvedMemoryPanelSnapshot({
  snapshot,
  memorySuggestions,
  memoryIdentities,
  memoryLoading,
  memoryError,
}: {
  snapshot: PanelSnapshot;
  memorySuggestions: AssociationSuggestion[];
  memoryIdentities: Map<string, CaptureEmergentIdentity>;
  memoryLoading: boolean;
  memoryError: boolean;
}) {
  const staleLoadingSnapshot =
    snapshot.memoryLoading &&
    (memorySuggestions.length > 0 || !memoryLoading || memoryError);

  if (!staleLoadingSnapshot) {
    return snapshot;
  }

  return {
    ...snapshot,
    signature: getPanelSignature("memories", {
      conceptSuggestions: snapshot.conceptSuggestions,
      memorySuggestions,
      memoryLoading,
      memoryError,
    }),
    memorySuggestions,
    memoryIdentities: new Map(memoryIdentities),
    memoryLoading,
    memoryError,
  };
}

function haveSameConceptSuggestionMetadata(
  first: ExistingConceptSuggestion,
  second: ExistingConceptSuggestion,
) {
  return (
    first.matchedAlias === second.matchedAlias &&
    first.knowledgeSuggestionKind === second.knowledgeSuggestionKind &&
    haveSameStrings(
      first.knowledgeSuggestionReasons ?? [],
      second.knowledgeSuggestionReasons ?? [],
    ) &&
    haveSameStrings(first.evidenceCaptureIds, second.evidenceCaptureIds) &&
    haveSameStrings(first.matchedTerms, second.matchedTerms)
  );
}

function haveSameStrings(first: string[], second: string[]) {
  return first.length === second.length && first.every((item, index) => item === second[index]);
}

function getConceptSuggestionSnapshotKey(suggestion: ConceptSuggestion) {
  return suggestion.kind === "existing"
    ? `existing:${suggestion.conceptId}`
    : `emerging:${suggestion.candidateId}`;
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

function createPanelSnapshot(
  panel: Exclude<ActivePanel, null>,
  state: {
    conceptSuggestions: ConceptSuggestion[];
    memorySuggestions: AssociationSuggestion[];
    memoryIdentities: Map<string, CaptureEmergentIdentity>;
    memoryLoading: boolean;
    memoryError: boolean;
  },
): PanelSnapshot {
  return {
    panel,
    signature: getPanelSignature(panel, state),
    conceptSuggestions: state.conceptSuggestions,
    memorySuggestions: state.memorySuggestions,
    memoryIdentities: new Map(state.memoryIdentities),
    memoryLoading: state.memoryLoading,
    memoryError: state.memoryError,
  };
}

function getPanelSignature(
  panel: Exclude<ActivePanel, null>,
  state: {
    conceptSuggestions: ConceptSuggestion[];
    memorySuggestions: AssociationSuggestion[];
    memoryLoading: boolean;
    memoryError: boolean;
  },
) {
  if (panel === "concepts") {
    return state.conceptSuggestions
      .map((suggestion) => {
        if (suggestion.kind === "existing") {
          return [
            "existing",
            suggestion.conceptId,
            suggestion.label,
            suggestion.matchedAlias ?? "",
            suggestion.knowledgeSuggestionKind ?? "",
            ...(suggestion.knowledgeSuggestionReasons ?? []),
          ].join(":");
        }

        return `emerging:${suggestion.candidateId}:${suggestion.suggestedLabel}`;
      })
      .join("|");
  }

  if (panel === "memories") {
    return [
      state.memoryLoading ? "loading" : "idle",
      state.memoryError ? "error" : "ok",
      ...state.memorySuggestions.map((suggestion) => suggestion.node.id),
    ].join("|");
  }

  return "preferences";
}

function CanvasPanelIconButton({
  active,
  pressed,
  icon,
  panelId,
  indicatorPanel,
  label,
  memoryStatusTrigger = false,
  preferencesTrigger = false,
  onHover,
  onHoverEnd,
  onClick,
  children,
}: {
  active: boolean;
  pressed: boolean;
  icon: "concepts" | "memories" | "preferences" | "memoryStatus";
  panelId: string;
  indicatorPanel?: "concepts" | "memories";
  label: string;
  memoryStatusTrigger?: boolean;
  preferencesTrigger?: boolean;
  onHover: () => void;
  onHoverEnd: () => void;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      aria-expanded={active}
      aria-controls={panelId}
      title={label}
      data-canvas-panel-trigger=""
      data-canvas-preferences-trigger={preferencesTrigger ? "" : undefined}
      data-memory-sync-trigger={memoryStatusTrigger ? "" : undefined}
      data-context-indicator={indicatorPanel ? "" : undefined}
      data-context-indicator-panel={indicatorPanel}
      data-canvas-panel-active={active ? "" : undefined}
      data-canvas-panel-pinned={pressed ? "" : undefined}
      className={cn(
        "relative inline-flex h-10 w-10 min-w-10 items-center justify-center rounded-full outline-none transition-[background-color,color,box-shadow,transform] duration-[180ms] hover:scale-[1.04] hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-zinc-400 active:scale-95 motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100",
        pressed || active ? "shadow-[inset_0_0_0_1px_currentColor]" : "",
        getRailIconColorClassName({ icon, active, surface: "rail" }),
      )}
      onMouseEnter={onHover}
      onMouseLeave={onHoverEnd}
      onFocus={onHover}
      onBlur={onHoverEnd}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function CanvasRailWorkspaceButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      data-canvas-panel-trigger=""
      data-canvas-workspace-trigger=""
      data-canvas-workspace-active={active ? "" : undefined}
      className={cn(
        "relative inline-flex h-10 w-10 min-w-10 items-center justify-center rounded-full outline-none transition-[background-color,color,box-shadow,transform] duration-[180ms] hover:scale-[1.04] hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-zinc-400 active:scale-95 motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100",
        active
          ? "bg-zinc-100 text-zinc-950 shadow-[inset_0_0_0_1px_currentColor] hover:text-zinc-950"
          : "text-[color:var(--vinema-text-muted)] hover:text-[color:var(--vinema-text-secondary)]",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function CanvasContextualLayer({
  visiblePanel,
  pinnedPanel,
  previewClosing,
  showMemoryIndicator,
  showConceptIndicator,
  conceptCount,
  displayedPanelSnapshot,
  selectedContextIds,
  selectedEmergingCandidateIds,
  highlightedConceptKeys,
  associationRetry,
  onActivatePreviewPanel,
  onLeavePreviewTrigger,
  onEnterPreviewSurface,
  onLeavePreviewSurface,
  onOpenPanel,
  onClosePanels,
  onToggleExisting,
  onToggleEmerging,
  onOpenCapture,
}: {
  visiblePanel: ActivePanel;
  pinnedPanel: ActivePanel;
  previewClosing: boolean;
  showMemoryIndicator: boolean;
  showConceptIndicator: boolean;
  conceptCount: number;
  displayedPanelSnapshot: PanelSnapshot | null;
  selectedContextIds: string[];
  selectedEmergingCandidateIds: string[];
  highlightedConceptKeys: Set<string>;
  associationRetry: () => void;
  onActivatePreviewPanel: (panel: ToolPanel) => void;
  onLeavePreviewTrigger: (panel: ToolPanel) => void;
  onEnterPreviewSurface: (panel: ToolPanel, part: ContextHoverPart) => void;
  onLeavePreviewSurface: (panel: ToolPanel, part: ContextHoverPart) => void;
  onOpenPanel: (panel: ToolPanel) => void;
  onClosePanels: () => void;
  onToggleExisting: (contextId: string) => void;
  onToggleEmerging: (candidateId: string) => void;
  onOpenCapture: (nodeId: string) => void | Promise<void>;
}) {
  const contextPanelVisible = isContextualCanvasPanel(visiblePanel);
  const hasContextButtons = showMemoryIndicator || showConceptIndicator;

  if (!hasContextButtons && !contextPanelVisible) {
    return null;
  }

  return (
    <div
      className={cn(
        "absolute inset-x-[var(--vinema-canvas-padding-x)] top-[calc(var(--vinema-canvas-padding-y)+1rem)] z-20 flex min-w-0 flex-col items-center",
        contextPanelVisible ? "pointer-events-auto gap-2" : "pointer-events-none",
      )}
      data-canvas-context-layer=""
      data-canvas-panel-interaction-region={contextPanelVisible ? "" : undefined}
      onPointerEnter={() => {
        if (contextPanelVisible) {
          onEnterPreviewSurface(visiblePanel, "corridor");
        }
      }}
      onPointerLeave={() => {
        if (contextPanelVisible) {
          onLeavePreviewSurface(visiblePanel, "corridor");
        }
      }}
      onFocus={() => {
        if (contextPanelVisible) {
          onEnterPreviewSurface(visiblePanel, "corridor");
        }
      }}
      onBlur={(event) => {
        if (
          contextPanelVisible &&
          !(event.relatedTarget instanceof Element &&
            event.currentTarget.contains(event.relatedTarget))
        ) {
          onLeavePreviewSurface(visiblePanel, "corridor");
        }
      }}
    >
      {hasContextButtons ? (
        <div
          className="pointer-events-auto flex max-w-full items-center justify-center gap-1.5"
          data-canvas-context-bar=""
        >
          {showMemoryIndicator ? (
            <CanvasContextualButton
              active={visiblePanel === "memories"}
              pressed={pinnedPanel === "memories"}
              icon="memories"
              panelId="canvas-tool-panel"
              indicatorPanel="memories"
              label="Memoria"
              onHover={() => onActivatePreviewPanel("memories")}
              onHoverEnd={() => onLeavePreviewTrigger("memories")}
              onClick={() => onOpenPanel("memories")}
            >
              <Lightbulb
                className="h-4 w-4"
                aria-hidden="true"
                data-canvas-rail-icon="lightbulb"
              />
              <span>Memoria</span>
            </CanvasContextualButton>
          ) : null}
          {showConceptIndicator ? (
            <CanvasContextualButton
              active={visiblePanel === "concepts"}
              pressed={pinnedPanel === "concepts"}
              icon="concepts"
              panelId="canvas-tool-panel"
              indicatorPanel="concepts"
              label={`${conceptCount} conceptos sugeridos`}
              onHover={() => onActivatePreviewPanel("concepts")}
              onHoverEnd={() => onLeavePreviewTrigger("concepts")}
              onClick={() => onOpenPanel("concepts")}
            >
              <Brain
                className="h-4 w-4"
                aria-hidden="true"
                data-canvas-rail-icon="concepts"
              />
              <span>Conceptos</span>
            </CanvasContextualButton>
          ) : null}
        </div>
      ) : null}
      {contextPanelVisible ? (
        <div
          className="pointer-events-auto flex max-w-full justify-center"
          data-canvas-context-panel-anchor=""
          onPointerEnter={() => onEnterPreviewSurface(visiblePanel, "panel")}
          onPointerLeave={() => onLeavePreviewSurface(visiblePanel, "panel")}
        >
          <CanvasSidePanel
            title={getActivePanelTitle(visiblePanel)}
            panel={visiblePanel}
            pinned={pinnedPanel === visiblePanel}
            closing={previewClosing}
            onClose={onClosePanels}
          >
            {visiblePanel === "concepts" && displayedPanelSnapshot ? (
              <>
                <ConceptPanelContent
                  suggestions={displayedPanelSnapshot.conceptSuggestions}
                  selectedContextIds={selectedContextIds}
                  selectedEmergingCandidateIds={selectedEmergingCandidateIds}
                  highlightedConceptKeys={highlightedConceptKeys}
                  onToggleExisting={onToggleExisting}
                  onToggleEmerging={onToggleEmerging}
                />
              </>
            ) : null}
            {visiblePanel === "memories" && displayedPanelSnapshot ? (
              <MemoryPanelContent
                suggestions={displayedPanelSnapshot.memorySuggestions}
                loading={displayedPanelSnapshot.memoryLoading}
                error={displayedPanelSnapshot.memoryError}
                onRetry={associationRetry}
                onOpenCapture={onOpenCapture}
              />
            ) : null}
          </CanvasSidePanel>
        </div>
      ) : null}
    </div>
  );
}

function CanvasContextualButton({
  active,
  pressed,
  icon,
  panelId,
  indicatorPanel,
  label,
  onHover,
  onHoverEnd,
  onClick,
  children,
}: {
  active: boolean;
  pressed: boolean;
  icon: "concepts" | "memories";
  panelId: string;
  indicatorPanel: "concepts" | "memories";
  label: string;
  onHover: () => void;
  onHoverEnd: () => void;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      aria-expanded={active}
      aria-controls={panelId}
      title={label}
      data-canvas-panel-trigger=""
      data-context-indicator=""
      data-context-indicator-panel={indicatorPanel}
      data-canvas-panel-active={active ? "" : undefined}
      data-canvas-panel-pinned={pressed ? "" : undefined}
      className={cn(
        "inline-flex h-8 max-w-full items-center gap-1.5 rounded-full px-2.5 text-xs font-medium outline-none transition-[background-color,color,opacity,transform] duration-[160ms] hover:scale-[1.03] hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-zinc-400 active:scale-95 motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100",
        getRailIconColorClassName({ icon, active, surface: "contextual" }),
      )}
      onPointerEnter={onHover}
      onPointerLeave={onHoverEnd}
      onFocus={onHover}
      onBlur={onHoverEnd}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function getRailIconColorClassName({
  icon,
  active,
  surface = "rail",
}: {
  icon: "concepts" | "memories" | "preferences" | "memoryStatus";
  active: boolean;
  surface?: "rail" | "contextual";
}) {
  const inactiveOpacity = surface === "contextual" ? "opacity-90 hover:opacity-100" : "";
  const inactiveZinc =
    "text-[color:var(--vinema-text-muted)] hover:text-[color:var(--vinema-text-secondary)]";
  const colorByIcon = {
    concepts: active
      ? "bg-indigo-50 text-indigo-600 hover:text-indigo-600"
      : cn(
          surface === "contextual"
            ? "text-[color:color-mix(in_srgb,var(--vinema-accent-indigo)_88%,var(--vinema-text-muted))] hover:text-[color:var(--vinema-accent-indigo)]"
            : "text-[color:color-mix(in_srgb,var(--vinema-accent-indigo)_78%,var(--vinema-text-muted))] hover:text-[color:var(--vinema-accent-indigo)]",
          inactiveOpacity,
        ),
    memories: active
      ? "bg-amber-50 text-amber-600 hover:text-amber-600"
      : cn(
          surface === "contextual"
            ? "text-[color:color-mix(in_srgb,var(--vinema-accent-amber)_82%,var(--vinema-text-muted))] hover:text-[color:var(--vinema-accent-amber)]"
            : "text-[color:color-mix(in_srgb,var(--vinema-accent-amber)_78%,var(--vinema-text-muted))] hover:text-[color:var(--vinema-accent-amber)]",
          inactiveOpacity,
        ),
    preferences: active
      ? "bg-zinc-100 text-zinc-950 hover:text-zinc-950"
      : cn(inactiveZinc, inactiveOpacity),
    memoryStatus: active
      ? "bg-zinc-100 text-zinc-950 hover:text-zinc-950"
      : cn(inactiveZinc, inactiveOpacity),
  } satisfies Record<typeof icon, string>;

  return colorByIcon[icon];
}

function CanvasSidePanel({
  title,
  panel,
  pinned,
  closing,
  onClose,
  children,
}: {
  title: string;
  panel: ToolPanel;
  pinned: boolean;
  closing: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <aside
      id="canvas-tool-panel"
      role="dialog"
      aria-modal="false"
      aria-label={title}
      data-canvas-side-panel=""
      data-canvas-side-panel-active={panel}
      data-panel-mode={pinned ? "pinned" : "preview"}
      data-panel-state={closing ? "closing" : "open"}
      className={cn(
        "box-border flex max-h-[var(--vinema-canvas-panel-max-height)] min-w-[var(--vinema-canvas-panel-min-width)] max-w-[calc(100vw-var(--vinema-canvas-icon-width)-var(--vinema-canvas-panel-gutter)-1rem)] origin-left flex-col overflow-hidden rounded-lg border border-zinc-200/70 bg-white/95 shadow-[0_10px_32px_rgba(24,24,27,0.08)] transition-[opacity,transform] ease-out motion-reduce:scale-100 motion-reduce:transition-none",
        "w-[var(--vinema-canvas-panel-preferred-width)]",
        closing
          ? "scale-100 opacity-0 duration-240"
          : "animate-[vinema-panel-enter_150ms_ease-out] scale-100 opacity-100 duration-150 motion-reduce:animate-none",
        closing ? "pointer-events-none" : "pointer-events-auto",
      )}
    >
      <header
        className="pointer-events-auto flex shrink-0 items-center gap-3 px-5 pb-2 pt-4"
        data-canvas-side-panel-header=""
      >
        <h2 className="min-w-0 flex-1 text-sm font-medium text-zinc-950">
          {title}
        </h2>
        {pinned ? (
          <button
            type="button"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 outline-none hover:bg-zinc-100 hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
            aria-label="Cerrar panel"
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </header>
      <div
        className="vinema-scrollbar pointer-events-auto min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-5 pb-4 pt-1 [overflow-wrap:anywhere]"
        data-canvas-side-panel-content=""
      >
        {children}
      </div>
    </aside>
  );
}

function getActivePanelTitle(panel: ActivePanel) {
  switch (panel) {
    case "concepts":
      return "Conceptos detectados";
    case "memories":
      return "Me recuerda a…";
    case "preferences":
      return "Configuración del Canvas";
    case "memoryStatus":
      return "Estado";
    case null:
      return "Panel del canvas";
  }
}

function isPanelAvailable({
  panel,
  showConceptIndicator,
  showMemoryIndicator,
}: {
  panel: ActivePanel;
  showConceptIndicator: boolean;
  showMemoryIndicator: boolean;
}) {
  if (panel === "concepts") {
    return showConceptIndicator;
  }

  if (panel === "memories") {
    return showMemoryIndicator;
  }

  return true;
}

function isContextualCanvasPanel(panel: ActivePanel): panel is "concepts" | "memories" {
  return panel === "concepts" || panel === "memories";
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

export function ConceptPanelContent({
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
  const explanation = getConceptSuggestionExplanation(suggestion);

  return (
    <div
      data-concept-suggestion-row=""
      data-concept-suggestion-id={getConceptSuggestionId(suggestion)}
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
          {explanation ? (
            <span
              className={cn(
                "block text-xs leading-snug [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden",
                selected ? "text-zinc-300" : "text-zinc-500",
              )}
              data-concept-suggestion-explanation=""
            >
              {explanation}
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

function getConceptSuggestionExplanation(suggestion: ConceptSuggestion) {
  if (suggestion.kind !== "existing") {
    return null;
  }

  const usefulAlias = getUsefulDetectedAlias(suggestion);

  if (usefulAlias) {
    return `Detectado como ${usefulAlias}`;
  }

  return (
    suggestion.knowledgeSuggestionReasons?.find(isVisibleSuggestionReason) ?? null
  );
}

function isVisibleSuggestionReason(reason: string) {
  const normalizedReason = reason.trim();

  return (
    normalizedReason.length > 0 &&
    normalizedReason !== "Concepto detectado en el texto" &&
    normalizedReason !== "Alias detectado en el texto"
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
  loading,
  error,
  onRetry,
  onOpenCapture,
}: {
  suggestions: AssociationSuggestion[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onOpenCapture: (nodeId: string) => void | Promise<void>;
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
    </div>
  );
}

function MemoryResult({
  node,
  onOpenCapture,
}: {
  node: Node;
  onOpenCapture: (nodeId: string) => void | Promise<void>;
}) {
  const preview = getCapturePreview(node.content, { maxLength: 180 });

  return (
    <article className="min-w-0 rounded-md text-sm leading-5 text-zinc-700">
      <Link
        href={getNodeDetailPath(node.id, { returnTo: "/" })}
        aria-label={`Abrir recuerdo: ${preview}`}
        title={preview}
        className="block min-w-0 rounded-md px-3 py-1.5 outline-none hover:bg-zinc-50 hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
        onClick={(event) => {
          event.preventDefault();
          void onOpenCapture(node.id);
        }}
      >
        <span className="block min-w-0 truncate text-zinc-800">{preview}</span>
        <time className="mt-0.5 block text-xs text-zinc-400">
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
