import type { SyncState } from "@/features/sync/sync-state-engine";
import type {
  SyncMetadataRecord,
  SyncMutationOutboxRecord,
} from "@/features/sync/sync-outbox-repository";
import type { MemorySyncEvent } from "@/features/sync/observability/sync-event-buffer";

export type MemorySyncStatus =
  | "SYNCED"
  | "SYNCING"
  | "OFFLINE"
  | "PENDING"
  | "ERROR"
  | "DIVERGED"
  | "UNKNOWN";

export type MemorySyncConvergence =
  | "CONFIRMED"
  | "PENDING"
  | "DIVERGED"
  | "UNKNOWN";

export type MemorySyncHealth = {
  status: MemorySyncStatus;
  workspaceId: string | null;
  deviceId: string | null;
  pendingMutations: number;
  processingMutations: number;
  failedMutations: number;
  conflictMutations: number;
  lastSuccessfulSyncAt: Date | null;
  lastPushAt: Date | null;
  lastPullAt: Date | null;
  localCursor: string | null;
  remoteCursor: string | null;
  sentChanges: number;
  receivedChanges: number;
  appliedChanges: number;
  convergence: MemorySyncConvergence;
  recentEvents: MemorySyncEvent[];
};

export function deriveMemorySyncHealth({
  syncState,
  metadata,
  mutations,
  recentEvents,
  workspaceId,
  deviceId,
}: {
  syncState: SyncState;
  metadata: SyncMetadataRecord | null;
  mutations: SyncMutationOutboxRecord[];
  recentEvents: MemorySyncEvent[];
  workspaceId: string | null;
  deviceId: string | null;
}): MemorySyncHealth {
  const pendingMutations = countStatus(mutations, "PENDING");
  const processingMutations = countStatus(mutations, "PROCESSING");
  const failedMutations = countStatus(mutations, "FAILED");
  const conflictMutations = countStatus(mutations, "CONFLICT") + syncState.conflictCount;
  const status = deriveStatus({
    syncState,
    pendingMutations,
    processingMutations,
    failedMutations,
    conflictMutations,
    workspaceId,
    deviceId,
  });
  const convergence = deriveConvergence({
    status,
    pendingMutations,
    processingMutations,
    failedMutations,
    conflictMutations,
    metadata,
  });

  return {
    status,
    workspaceId,
    deviceId,
    pendingMutations,
    processingMutations,
    failedMutations,
    conflictMutations,
    lastSuccessfulSyncAt: toDate(syncState.lastSuccessfulSyncAt),
    lastPushAt: toDate(metadata?.lastSuccessfulPushAt ?? null),
    lastPullAt: toDate(metadata?.lastSuccessfulPullAt ?? null),
    localCursor: metadata?.pullCursor ?? null,
    remoteCursor: null,
    sentChanges: countEvents(recentEvents, "PUSH_SUCCEEDED"),
    receivedChanges: countEvents(recentEvents, "PULL_SUCCEEDED"),
    appliedChanges: countEvents(recentEvents, "CHANGE_APPLIED"),
    convergence,
    recentEvents: recentEvents.slice(0, 20),
  };
}

export function getMemorySyncStatusLabel(status: MemorySyncStatus) {
  switch (status) {
    case "SYNCED":
      return "Sincronizado";
    case "SYNCING":
      return "Sincronizando";
    case "OFFLINE":
      return "Sin conexion";
    case "PENDING":
      return "Pendiente";
    case "ERROR":
    case "DIVERGED":
      return "Requiere atencion";
    case "UNKNOWN":
      return "Estado desconocido";
  }
}

function deriveStatus(input: {
  syncState: SyncState;
  pendingMutations: number;
  processingMutations: number;
  failedMutations: number;
  conflictMutations: number;
  workspaceId: string | null;
  deviceId: string | null;
}): MemorySyncStatus {
  if (!input.workspaceId || !input.deviceId) {
    return "UNKNOWN";
  }

  if (input.syncState.connectivity === "OFFLINE") {
    return "OFFLINE";
  }

  if (input.conflictMutations > 0) {
    return "DIVERGED";
  }

  if (input.failedMutations > 0 || input.syncState.lastError) {
    return "ERROR";
  }

  if (input.syncState.phase === "PUSHING" || input.syncState.phase === "PULLING") {
    return "SYNCING";
  }

  if (input.pendingMutations > 0 || input.processingMutations > 0) {
    return "PENDING";
  }

  if (input.syncState.lastSuccessfulSyncAt) {
    return "SYNCED";
  }

  return "UNKNOWN";
}

function deriveConvergence(input: {
  status: MemorySyncStatus;
  pendingMutations: number;
  processingMutations: number;
  failedMutations: number;
  conflictMutations: number;
  metadata: SyncMetadataRecord | null;
}): MemorySyncConvergence {
  if (input.conflictMutations > 0 || input.status === "DIVERGED") {
    return "DIVERGED";
  }

  if (input.pendingMutations > 0 || input.processingMutations > 0) {
    return "PENDING";
  }

  if (input.failedMutations > 0 || input.status === "ERROR") {
    return "UNKNOWN";
  }

  if (input.status === "SYNCED" && input.metadata?.pullCursor) {
    return "CONFIRMED";
  }

  return "UNKNOWN";
}

function countStatus(
  mutations: SyncMutationOutboxRecord[],
  status: SyncMutationOutboxRecord["status"],
) {
  return mutations.filter((mutation) => mutation.status === status).length;
}

function countEvents(events: MemorySyncEvent[], type: MemorySyncEvent["type"]) {
  return events
    .filter((event) => event.type === type)
    .reduce((total, event) => total + (event.count ?? 1), 0);
}

function toDate(value: string | null) {
  return value ? new Date(value) : null;
}
