import type { MemorySyncHealth } from "@/features/sync/observability/memory-sync-health";
import type { SyncState } from "@/features/sync/sync-state-engine";

export type MemoryHealthPresentationStatus =
  | "INTEGRAL"
  | "VERIFYING"
  | "PENDING"
  | "OFFLINE"
  | "REQUIRES_ATTENTION"
  | "ERROR";

export type MemoryHealthPresentationSeverity =
  | "success"
  | "warning"
  | "offline"
  | "error";

export type MemoryHealthPresentation = {
  status: MemoryHealthPresentationStatus;
  headline: string;
  severity: MemoryHealthPresentationSeverity;
  ariaLabel: string;
  conflictCount: number;
  pendingCount: number;
};

export function deriveMemoryHealthPresentation({
  health,
  syncState,
  verifying,
  localError,
}: {
  health: MemorySyncHealth | null;
  syncState: SyncState;
  verifying: boolean;
  localError: string | null;
}): MemoryHealthPresentation {
  const conflictCount = health?.conflictMutations ?? syncState.conflictCount;
  const pendingCount = health
    ? health.pendingMutations + health.processingMutations
    : syncState.pendingMutations + syncState.processingMutations;
  const failedCount = health?.failedMutations ?? syncState.failedMutations;

  if (localError || failedCount > 0 || health?.status === "ERROR" || syncState.lastError) {
    const headline = localError
      ? "No se pudo verificar la memoria"
      : failedCount === 1
        ? "1 cambio requiere reintento"
        : failedCount > 1
          ? `${failedCount} cambios requieren reintento`
          : "La memoria requiere atencion";

    return createPresentation({
      status: "ERROR",
      headline,
      severity: "error",
      conflictCount,
      pendingCount,
    });
  }

  if (conflictCount > 0 || health?.status === "DIVERGED") {
    return createPresentation({
      status: "REQUIRES_ATTENTION",
      headline: conflictCount > 0
        ? getConflictHeadline(health, conflictCount)
        : "La memoria requiere atencion",
      severity: "error",
      conflictCount,
      pendingCount,
    });
  }

  if (health?.status === "OFFLINE" || syncState.connectivity === "OFFLINE") {
    return createPresentation({
      status: "OFFLINE",
      headline: "Sin conexion",
      severity: "offline",
      conflictCount,
      pendingCount,
    });
  }

  if (verifying) {
    return createPresentation({
      status: "VERIFYING",
      headline: "Verificando memoria...",
      severity: "warning",
      conflictCount,
      pendingCount,
    });
  }

  if (
    pendingCount > 0 ||
    health?.status === "PENDING" ||
    health?.status === "SYNCING" ||
    syncState.phase === "PUSHING" ||
    syncState.phase === "PULLING"
  ) {
    return createPresentation({
      status: "PENDING",
      headline: pendingCount === 1
        ? "1 cambio pendiente"
        : pendingCount > 1
          ? `${pendingCount} cambios pendientes`
          : "Sincronizando",
      severity: "warning",
      conflictCount,
      pendingCount,
    });
  }

  return createPresentation({
    status: "INTEGRAL",
    headline: "Memoria integra",
    severity: "success",
    conflictCount,
    pendingCount,
  });
}

function createPresentation({
  status,
  headline,
  severity,
  conflictCount,
  pendingCount,
}: Omit<MemoryHealthPresentation, "ariaLabel">): MemoryHealthPresentation {
  return {
    status,
    headline,
    severity,
    ariaLabel: headline.toLocaleLowerCase("es"),
    conflictCount,
    pendingCount,
  };
}

function getConflictHeadline(
  health: MemorySyncHealth | null,
  conflictCount: number,
) {
  const captureConflicts =
    health?.conflictEntityCounts.captures === conflictCount && conflictCount > 0;

  if (captureConflicts) {
    return conflictCount === 1
      ? "1 captura requiere atencion"
      : `${conflictCount} capturas requieren atencion`;
  }

  return conflictCount === 1
    ? "1 elemento requiere atencion"
    : `${conflictCount} elementos requieren atencion`;
}
