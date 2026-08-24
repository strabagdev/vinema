"use client";

import Link from "next/link";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VisualFeedbackWordmark, useVisualFeedback } from "@/features/feedback/visual-feedback-provider";
import { useAuth } from "@/features/auth/auth-provider";
import { getPublicApiUrl } from "@/features/auth/public-api-url";
import {
  loadMemorySyncSnapshot,
  recordMemoryVerificationResult,
  type MemorySyncSnapshot,
} from "@/features/sync/observability/memory-sync-observability";
import {
  deriveMemoryHealthPresentation,
  type MemoryHealthPresentation,
  type MemoryHealthPresentationSeverity,
} from "@/features/sync/observability/memory-health-presentation";
import { loadMemoryConflictDiagnostic } from "@/features/sync/observability/memory-conflict-diagnostic";
import {
  listCaptureConflicts,
  resolveCaptureConflict,
  type CaptureConflictSummary,
} from "@/features/sync/conflict-resolution";
import { createSyncClient } from "@/features/sync/sync-client";
import { syncEventBuffer } from "@/features/sync/observability/sync-event-buffer";
import {
  createMemoryReconciliationEngine,
  type MemoryReconciliationResult,
} from "@/features/sync/reconciliation";
import { cn } from "@/lib/cn";

export function MemorySyncStatusPanel({
  variant = "standalone",
  onClose,
}: {
  variant?: "standalone" | "rail-panel";
  onClose?: () => void;
} = {}) {
  const auth = useAuth();
  const feedback = useVisualFeedback();
  const standalone = variant === "standalone";
  const [standaloneOpen, setStandaloneOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<MemorySyncSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifyingMemory, setVerifyingMemory] = useState(false);
  const [reconciliation, setReconciliation] =
    useState<MemoryReconciliationResult | null>(null);
  const [exportingConflicts, setExportingConflicts] = useState(false);
  const [captureConflicts, setCaptureConflicts] = useState<CaptureConflictSummary[]>([]);
  const [resolvingConflict, setResolvingConflict] = useState(false);
  const [mergeContent, setMergeContent] = useState("");
  const [showMergeEditor, setShowMergeEditor] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [lastVerificationMessage, setLastVerificationMessage] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const canOpen = auth.isAuthenticated && Boolean(auth.workspaceId && auth.deviceId);
  const presentation = deriveMemoryHealthPresentation({
    health: snapshot?.health ?? null,
    syncState: auth.syncState,
    verifying: verifyingMemory,
    localError,
  });

  const refreshSnapshot = useCallback(async () => {
    setLoading(true);
    try {
      const next = await loadMemorySyncSnapshot({
        workspaceId: auth.workspaceId,
        deviceId: auth.deviceId,
        syncState: auth.syncState,
      });
      setSnapshot(next);
      setLocalError(null);
    } catch {
      setLocalError("No fue posible leer el estado local de memoria.");
    } finally {
      setLoading(false);
    }
  }, [auth.deviceId, auth.syncState, auth.workspaceId]);

  const closePanel = useCallback(() => {
    if (standalone) {
      setStandaloneOpen(false);
      queueMicrotask(() => {
        triggerRef.current?.focus();
      });
      return;
    }

    onClose?.();
  }, [onClose, standalone]);
  const open = standalone ? standaloneOpen : true;

  useEffect(() => {
    if (!open) {
      return;
    }

    queueMicrotask(() => {
      void refreshSnapshot();
    });
    return syncEventBuffer.subscribe(() => {
      queueMicrotask(() => {
        void refreshSnapshot();
      });
    });
  }, [open, refreshSnapshot]);

  useEffect(() => {
    if (!open || !snapshot) {
      return;
    }

    queueMicrotask(() => {
      closeButtonRef.current?.focus();
    });
  }, [open, snapshot]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closePanel();
        return;
      }

      if (event.key === "Tab") {
        trapDialogFocus(event, dialogRef.current);
      }
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        panelRef.current &&
        event.target instanceof Node &&
        !panelRef.current.contains(event.target)
      ) {
        closePanel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [closePanel, open]);

  async function handleVerifyMemory() {
    if (!auth.workspaceId || !auth.deviceId || verifyingMemory) {
      return;
    }

    if (auth.syncState.connectivity === "OFFLINE" || navigator.onLine === false) {
      feedback.offline();
      setLocalError(null);
      return;
    }

    setVerifyingMemory(true);
    setLastVerificationMessage("Verificando memoria...");
    setLocalError(null);
    feedback.dismissKind("error");
    feedback.syncing();
    try {
      const engine = createMemoryReconciliationEngine({
        runSync: async () => {
          setLastVerificationMessage("Actualizando memoria...");
          await auth.syncNow();
        },
      });
      setLastVerificationMessage("Revisando memoria...");
      const result = await engine.reconcile({
        workspaceId: auth.workspaceId,
        deviceId: auth.deviceId,
        syncState: auth.syncState,
      });
      setReconciliation(result);
      if (result.status === "MEMORY_INTEGRAL") {
        await recordMemoryVerificationResult({
          workspaceId: auth.workspaceId,
          deviceId: auth.deviceId,
          status: "PASSED",
        });
        feedback.synced();
      } else if (result.status === "OFFLINE") {
        feedback.offline();
      } else if (result.status === "CONFLICT" || result.status === "DIVERGENCE_DETECTED") {
        await recordMemoryVerificationResult({
          workspaceId: auth.workspaceId,
          deviceId: auth.deviceId,
          status: "FAILED",
          errorMessage: getReconciliationStatusMessage(result.status),
        });
        feedback.dismissKind("syncing");
      } else {
        await recordMemoryVerificationResult({
          workspaceId: auth.workspaceId,
          deviceId: auth.deviceId,
          status: "FAILED",
          errorMessage: getReconciliationStatusMessage(result.status),
        });
        feedback.success("Verificacion completada");
      }
      await refreshSnapshot();
    } catch {
      await recordMemoryVerificationResult({
        workspaceId: auth.workspaceId,
        deviceId: auth.deviceId,
        status: "FAILED",
        errorMessage: "No fue posible verificar la memoria.",
      }).catch(() => undefined);
      feedback.error("No fue posible verificar la memoria.");
      setLocalError("No fue posible verificar la memoria.");
    } finally {
      setVerifyingMemory(false);
      setLastVerificationMessage(null);
    }
  }

  async function handleExportConflictDiagnostic() {
    if (!auth.workspaceId || exportingConflicts) {
      return;
    }

    setExportingConflicts(true);
    try {
      const diagnostic = await loadMemoryConflictDiagnostic(auth.workspaceId);
      downloadJson(
        `vinema-conflict-diagnostic-${new Date().toISOString()}.json`,
        diagnostic,
      );
      feedback.success("Diagnostico exportado");
    } catch {
      setLocalError("No fue posible exportar el diagnostico de conflictos.");
      feedback.error("No fue posible exportar el diagnostico.");
    } finally {
      setExportingConflicts(false);
    }
  }

  async function handleOpenConflictResolver() {
    if (!auth.workspaceId) {
      return;
    }

    const apiBaseUrl = getPublicApiUrl();
    const conflicts = await listCaptureConflicts(auth.workspaceId, {
      loadRemoteSnapshot: apiBaseUrl
        ? async ({ workspaceId, entityId }) => {
          const client = createSyncClient({
            baseUrl: apiBaseUrl,
            accessToken: auth.accessToken,
          });
          const capture = await client.getCapture({ workspaceId, entityId });
          return {
            ...capture,
            archivedAt: capture.archivedAt ?? null,
          };
        }
        : undefined,
    });
    setCaptureConflicts(conflicts);
    setShowMergeEditor(false);
    setMergeContent(conflicts[0]?.localContent ?? "");
  }

  function handleCancelConflictResolver() {
    setCaptureConflicts([]);
    setShowMergeEditor(false);
    setMergeContent("");
  }

  async function handleResolveCaptureConflict(
    strategy: "KEEP_LOCAL" | "KEEP_REMOTE" | "MERGE_MANUALLY",
  ) {
    const conflict = captureConflicts[0];
    if (!conflict || !auth.workspaceId || !auth.deviceId || resolvingConflict) {
      return;
    }

    if (
      strategy === "KEEP_REMOTE" &&
      !window.confirm("Esto reemplazara la version de este dispositivo por la version sincronizada.")
    ) {
      return;
    }

    setResolvingConflict(true);
    try {
      const result = await resolveCaptureConflict({
        workspaceId: auth.workspaceId,
        deviceId: auth.deviceId,
        entityId: conflict.entityId,
        strategy,
        mergedContent: mergeContent,
      });
      if (result.mutationCreated) {
        await auth.syncNow();
      }
      await refreshSnapshot();
      const conflicts = await listCaptureConflicts(auth.workspaceId);
      setCaptureConflicts(conflicts);
      setMergeContent(conflicts[0]?.localContent ?? "");
      setShowMergeEditor(false);
      feedback.success("Conflicto actualizado");
    } catch {
      setLocalError("No fue posible resolver el conflicto.");
      feedback.error("No fue posible resolver el conflicto.");
    } finally {
      setResolvingConflict(false);
    }
  }

  return (
    <div
      className={cn(
        standalone
          ? "relative flex h-10 w-16 items-center justify-center"
          : "h-full",
      )}
      ref={panelRef}
      data-memory-sync-status-panel={variant}
    >
      {standalone ? (
        <>
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-md px-2 text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            aria-label="Vinema"
          >
            <VisualFeedbackWordmark />
          </Link>
          <button
            ref={triggerRef}
            type="button"
            className="absolute left-1/2 ml-5 inline-flex h-6 w-6 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            aria-label="Abrir Estado de la memoria"
            aria-expanded={open}
            disabled={!canOpen}
            data-memory-sync-trigger=""
            onClick={() => {
              if (canOpen && !open) {
                setStandaloneOpen(true);
              }
            }}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                getMemoryStatusDotClass(presentation.severity),
              )}
              title={presentation.ariaLabel}
              aria-label={`Estado de la memoria: ${presentation.ariaLabel}`}
              data-memory-sync-status-dot=""
            />
          </button>
        </>
      ) : null}
      {open && snapshot ? (
        <MemorySyncPanelContent
          variant={variant}
          dialogRef={dialogRef}
          closeButtonRef={closeButtonRef}
          snapshot={snapshot}
          loading={loading}
          verifyingMemory={verifyingMemory}
          presentation={presentation}
          reconciliation={reconciliation}
          localError={localError}
          lastVerificationMessage={lastVerificationMessage}
          exportingConflicts={exportingConflicts}
          captureConflicts={captureConflicts}
          resolvingConflict={resolvingConflict}
          mergeContent={mergeContent}
          showMergeEditor={showMergeEditor}
          onClose={closePanel}
          onVerifyMemory={() => void handleVerifyMemory()}
          onExportConflictDiagnostic={() => void handleExportConflictDiagnostic()}
          onOpenConflictResolver={() => void handleOpenConflictResolver()}
          onResolveCaptureConflict={(strategy) =>
            void handleResolveCaptureConflict(strategy)
          }
          onRetryLoadConflict={() => void handleOpenConflictResolver()}
          onCancelConflict={handleCancelConflictResolver}
          onMergeContentChange={setMergeContent}
          onShowMergeEditor={() => setShowMergeEditor(true)}
        />
      ) : null}
    </div>
  );
}

function MemorySyncPanelContent({
  variant = "standalone",
  dialogRef,
  closeButtonRef,
  snapshot,
  loading,
  verifyingMemory,
  presentation,
  reconciliation,
  localError,
  lastVerificationMessage,
  exportingConflicts,
  captureConflicts,
  resolvingConflict,
  mergeContent,
  showMergeEditor,
  onClose,
  onVerifyMemory,
  onExportConflictDiagnostic,
  onOpenConflictResolver,
  onResolveCaptureConflict,
  onRetryLoadConflict,
  onCancelConflict,
  onMergeContentChange,
  onShowMergeEditor,
}: {
  variant?: "standalone" | "rail-panel";
  dialogRef: RefObject<HTMLElement | null>;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  snapshot: MemorySyncSnapshot;
  loading: boolean;
  verifyingMemory: boolean;
  presentation: MemoryHealthPresentation;
  reconciliation: MemoryReconciliationResult | null;
  localError: string | null;
  lastVerificationMessage: string | null;
  exportingConflicts: boolean;
  captureConflicts: CaptureConflictSummary[];
  resolvingConflict: boolean;
  mergeContent: string;
  showMergeEditor: boolean;
  onClose: () => void;
  onVerifyMemory: () => void;
  onExportConflictDiagnostic: () => void;
  onOpenConflictResolver: () => void;
  onResolveCaptureConflict: (
    strategy: "KEEP_LOCAL" | "KEEP_REMOTE" | "MERGE_MANUALLY",
  ) => void;
  onRetryLoadConflict: () => void;
  onCancelConflict: () => void;
  onMergeContentChange: (value: string) => void;
  onShowMergeEditor: () => void;
}) {
  const health = snapshot.health;
  const isOffline = presentation.status === "OFFLINE";
  const isLocalOnly = presentation.status === "LOCAL";
  const hasProblem =
    presentation.status === "PENDING" ||
    presentation.status === "ERROR" ||
    presentation.status === "REQUIRES_ATTENTION";

  return (
    <section
      ref={dialogRef}
      className={cn(
        "flex flex-col overflow-hidden bg-white text-left text-sm",
        variant === "standalone"
          ? "fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 max-h-[min(82dvh,42rem)] rounded-xl border border-zinc-200 shadow-xl md:absolute md:inset-auto md:left-1/2 md:top-full md:mt-2 md:w-96 md:max-w-[calc(100vw-1.5rem)] md:-translate-x-1/2"
          : "h-full max-h-full bg-transparent",
      )}
      aria-label="Estado de la memoria"
      aria-modal="true"
      role="dialog"
      tabIndex={-1}
      data-memory-sync-panel=""
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div>
          <h2 className="font-medium text-zinc-950">Estado de la memoria</h2>
          <p className="mt-1 text-sm text-zinc-700">
            {presentation.headline}
          </p>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100"
          aria-label="Cerrar Estado de la memoria"
          onClick={onClose}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div
        className="min-h-0 overflow-y-auto px-4 pb-4 pt-4"
        data-memory-sync-panel-body=""
      >
        <p className="text-xs text-zinc-500">
          Ultima verificacion {formatRelativeDate(health.lastVerificationAt)}
        </p>

        {localError ? (
          <p
            className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800"
          >
            {localError}
          </p>
        ) : null}
        {!localError && health.lastVerificationStatus === "FAILED" && health.lastVerificationError ? (
          <p
            className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800"
          >
            {health.lastVerificationError}
          </p>
        ) : null}
        {verifyingMemory && lastVerificationMessage ? (
          <p className="mt-3 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
            {lastVerificationMessage}
          </p>
        ) : null}
        {isOffline ? (
          <p className="mt-3 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
            Los cambios se guardaran y sincronizaran al volver.
          </p>
        ) : null}
        {isLocalOnly ? (
          <p className="mt-3 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
            Tus datos permanecen en este dispositivo.
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {health.conflictMutations > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onOpenConflictResolver}
            >
              Resolver
            </Button>
          ) : null}
          <Button
            size="sm"
            onClick={onVerifyMemory}
            disabled={verifyingMemory || loading || isOffline || isLocalOnly}
          >
            <RefreshCw className={cn("mr-2 h-3.5 w-3.5", verifyingMemory ? "animate-spin" : null)} />
            Verificar memoria
          </Button>
        </div>

        {captureConflicts[0] ? (
          <div className="mt-4">
            <CaptureConflictResolver
              conflict={captureConflicts[0]}
              resolving={resolvingConflict}
              mergeContent={mergeContent}
              showMergeEditor={showMergeEditor}
              onResolve={onResolveCaptureConflict}
              onRetryLoad={onRetryLoadConflict}
              onCancel={onCancelConflict}
              onMergeContentChange={onMergeContentChange}
              onShowMergeEditor={onShowMergeEditor}
            />
          </div>
        ) : null}

        {hasProblem ? (
          <details className="mt-4 rounded-lg border border-zinc-100 p-3">
            <summary className="cursor-pointer text-xs font-medium text-zinc-700">
              {health.status === "DIVERGED" || health.status === "ERROR"
                ? "Ver diagnostico"
                : "Ver detalles"}
            </summary>
            <div className="mt-3 space-y-3">
              <div className="grid gap-1 text-xs text-zinc-600">
                {health.pendingMutations > 0 ? (
                  <Metric label="Cambios pendientes" value={`${health.pendingMutations}`} />
                ) : null}
                {health.failedMutations > 0 ? (
                  <Metric label="Cambios con error" value={`${health.failedMutations}`} />
                ) : null}
                {health.conflictMutations > 0 ? (
                  <Metric
                    label={getConflictAttentionLabel(health)}
                    value={`${health.conflictMutations}`}
                  />
                ) : null}
              </div>
              {health.conflictMutations > 0 ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={onExportConflictDiagnostic}
                    disabled={exportingConflicts}
                  >
                    Exportar diagnostico
                  </Button>
                </div>
              ) : null}
              {reconciliation ? <ReconciliationSummary reconciliation={reconciliation} /> : null}
              <RecentEvents events={health.recentEvents} />
            </div>
          </details>
        ) : null}
      </div>
    </section>
  );
}

function trapDialogFocus(event: KeyboardEvent, dialog: HTMLElement | null) {
  if (!dialog) {
    return;
  }

  const focusable = Array.from(
    dialog.querySelectorAll<HTMLElement>(
      [
        "a[href]",
        "button:not([disabled])",
        "textarea:not([disabled])",
        "input:not([disabled])",
        "select:not([disabled])",
        "[tabindex]:not([tabindex='-1'])",
      ].join(","),
    ),
  );

  const first = focusable[0];
  const last = focusable.at(-1);

  if (!first || !last) {
    return;
  }

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
    return;
  }

  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function CaptureConflictResolver({
  conflict,
  resolving,
  mergeContent,
  showMergeEditor,
  onResolve,
  onRetryLoad,
  onCancel,
  onMergeContentChange,
  onShowMergeEditor,
}: {
  conflict: CaptureConflictSummary;
  resolving: boolean;
  mergeContent: string;
  showMergeEditor: boolean;
  onResolve: (strategy: "KEEP_LOCAL" | "KEEP_REMOTE" | "MERGE_MANUALLY") => void;
  onRetryLoad: () => void;
  onCancel: () => void;
  onMergeContentChange: (value: string) => void;
  onShowMergeEditor: () => void;
}) {
  const localContent = conflict.localContent;
  const remoteContent = conflict.remoteContent;
  const hasLocalSnapshot = localContent !== null;
  const hasRemoteSnapshot = remoteContent !== null;
  const canResolve = hasLocalSnapshot && hasRemoteSnapshot;

  return (
    <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-3 text-xs text-zinc-700">
      <p className="font-medium text-zinc-900">Una captura requiere atencion</p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {hasLocalSnapshot ? (
          <VersionPreview label="Versión de este dispositivo" content={localContent} />
        ) : null}
        {hasRemoteSnapshot ? (
          <VersionPreview label="Versión sincronizada" content={remoteContent} />
        ) : null}
      </div>
      {!hasLocalSnapshot && !hasRemoteSnapshot ? (
        <p className="mt-3 rounded-md bg-white/80 p-2 text-zinc-700">
          No fue posible cargar las versiones de esta captura.
        </p>
      ) : null}
      {hasLocalSnapshot && !hasRemoteSnapshot ? (
        <p className="mt-3 rounded-md bg-white/80 p-2 text-zinc-700">
          {getRemoteSnapshotErrorMessage(conflict.remoteLoadStatus)}
        </p>
      ) : null}
      {!hasLocalSnapshot && hasRemoteSnapshot ? (
        <p className="mt-3 rounded-md bg-white/80 p-2 text-zinc-700">
          No fue posible cargar la versión local.
        </p>
      ) : null}
      {showMergeEditor && canResolve ? (
        <textarea
          className="mt-3 min-h-28 w-full resize-y rounded-md border border-amber-200 bg-white p-2 outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          aria-label="Resultado de fusion manual"
          value={mergeContent}
          onChange={(event) => onMergeContentChange(event.target.value)}
        />
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {canResolve ? (
          <>
            <Button size="sm" onClick={() => onResolve("KEEP_LOCAL")} disabled={resolving}>
              Conservar esta versión
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onResolve("KEEP_REMOTE")}
              disabled={resolving}
            >
              Conservar versión sincronizada
            </Button>
          </>
        ) : null}
        {canResolve && showMergeEditor ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onResolve("MERGE_MANUALLY")}
            disabled={resolving || !mergeContent.trim()}
          >
            Confirmar fusion
          </Button>
        ) : canResolve ? (
          <Button size="sm" variant="ghost" onClick={onShowMergeEditor} disabled={resolving}>
            Fusionar manualmente
          </Button>
        ) : (
          <>
            <Button size="sm" variant="ghost" onClick={onRetryLoad} disabled={resolving}>
              {hasLocalSnapshot || hasRemoteSnapshot ? "Reintentar cargar" : "Reintentar"}
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel} disabled={resolving}>
              Cancelar
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function getRemoteSnapshotErrorMessage(
  status: CaptureConflictSummary["remoteLoadStatus"],
) {
  if (status === "ENTITY_NOT_FOUND") {
    return "La captura sincronizada ya no existe.";
  }

  if (status === "AUTH_ERROR") {
    return "No fue posible autorizar la consulta.";
  }

  if (status === "NETWORK_ERROR") {
    return "Sin conexión. Reintenta cuando vuelvas a estar en línea.";
  }

  return "No fue posible cargar la versión sincronizada.";
}

function VersionPreview({ label, content }: { label: string; content: string }) {
  return (
    <div className="min-w-0 rounded-md bg-white/80 p-2">
      <p className="font-medium text-zinc-800">{label}</p>
      <p className="mt-1 max-h-24 overflow-hidden whitespace-pre-wrap text-zinc-600">
        {content}
      </p>
    </div>
  );
}

function getConflictAttentionLabel(health: MemorySyncSnapshot["health"]) {
  if (
    health.conflictEntityCounts.captures === health.conflictMutations &&
    health.conflictMutations > 0
  ) {
    return health.conflictMutations === 1
      ? "Captura requiere atencion"
      : "Capturas requieren atencion";
  }

  return health.conflictMutations === 1
    ? "Elemento requiere atencion"
    : "Elementos requieren atencion";
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.replaceAll(":", "-");
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className="truncate font-medium text-zinc-900">{value}</span>
    </div>
  );
}

function ReconciliationSummary({
  reconciliation,
}: {
  reconciliation: MemoryReconciliationResult;
}) {
  return (
    <div className="rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
      <p>{getReconciliationStatusLabel(reconciliation.status)}</p>
      {reconciliation.generatedMutations.length > 0 ? (
        <p className="mt-1">
          Se prepararon {reconciliation.generatedMutations.length} cambios.
        </p>
      ) : null}
    </div>
  );
}

function RecentEvents({ events }: { events: MemorySyncSnapshot["health"]["recentEvents"] }) {
  if (events.length === 0) {
    return null;
  }

  return (
    <ol className="space-y-1 text-xs text-zinc-600">
      {events.slice(0, 6).map((event) => (
        <li key={event.id} className="flex justify-between gap-2">
          <span>{getMemoryEventLabel(event.type)}</span>
          <span>{formatTime(event.timestamp)}</span>
        </li>
      ))}
    </ol>
  );
}

function formatDate(value: Date | null) {
  return value ? value.toLocaleString("es") : "sin registro";
}

function formatRelativeDate(value: Date | null) {
  if (!value) {
    return "sin registro";
  }

  const elapsedSeconds = Math.max(
    0,
    Math.round((Date.now() - value.getTime()) / 1000),
  );

  if (elapsedSeconds < 60) {
    return `hace ${elapsedSeconds} segundos`;
  }

  const elapsedMinutes = Math.round(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return `hace ${elapsedMinutes} minutos`;
  }

  return formatDate(value);
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("es", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getReconciliationStatusLabel(status: MemoryReconciliationResult["status"]) {
  switch (status) {
    case "MEMORY_INTEGRAL":
      return "Memoria integra";
    case "PENDING_CHANGES":
      return "Cambios pendientes";
    case "DIVERGENCE_DETECTED":
      return "Requiere atencion";
    case "CONFLICT":
      return "Requiere atencion";
    case "OFFLINE":
      return "Sin conexion";
  }
}

function getReconciliationStatusMessage(status: MemoryReconciliationResult["status"]) {
  switch (status) {
    case "MEMORY_INTEGRAL":
      return "Memoria integra.";
    case "PENDING_CHANGES":
      return "La verificacion encontro cambios pendientes.";
    case "DIVERGENCE_DETECTED":
      return "La verificacion detecto divergencia de memoria.";
    case "CONFLICT":
      return "La verificacion encontro conflictos de memoria.";
    case "OFFLINE":
      return "No fue posible verificar la memoria sin conexion.";
  }
}

function getMemoryEventLabel(type: MemorySyncSnapshot["health"]["recentEvents"][number]["type"]) {
  switch (type) {
    case "RECONCILIATION_STARTED":
      return "Verificacion iniciada";
    case "HEALTH_CHECK_COMPLETED":
      return "Estado actualizado";
    case "RECONCILIATION_COMPLETED":
      return "Verificacion completada";
    case "ORPHAN_MUTATION_CREATED":
      return "Cambio preparado";
    case "PUSH_SUCCEEDED":
      return "Cambios enviados";
    case "PULL_SUCCEEDED":
      return "Memoria recibida";
    case "CHANGE_APPLIED":
      return "Cambio aplicado";
    case "CONFLICT_DETECTED":
      return "Atencion requerida";
    case "OUTBOX_ENQUEUED":
    case "LOCAL_WRITE_CREATED":
      return "Cambio local guardado";
  }
}

function getMemoryStatusDotClass(severity: MemoryHealthPresentationSeverity) {
  switch (severity) {
    case "success":
      return "bg-emerald-500";
    case "warning":
      return "bg-amber-500";
    case "offline":
      return "bg-zinc-400";
    case "error":
      return "bg-red-500";
  }
}
