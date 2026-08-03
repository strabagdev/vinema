"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VisualFeedbackWordmark, useVisualFeedback } from "@/features/feedback/visual-feedback-provider";
import { useAuth } from "@/features/auth/auth-provider";
import { nodeRepository } from "@/infrastructure/repositories";
import {
  abbreviate,
  diagnoseCurrentCaptureSync,
  loadMemorySyncSnapshot,
  toSafeMemorySyncSummary,
  verifyCurrentMemoryConvergence,
  type MemorySyncSnapshot,
} from "@/features/sync/observability/memory-sync-observability";
import { getMemorySyncStatusLabel } from "@/features/sync/observability/memory-sync-health";
import type { EntitySyncDiagnostic } from "@/features/sync/observability/entity-sync-diagnostic";
import type { MemoryConvergenceResult } from "@/features/sync/observability/convergence-checker";
import { syncEventBuffer } from "@/features/sync/observability/sync-event-buffer";
import {
  createMemoryReconciliationEngine,
  type MemoryReconciliationPhase,
  type MemoryReconciliationResult,
} from "@/features/sync/reconciliation";
import { cn } from "@/lib/cn";

export function MemorySyncStatusPanel() {
  const auth = useAuth();
  const feedback = useVisualFeedback();
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<MemorySyncSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifyingMemory, setVerifyingMemory] = useState(false);
  const [reconciliationPhase, setReconciliationPhase] =
    useState<MemoryReconciliationPhase | null>(null);
  const [reconciliation, setReconciliation] =
    useState<MemoryReconciliationResult | null>(null);
  const [diagnosticQuery, setDiagnosticQuery] = useState("");
  const [diagnostic, setDiagnostic] = useState<EntitySyncDiagnostic | null>(null);
  const [convergence, setConvergence] = useState<MemoryConvergenceResult | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const canOpen = auth.isAuthenticated && Boolean(auth.workspaceId && auth.deviceId);

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
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        panelRef.current &&
        event.target instanceof Node &&
        !panelRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  async function handleVerifyMemory() {
    if (!auth.workspaceId || !auth.deviceId || verifyingMemory) {
      return;
    }

    if (auth.syncState.connectivity === "OFFLINE" || navigator.onLine === false) {
      feedback.offline();
      setLocalError("Sin conexion. Los cambios pendientes se conservan localmente.");
      setReconciliationPhase(null);
      return;
    }

    setVerifyingMemory(true);
    setReconciliationPhase("HEALTH_CHECK");
    feedback.syncing();
    try {
      const engine = createMemoryReconciliationEngine({
        runSync: async () => {
          setReconciliationPhase("PUSHING");
          await auth.syncNow();
        },
      });
      setReconciliationPhase("DETECTING_DIVERGENCE");
      const result = await engine.reconcile({
        workspaceId: auth.workspaceId,
        deviceId: auth.deviceId,
        syncState: auth.syncState,
      });
      setReconciliation(result);
      setConvergence(result.convergence);
      setReconciliationPhase(
        result.status === "MEMORY_INTEGRAL"
          ? "MEMORY_INTEGRAL"
          : "VERIFYING_CONVERGENCE",
      );
      if (result.status === "MEMORY_INTEGRAL") {
        feedback.synced();
      } else if (result.status === "OFFLINE") {
        feedback.offline();
      } else if (result.status === "CONFLICT" || result.status === "DIVERGENCE_DETECTED") {
        feedback.error("La memoria requiere revision.");
      } else {
        feedback.success("Verificacion completada");
      }
      await refreshSnapshot();
    } catch {
      feedback.error("No fue posible verificar la memoria.");
      setLocalError("No fue posible verificar la memoria.");
    } finally {
      setVerifyingMemory(false);
    }
  }

  async function handleVerifyConvergence() {
    if (!auth.workspaceId || !auth.deviceId) {
      return;
    }

    const result = await verifyCurrentMemoryConvergence({
      workspaceId: auth.workspaceId,
      deviceId: auth.deviceId,
    });
    setConvergence(result);
    await refreshSnapshot();
  }

  async function handleDiagnoseCapture() {
    if (!auth.workspaceId) {
      return;
    }

    const nodeId = await resolveDiagnosticNodeId(auth.workspaceId, diagnosticQuery);
    if (!nodeId) {
      setDiagnostic(null);
      setLocalError("No se encontro una captura local para diagnosticar.");
      return;
    }

    setDiagnostic(await diagnoseCurrentCaptureSync({
      workspaceId: auth.workspaceId,
      nodeId,
    }));
    setLocalError(null);
  }

  async function handleCopySummary() {
    if (!snapshot || typeof navigator.clipboard?.writeText !== "function") {
      return;
    }

    await navigator.clipboard.writeText(toSafeMemorySyncSummary(snapshot));
    feedback.success("Resumen copiado");
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        className="flex h-10 items-center rounded-md px-2 outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
        aria-label="Abrir Estado de la memoria"
        aria-expanded={open}
        disabled={!canOpen}
        data-memory-sync-trigger=""
        onClick={() => {
          if (canOpen) {
            setOpen((current) => !current);
          }
        }}
      >
        <VisualFeedbackWordmark />
        <span
          className={cn(
            "ml-1.5 h-1.5 w-1.5 rounded-full",
            getMemoryStatusDotClass(auth.syncState),
          )}
          title="Estado de la memoria"
          aria-label={`Estado de la memoria: ${getAccessibleMemoryStatus(auth.syncState)}`}
          data-memory-sync-status-dot=""
        />
      </button>
      {open && snapshot ? (
        <MemorySyncPanelContent
          snapshot={snapshot}
          loading={loading}
          verifyingMemory={verifyingMemory}
          reconciliationPhase={reconciliationPhase}
          reconciliation={reconciliation}
          localError={localError}
          diagnosticQuery={diagnosticQuery}
          diagnostic={diagnostic}
          convergence={convergence}
          onClose={() => setOpen(false)}
          onVerifyMemory={() => void handleVerifyMemory()}
          onVerifyConvergence={() => void handleVerifyConvergence()}
          onDiagnosticQueryChange={setDiagnosticQuery}
          onDiagnoseCapture={() => void handleDiagnoseCapture()}
          onCopySummary={() => void handleCopySummary()}
        />
      ) : null}
    </div>
  );
}

function MemorySyncPanelContent({
  snapshot,
  loading,
  verifyingMemory,
  reconciliationPhase,
  reconciliation,
  localError,
  diagnosticQuery,
  diagnostic,
  convergence,
  onClose,
  onVerifyMemory,
  onVerifyConvergence,
  onDiagnosticQueryChange,
  onDiagnoseCapture,
  onCopySummary,
}: {
  snapshot: MemorySyncSnapshot;
  loading: boolean;
  verifyingMemory: boolean;
  reconciliationPhase: MemoryReconciliationPhase | null;
  reconciliation: MemoryReconciliationResult | null;
  localError: string | null;
  diagnosticQuery: string;
  diagnostic: EntitySyncDiagnostic | null;
  convergence: MemoryConvergenceResult | null;
  onClose: () => void;
  onVerifyMemory: () => void;
  onVerifyConvergence: () => void;
  onDiagnosticQueryChange: (value: string) => void;
  onDiagnoseCapture: () => void;
  onCopySummary: () => void;
}) {
  const health = snapshot.health;

  return (
    <section
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 max-h-[min(78vh,42rem)] overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 text-left text-sm shadow-xl md:absolute md:inset-auto md:left-1/2 md:top-full md:mt-2 md:w-[24rem] md:-translate-x-1/2"
      aria-label="Estado de la memoria"
      role="dialog"
      data-memory-sync-panel=""
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-medium text-zinc-950">Estado de la memoria</h2>
          <p className="mt-1 text-xs text-zinc-500">
            {getMemorySyncStatusLabel(health.status)}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100"
          aria-label="Cerrar Estado de la memoria"
          onClick={onClose}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-4 grid gap-2 text-xs text-zinc-600">
        <Metric label="Ultima sincronizacion" value={formatDate(health.lastSuccessfulSyncAt)} />
        <Metric label="Pendientes" value={`${health.pendingMutations}`} />
        <Metric label="Fallidas" value={`${health.failedMutations}`} />
        <Metric label="Cursor local" value={health.localCursor ?? "sin cursor"} />
      </div>

      {localError ? (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {localError}
        </p>
      ) : null}
      {reconciliationPhase ? (
        <p className="mt-3 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
          {getReconciliationPhaseLabel(reconciliationPhase)}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={onVerifyMemory} disabled={verifyingMemory || loading}>
          <RefreshCw className={cn("mr-2 h-3.5 w-3.5", verifyingMemory ? "animate-spin" : null)} />
          Verificar memoria
        </Button>
        <Button size="sm" variant="ghost" onClick={onCopySummary}>
          <Copy className="mr-2 h-3.5 w-3.5" />
          Copiar resumen
        </Button>
      </div>

      <details className="mt-4 rounded-lg border border-zinc-100 p-3">
        <summary className="cursor-pointer text-xs font-medium text-zinc-700">
          Ver diagnostico
        </summary>
        <div className="mt-3 space-y-3">
          <div className="grid gap-1 text-xs text-zinc-600">
            <Metric label="Workspace" value={abbreviate(health.workspaceId)} />
            <Metric label="Dispositivo" value={abbreviate(health.deviceId)} />
            <Metric label="Auth/sync" value={health.status} />
            <Metric label="Procesando" value={`${health.processingMutations}`} />
            <Metric label="Conflictos" value={`${health.conflictMutations}`} />
            <Metric label="Ultimo push" value={formatDate(health.lastPushAt)} />
            <Metric label="Ultimo pull" value={formatDate(health.lastPullAt)} />
            <Metric label="Firma local" value={snapshot.localSignature.hash} />
          </div>
          {convergence ? (
            <p className="rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
              {convergence.status}: {convergence.reason}
            </p>
          ) : null}
          {reconciliation ? (
            <div className="rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
              <p>{getReconciliationStatusLabel(reconciliation.status)}</p>
              <p className="mt-1">
                Huerfanas detectadas: {reconciliation.orphanEntities.length}
              </p>
              <p>
                Mutaciones generadas: {reconciliation.generatedMutations.length}
              </p>
            </div>
          ) : null}
          <Button size="sm" variant="ghost" onClick={onVerifyConvergence}>
            <Check className="mr-2 h-3.5 w-3.5" />
            Verificar convergencia
          </Button>
          <div className="flex gap-2">
            <input
              className="min-w-0 flex-1 rounded-md border border-zinc-200 px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
              placeholder="nodeId o fragmento"
              value={diagnosticQuery}
              aria-label="Buscar captura para diagnostico"
              onChange={(event) => onDiagnosticQueryChange(event.target.value)}
            />
            <Button size="sm" variant="ghost" onClick={onDiagnoseCapture}>
              <Search className="h-3.5 w-3.5" />
              <span className="sr-only">Diagnosticar captura</span>
            </Button>
          </div>
          {diagnostic ? <DiagnosticSteps diagnostic={diagnostic} /> : null}
          <RecentEvents events={health.recentEvents} />
        </div>
      </details>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className="truncate font-medium text-zinc-900">{value}</span>
    </div>
  );
}

function DiagnosticSteps({ diagnostic }: { diagnostic: EntitySyncDiagnostic }) {
  return (
    <ol className="space-y-1 text-xs">
      {diagnostic.steps.map((step) => (
        <li key={step.stage} className="rounded-md bg-zinc-50 px-2 py-1">
          <span className="font-medium text-zinc-800">{step.label}</span>
          <span className="ml-2 text-zinc-500">{step.status}</span>
          <p className="mt-0.5 text-zinc-500">{step.detail}</p>
        </li>
      ))}
    </ol>
  );
}

function RecentEvents({ events }: { events: MemorySyncSnapshot["health"]["recentEvents"] }) {
  if (events.length === 0) {
    return <p className="text-xs text-zinc-500">Sin eventos recientes.</p>;
  }

  return (
    <ol className="space-y-1 text-xs text-zinc-600">
      {events.slice(0, 6).map((event) => (
        <li key={event.id} className="flex justify-between gap-2">
          <span>{event.type}</span>
          <span>{formatTime(event.timestamp)}</span>
        </li>
      ))}
    </ol>
  );
}

async function resolveDiagnosticNodeId(workspaceId: string, query: string) {
  const normalized = query.trim();
  if (!normalized) {
    return null;
  }

  const nodes = await nodeRepository.listByWorkspace(workspaceId);
  return (
    nodes.find((node) => node.id === normalized)?.id ??
    nodes.find((node) =>
      node.content.toLocaleLowerCase("es").includes(
        normalized.toLocaleLowerCase("es"),
      ),
    )?.id ??
    null
  );
}

function formatDate(value: Date | null) {
  return value ? value.toLocaleString("es") : "sin registro";
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("es", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getReconciliationPhaseLabel(phase: MemoryReconciliationPhase) {
  switch (phase) {
    case "HEALTH_CHECK":
      return "Revisando memoria...";
    case "DETECTING_DIVERGENCE":
    case "FINDING_ORPHANS":
    case "GENERATING_MUTATIONS":
      return "Reconciliando...";
    case "PUSHING":
    case "PULLING":
    case "APPLYING":
      return "Actualizando memoria...";
    case "VERIFYING_CONVERGENCE":
      return "Verificando convergencia...";
    case "MEMORY_INTEGRAL":
      return "Memoria integra";
  }
}

function getReconciliationStatusLabel(status: MemoryReconciliationResult["status"]) {
  switch (status) {
    case "MEMORY_INTEGRAL":
      return "Memoria integra";
    case "PENDING_CHANGES":
      return "Cambios pendientes";
    case "DIVERGENCE_DETECTED":
      return "Divergencia detectada";
    case "CONFLICT":
      return "Conflicto";
    case "OFFLINE":
      return "Sin conexion";
  }
}

function getMemoryStatusDotClass(syncState: ReturnType<typeof useAuth>["syncState"]) {
  if (syncState.connectivity === "OFFLINE") {
    return "bg-zinc-400";
  }

  if (syncState.failedMutations > 0 || syncState.conflictCount > 0) {
    return "bg-red-500";
  }

  if (
    syncState.phase === "PUSHING" ||
    syncState.phase === "PULLING" ||
    syncState.pendingMutations > 0 ||
    syncState.processingMutations > 0
  ) {
    return "bg-amber-500";
  }

  return "bg-emerald-500";
}

function getAccessibleMemoryStatus(syncState: ReturnType<typeof useAuth>["syncState"]) {
  if (syncState.connectivity === "OFFLINE") {
    return "sin conexion";
  }

  if (syncState.failedMutations > 0 || syncState.conflictCount > 0) {
    return "requiere atencion";
  }

  if (
    syncState.phase === "PUSHING" ||
    syncState.phase === "PULLING" ||
    syncState.pendingMutations > 0 ||
    syncState.processingMutations > 0
  ) {
    return "verificando o con cambios pendientes";
  }

  return "sincronizada";
}
