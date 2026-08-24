import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import {
  contextRepository,
  nodeContextRelationRepository,
  nodeRepository,
} from "@/infrastructure/repositories";
import {
  IndexedDbSyncMetadataRepository,
  IndexedDbSyncOutboxRepository,
  type SyncMetadataRecord,
  type SyncMutationOutboxRecord,
} from "@/features/sync/sync-outbox-repository";
import type { SyncState } from "@/features/sync/sync-state-engine";
import {
  createMemorySignature,
  verifyMemoryConvergence,
  type MemoryConvergenceResult,
} from "@/features/sync/observability/convergence-checker";
import {
  diagnoseCaptureSync,
  type EntitySyncDiagnostic,
} from "@/features/sync/observability/entity-sync-diagnostic";
import {
  deriveMemorySyncHealth,
  type MemorySyncHealth,
} from "@/features/sync/observability/memory-sync-health";
import { syncEventBuffer } from "@/features/sync/observability/sync-event-buffer";
import { groupEntitySyncConflicts } from "@/features/sync/conflict-lifecycle";

export type MemorySyncSnapshot = {
  health: MemorySyncHealth;
  metadata: SyncMetadataRecord | null;
  mutations: SyncMutationOutboxRecord[];
  localSignature: ReturnType<typeof createMemorySignature>;
};

export async function loadMemorySyncSnapshot({
  workspaceId,
  deviceId,
  syncState,
}: {
  workspaceId: string | null;
  deviceId: string | null;
  syncState: SyncState;
}): Promise<MemorySyncSnapshot> {
  if (!workspaceId || !deviceId) {
    const localSignature = createMemorySignature({
      nodes: [],
      contexts: [],
      relations: [],
    });

    return {
      health: deriveMemorySyncHealth({
        syncState,
        metadata: null,
        mutations: [],
        recentEvents: [],
        workspaceId,
        deviceId,
      }),
      metadata: null,
      mutations: [],
      localSignature,
    };
  }

  const metadataRepository = new IndexedDbSyncMetadataRepository();
  const outboxRepository = new IndexedDbSyncOutboxRepository();
  const [
    metadata,
    mutations,
    pendingMutations,
    processingMutations,
    failedMutations,
    conflictMutations,
    nodes,
    contexts,
    relations,
  ] = await Promise.all([
    metadataRepository.get(workspaceId, deviceId),
    outboxRepository.listByWorkspace(workspaceId, 100),
    outboxRepository.countByStatus(workspaceId, "PENDING"),
    outboxRepository.countByStatus(workspaceId, "PROCESSING"),
    outboxRepository.countByStatus(workspaceId, "FAILED"),
    outboxRepository.listAllConflicts(workspaceId),
    nodeRepository.listByWorkspace(workspaceId),
    contextRepository.list({ workspaceId, includeArchived: true }),
    nodeContextRelationRepository.listByWorkspace(workspaceId),
  ]);
  const recentEvents = syncEventBuffer.list({ workspaceId, limit: 20 });
  const logicalConflicts = groupEntitySyncConflicts(conflictMutations);
  const conflictEntityCounts = {
    captures: logicalConflicts.filter((conflict) => conflict.entityType === "capture")
      .length,
    concepts: logicalConflicts.filter((conflict) => conflict.entityType === "concept")
      .length,
    captureConcepts: logicalConflicts.filter(
      (conflict) => conflict.entityType === "captureConcept",
    ).length,
  };
  const localSignature = createMemorySignature({
    nodes,
    contexts,
    relations,
    generation: metadata?.pullCursor ?? "0",
  });

  return {
    health: deriveMemorySyncHealth({
      syncState,
      metadata,
      mutations,
      mutationCounts: {
        pendingMutations,
        processingMutations,
        failedMutations,
        conflictMutations: logicalConflicts.length,
        conflictEntityCounts,
      },
      recentEvents,
      workspaceId,
      deviceId,
    }),
    metadata,
    mutations,
    localSignature,
  };
}

export async function recordMemoryVerificationResult({
  workspaceId,
  deviceId,
  status,
  errorMessage = null,
  at = new Date().toISOString(),
}: {
  workspaceId: string;
  deviceId: string;
  status: "PASSED" | "FAILED";
  errorMessage?: string | null;
  at?: string;
}) {
  const metadataRepository = new IndexedDbSyncMetadataRepository();
  return metadataRepository.recordMemoryVerification({
    workspaceId,
    deviceId,
    status,
    errorMessage,
    at,
  });
}

export async function verifyCurrentMemoryConvergence({
  workspaceId,
  deviceId,
}: {
  workspaceId: string;
  deviceId: string;
}): Promise<MemoryConvergenceResult> {
  const metadataRepository = new IndexedDbSyncMetadataRepository();
  const outboxRepository = new IndexedDbSyncOutboxRepository();
  const [metadata, mutations, nodes, contexts, relations] = await Promise.all([
    metadataRepository.get(workspaceId, deviceId),
    outboxRepository.listByWorkspace(workspaceId, 100),
    nodeRepository.listByWorkspace(workspaceId),
    contextRepository.list({ workspaceId, includeArchived: true }),
    nodeContextRelationRepository.listByWorkspace(workspaceId),
  ]);
  const localSignature = createMemorySignature({
    nodes,
    contexts,
    relations,
    generation: metadata?.pullCursor ?? "0",
  });
  const pending = mutations.filter(
    (mutation) =>
      mutation.status === "PENDING" || mutation.status === "PROCESSING",
  ).length;
  const failed = mutations.filter(
    (mutation) =>
      mutation.status === "FAILED" || mutation.status === "CONFLICT",
  ).length;

  return verifyMemoryConvergence({
    localSignature,
    remoteSignature: null,
    pendingMutations: pending,
    failedMutations: failed,
  });
}

export async function diagnoseCurrentCaptureSync({
  workspaceId,
  nodeId,
  visibleNodeIds = [],
}: {
  workspaceId: string;
  nodeId: string;
  visibleNodeIds?: string[];
}): Promise<EntitySyncDiagnostic> {
  const outboxRepository = new IndexedDbSyncOutboxRepository();
  const [nodes, mutations] = await Promise.all([
    nodeRepository.listByWorkspace(workspaceId),
    outboxRepository.listByEntity({ workspaceId, entityId: nodeId, limit: 100 }),
  ]);

  return diagnoseCaptureSync({
    nodeId,
    nodes,
    mutations,
    events: syncEventBuffer.list({ workspaceId, limit: 100 }),
    visibleNodeIds,
  });
}

export function toSafeMemorySyncSummary(snapshot: MemorySyncSnapshot) {
  const { health, localSignature } = snapshot;

  return [
    `Estado: ${health.status}`,
    `Workspace: ${abbreviate(health.workspaceId)}`,
    `Device: ${abbreviate(health.deviceId)}`,
    `Pendientes: ${health.pendingMutations}`,
    `Procesando: ${health.processingMutations}`,
    `Fallidas: ${health.failedMutations}`,
    `Conflictos: ${health.conflictMutations}`,
    `Cursor local: ${health.localCursor ?? "sin cursor"}`,
    `Firma local: ${localSignature.hash}`,
    `Convergencia: ${health.convergence}`,
  ].join("\n");
}

export function abbreviate(value: string | null | undefined) {
  if (!value) {
    return "no disponible";
  }

  if (value.length <= 10) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export type { Context, Node, NodeContextRelation };
