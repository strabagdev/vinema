"use client";

import { SendHorizontal, SquarePen } from "lucide-react";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { Device } from "@/domain/device/device";
import type { Workspace } from "@/domain/workspace/workspace";
import { CaptureRecoveryResults } from "@/features/associations/capture-recovery-results";
import { useAssociationSuggestions } from "@/features/associations/use-association-suggestions";
import {
  loadCaptureDraft,
  saveCaptureDraft,
} from "@/features/capture/capture-draft";
import {
  CAPTURE_DRAFT_DEBOUNCE_MS,
  commitCaptureText,
} from "@/features/capture/capture-flow";
import type { CaptureEmergentIdentity } from "@/features/identity/capture-emergent-identity";
import { loadCaptureEmergentIdentities } from "@/features/identity/load-capture-emergent-identities";
import type { SearchNodesRepositories } from "@/features/recovery/search-nodes";
import type { StorageAdapter } from "@/infrastructure/storage/storage-adapter";

type DraftStatus = "idle" | "loading" | "saving" | "saved" | "error";
const EMPTY_SELECTED_CAPTURE_IDS: string[] = [];
const EMPTY_SELECTED_CONTEXT_IDS: string[] = [];

export type QuickCaptureSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenFullCapture: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  device: Device;
  workspace: Workspace;
  storage: StorageAdapter;
  repositories: SearchNodesRepositories;
};

export function QuickCaptureSheet({
  open,
  onOpenChange,
  onOpenFullCapture,
  returnFocusRef,
  device,
  workspace,
  storage,
  repositories,
}: QuickCaptureSheetProps) {
  const [content, setContent] = useState("");
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftStatus, setDraftStatus] = useState<DraftStatus>("idle");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [captureFeedback, setCaptureFeedback] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [memoryIdentities, setMemoryIdentities] = useState<
    Map<string, CaptureEmergentIdentity>
  >(new Map());
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePromiseRef = useRef<Promise<unknown> | null>(null);
  const captureInFlightRef = useRef(false);
  const shouldRestoreFocusRef = useRef(true);

  const restoreDraft = useCallback(async () => {
    setDraftStatus("loading");
    setDraftError(null);

    try {
      const draft = await loadCaptureDraft(storage);
      setContent(draft?.content ?? "");
      setDraftStatus(draft ? "saved" : "idle");
    } catch {
      setDraftStatus("error");
      setDraftError("Error al cargar el borrador.");
    } finally {
      setDraftLoaded(true);
    }
  }, [storage]);
  const associationState = useAssociationSuggestions({
    text: open ? content : "",
    workspaceId: workspace.id,
    selectedCaptureIds: EMPTY_SELECTED_CAPTURE_IDS,
    selectedContextIds: EMPTY_SELECTED_CONTEXT_IDS,
    contextRepository: repositories.contextRepository,
    nodeRepository: repositories.nodeRepository,
    relationRepository: repositories.nodeContextRelationRepository,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadMemoryIdentities() {
      const identities = await loadCaptureEmergentIdentities(
        {
          contextRepository: repositories.contextRepository,
          nodeContextRelationRepository: repositories.nodeContextRelationRepository,
        },
        associationState.suggestions.map((suggestion) => suggestion.node.id),
      );

      if (!cancelled) {
        setMemoryIdentities(identities);
      }
    }

    if (!open || associationState.suggestions.length === 0) {
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
    associationState.suggestions,
    open,
    repositories.contextRepository,
    repositories.nodeContextRelationRepository,
  ]);

  useEffect(() => {
    if (!open) {
      return;
    }

    queueMicrotask(() => {
      setDraftLoaded(false);
      setCaptureError(null);
      setCaptureFeedback(null);
      void restoreDraft();
    });
  }, [open, restoreDraft]);

  useEffect(() => {
    if (!open || !draftLoaded) {
      return;
    }

    const timer = setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);

    return () => clearTimeout(timer);
  }, [draftLoaded, open]);

  useEffect(() => {
    if (!open || !draftLoaded) {
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      const savePromise = saveCaptureDraft(storage, content)
        .then((draft) => {
          setDraftStatus(draft ? "saved" : "idle");
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
  }, [content, draftLoaded, open, storage]);

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);

    if (!nextOpen && shouldRestoreFocusRef.current) {
      setTimeout(() => {
        returnFocusRef?.current?.focus();
      }, 0);
    }

    shouldRestoreFocusRef.current = true;
  }

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
        relationRepository: repositories.nodeContextRelationRepository,
        storage,
      });

      setContent("");
      setDraftStatus("idle");
      setCaptureFeedback(
        result.relationError
          ? "Captura guardada. Algunas asociaciones no pudieron persistirse."
          : "Captura guardada en la Base de Conocimiento.",
      );
      handleOpenChange(false);
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

  async function handleOpenFullCapture() {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    try {
      await savePromiseRef.current;
      await saveCaptureDraft(storage, content);
    } catch {
      setDraftStatus("error");
      setDraftError("Error al guardar el borrador.");
      return;
    }

    shouldRestoreFocusRef.current = false;
    onOpenFullCapture();
  }

  async function persistCurrentDraft() {
    if (!content.trim()) {
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    await saveCaptureDraft(storage, content);
    setDraftStatus("saved");
    setDraftError(null);
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        className="left-auto right-0 flex w-full max-w-full flex-col border-l border-r-0 sm:w-[28rem] sm:max-w-[90vw]"
        aria-describedby="quick-capture-description"
      >
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-6">
          <div className="space-y-2 pr-8">
            <SheetTitle className="flex items-center gap-2 text-lg font-semibold text-zinc-950">
              <SquarePen className="h-5 w-5" />
              Capturar
            </SheetTitle>
            <SheetDescription
              id="quick-capture-description"
              className="text-sm leading-6 text-zinc-500"
            >
              Borrador compartido. Ctrl+Shift+K o Cmd+Shift+K.
            </SheetDescription>
          </div>

          <div className="flex flex-1 flex-col gap-3">
            <label htmlFor="quick-capture-editor" className="sr-only">
              Capturar contenido
            </label>
            <Textarea
              id="quick-capture-editor"
              ref={textareaRef}
              className="min-h-56 flex-1 resize-y text-base leading-7"
              placeholder="Escribe lo que quieras recordar..."
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
            <CaptureRecoveryResults
              suggestions={associationState.suggestions}
              loading={associationState.status === "loading"}
              error={associationState.error}
              identities={memoryIdentities}
              onRetry={associationState.retry}
              onOpenCapture={persistCurrentDraft}
            />

            <div className="min-h-5 text-sm text-zinc-500" aria-live="polite">
              {draftStatus === "loading" ? "Cargando borrador" : null}
              {draftStatus === "saving" ? "Guardando borrador" : null}
              {draftStatus === "saved" ? "Borrador guardado" : null}
              {draftStatus === "error" ? "Error al guardar" : null}
              {draftError ? `: ${draftError}` : null}
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

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleOpenFullCapture()}
            >
              Abrir captura completa
            </Button>
            <SheetClose asChild>
              <Button type="button" variant="ghost">
                Cerrar
              </Button>
            </SheetClose>
            <Button
              type="button"
              onClick={() => void handleCapture()}
              disabled={capturing || !content.trim()}
            >
              <SendHorizontal className="h-4 w-4" />
              {capturing ? "Capturando" : "Capturar"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
