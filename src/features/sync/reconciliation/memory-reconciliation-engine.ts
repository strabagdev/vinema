import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import {
  contextRepository,
  nodeContextRelationRepository,
  nodeRepository,
} from "@/infrastructure/repositories";
import {
  createMemorySignature,
  verifyMemoryConvergence,
  type MemoryConvergenceResult,
} from "@/features/sync/observability/convergence-checker";
import {
  appendMemorySyncEvent,
  type MemorySyncEvent,
} from "@/features/sync/observability/sync-event-buffer";
import {
  mapLocalContextToConceptMutation,
  mapLocalNodeToCaptureMutation,
  mapLocalRelationToCaptureConceptMutation,
} from "@/features/sync/sync-mappers";
import type { SyncState } from "@/features/sync/sync-state-engine";
import {
  IndexedDbSyncEntityAcknowledgementRepository,
  type SyncEntityAcknowledgementRecord,
} from "@/features/sync/sync-entity-acknowledgement-repository";
import {
  IndexedDbSyncMetadataRepository,
  IndexedDbSyncOutboxRepository,
  type SyncMetadataRecord,
  type SyncMutationOutboxRecord,
} from "@/features/sync/sync-outbox-repository";

export type MemoryReconciliationStatus =
  | "MEMORY_INTEGRAL"
  | "PENDING_CHANGES"
  | "DIVERGENCE_DETECTED"
  | "CONFLICT"
  | "OFFLINE";

export type MemoryReconciliationPhase =
  | "HEALTH_CHECK"
  | "DETECTING_DIVERGENCE"
  | "FINDING_ORPHANS"
  | "GENERATING_MUTATIONS"
  | "PUSHING"
  | "PULLING"
  | "APPLYING"
  | "VERIFYING_CONVERGENCE"
  | "MEMORY_INTEGRAL";

export type MemoryReconciliationHealthCheck = {
  workspaceId: string;
  deviceId: string;
  generation: string | null;
  offline: boolean;
  pendingMutations: number;
  processingMutations: number;
  failedMutations: number;
  conflictMutations: number;
  localCursor: string | null;
};

export type OrphanEntityType = "capture" | "concept" | "captureConcept";

export type OrphanEntity = {
  entityType: OrphanEntityType;
  entityId: string;
  localVersion: number;
  localUpdatedAt: string | null;
  reason: "NEVER_ACKNOWLEDGED" | "LOCAL_VERSION_AHEAD";
};

export type MemoryReconciliationResult = {
  status: MemoryReconciliationStatus;
  phases: MemoryReconciliationPhase[];
  health: MemoryReconciliationHealthCheck;
  orphanEntities: OrphanEntity[];
  generatedMutations: SyncMutationOutboxRecord[];
  convergence: MemoryConvergenceResult;
  localSignature: ReturnType<typeof createMemorySignature>;
};

export type MemoryReconciliationDependencies = {
  listNodes(workspaceId: string): Promise<Node[]>;
  listContexts(workspaceId: string): Promise<Context[]>;
  listRelations(workspaceId: string): Promise<NodeContextRelation[]>;
  listMutations(workspaceId: string): Promise<SyncMutationOutboxRecord[]>;
  listAcknowledgements(workspaceId: string): Promise<SyncEntityAcknowledgementRecord[]>;
  enqueueMutation(input: {
    workspaceId: string;
    deviceId: string;
    mutation: Parameters<IndexedDbSyncOutboxRepository["enqueue"]>[0]["mutation"];
    localVersion: number;
    createdAt: string;
  }): Promise<SyncMutationOutboxRecord>;
  getMetadata(workspaceId: string, deviceId: string): Promise<SyncMetadataRecord | null>;
  runSync(): Promise<void>;
  createMutationId(): string;
  emitEvent(event: Parameters<typeof appendMemorySyncEvent>[0]): void;
};

export type MemoryReconciliationInput = {
  workspaceId: string;
  deviceId: string;
  syncState: SyncState;
};

export class MemoryReconciliationEngine {
  constructor(private readonly dependencies: MemoryReconciliationDependencies) {}

  async reconcile(input: MemoryReconciliationInput): Promise<MemoryReconciliationResult> {
    const phases: MemoryReconciliationPhase[] = [];

    this.emit("RECONCILIATION_STARTED", input, { status: "STARTED" });
    phases.push("HEALTH_CHECK");
    const initialState = await this.loadState(input.workspaceId, input.deviceId);
    const health = createHealthCheck({
      workspaceId: input.workspaceId,
      deviceId: input.deviceId,
      syncState: input.syncState,
      metadata: initialState.metadata,
      mutations: initialState.mutations,
    });
    this.emit("HEALTH_CHECK_COMPLETED", input, {
      count: health.pendingMutations + health.failedMutations + health.conflictMutations,
      status: health.offline ? "OFFLINE" : "OK",
    });

    if (health.offline) {
      const localSignature = createMemorySignature({
        nodes: initialState.nodes,
        contexts: initialState.contexts,
        relations: initialState.relations,
        generation: health.generation ?? "0",
      });

      return {
        status: "OFFLINE",
        phases,
        health,
        orphanEntities: [],
        generatedMutations: [],
        convergence: verifyMemoryConvergence({
          localSignature,
          remoteSignature: null,
          pendingMutations: health.pendingMutations,
          failedMutations: health.failedMutations + health.conflictMutations,
        }),
        localSignature,
      };
    }

    phases.push("DETECTING_DIVERGENCE", "FINDING_ORPHANS");
    const orphanEntities = findMissingSyncMutations({
      nodes: initialState.nodes,
      contexts: initialState.contexts,
      relations: initialState.relations,
      mutations: initialState.mutations,
      acknowledgements: initialState.acknowledgements,
    });
    const generatedMutations: SyncMutationOutboxRecord[] = [];

    if (orphanEntities.length > 0) {
      phases.push("GENERATING_MUTATIONS");
      for (const orphan of orphanEntities) {
        const mutation = createOrphanMutation({
          orphan,
          nodes: initialState.nodes,
          contexts: initialState.contexts,
          relations: initialState.relations,
          mutationId: this.dependencies.createMutationId(),
        });

        if (!mutation) {
          continue;
        }

        const record = await this.dependencies.enqueueMutation({
          workspaceId: input.workspaceId,
          deviceId: input.deviceId,
          mutation: mutation.mutation,
          localVersion: mutation.localVersion,
          createdAt: mutation.createdAt,
        });
        generatedMutations.push(record);
        this.emit("ORPHAN_MUTATION_CREATED", input, {
          entityType: orphan.entityType,
          entityId: orphan.entityId,
          mutationId: record.mutationId,
          status: record.status,
        });
      }
    }

    phases.push("PUSHING", "PULLING", "APPLYING");
    await this.dependencies.runSync();

    phases.push("VERIFYING_CONVERGENCE");
    const finalState = await this.loadState(input.workspaceId, input.deviceId);
    const finalHealth = createHealthCheck({
      workspaceId: input.workspaceId,
      deviceId: input.deviceId,
      syncState: input.syncState,
      metadata: finalState.metadata,
      mutations: finalState.mutations,
    });
    const localSignature = createMemorySignature({
      nodes: finalState.nodes,
      contexts: finalState.contexts,
      relations: finalState.relations,
      generation: finalHealth.generation ?? "0",
    });
    const remainingBlockingMutations =
      finalHealth.pendingMutations +
      finalHealth.processingMutations +
      finalHealth.failedMutations +
      finalHealth.conflictMutations;
    const convergence = verifyMemoryConvergence({
      localSignature,
      remoteSignature: null,
      pendingMutations: finalHealth.pendingMutations + finalHealth.processingMutations,
      failedMutations: finalHealth.failedMutations + finalHealth.conflictMutations,
    });
    const status = deriveReconciliationStatus({
      health: finalHealth,
      orphanEntities,
      remainingBlockingMutations,
      convergence,
    });

    if (status === "MEMORY_INTEGRAL") {
      phases.push("MEMORY_INTEGRAL");
    }

    this.emit("RECONCILIATION_COMPLETED", input, {
      count: generatedMutations.length,
      status,
    });

    return {
      status,
      phases,
      health: finalHealth,
      orphanEntities,
      generatedMutations,
      convergence,
      localSignature,
    };
  }

  private async loadState(workspaceId: string, deviceId: string) {
    const [
      metadata,
      mutations,
      acknowledgements,
      nodes,
      contexts,
      relations,
    ] = await Promise.all([
      this.dependencies.getMetadata(workspaceId, deviceId),
      this.dependencies.listMutations(workspaceId),
      this.dependencies.listAcknowledgements(workspaceId),
      this.dependencies.listNodes(workspaceId),
      this.dependencies.listContexts(workspaceId),
      this.dependencies.listRelations(workspaceId),
    ]);

    return { metadata, mutations, acknowledgements, nodes, contexts, relations };
  }

  private emit(
    type: MemorySyncEvent["type"],
    input: Pick<MemoryReconciliationInput, "workspaceId" | "deviceId">,
    event: Omit<
      Parameters<typeof appendMemorySyncEvent>[0],
      "type" | "workspaceId" | "deviceId"
    >,
  ) {
    this.dependencies.emitEvent({
      ...event,
      type,
      workspaceId: input.workspaceId,
      deviceId: input.deviceId,
    });
  }
}

export function createMemoryReconciliationEngine(input: {
  runSync: () => Promise<void>;
  createMutationId?: () => string;
}) {
  const outboxRepository = new IndexedDbSyncOutboxRepository();
  const metadataRepository = new IndexedDbSyncMetadataRepository();
  const acknowledgementRepository =
    new IndexedDbSyncEntityAcknowledgementRepository();

  return new MemoryReconciliationEngine({
    listNodes: (workspaceId) => nodeRepository.listByWorkspace(workspaceId),
    listContexts: (workspaceId) =>
      contextRepository.list({ workspaceId, includeArchived: true }),
    listRelations: (workspaceId) =>
      nodeContextRelationRepository.listByWorkspace(workspaceId),
    listMutations: (workspaceId) => outboxRepository.listByWorkspace(workspaceId, 100),
    listAcknowledgements: (workspaceId) =>
      acknowledgementRepository.listByWorkspace(workspaceId),
    enqueueMutation: (mutationInput) => outboxRepository.enqueue(mutationInput),
    getMetadata: (workspaceId, deviceId) => metadataRepository.get(workspaceId, deviceId),
    runSync: input.runSync,
    createMutationId: input.createMutationId ?? (() => crypto.randomUUID()),
    emitEvent: appendMemorySyncEvent,
  });
}

export function findOrphanEntities(input: {
  nodes: Node[];
  contexts: Context[];
  relations: NodeContextRelation[];
  mutations: SyncMutationOutboxRecord[];
  acknowledgements?: SyncEntityAcknowledgementRecord[];
}): OrphanEntity[] {
  return findMissingSyncMutations({
    ...input,
    acknowledgements: input.acknowledgements ?? [],
  });
}

export function findMissingSyncMutations({
  nodes,
  contexts,
  relations,
  mutations,
  acknowledgements,
}: {
  nodes: Node[];
  contexts: Context[];
  relations: NodeContextRelation[];
  mutations: SyncMutationOutboxRecord[];
  acknowledgements: SyncEntityAcknowledgementRecord[];
}): OrphanEntity[] {
  const activeMutations = mutations.filter((record) =>
    record.status === "PENDING" ||
    record.status === "PROCESSING" ||
    record.status === "FAILED" ||
    record.status === "CONFLICT",
  );
  const hasMutation = (entityType: OrphanEntityType, entityId: string) =>
    activeMutations.some(
      (record) =>
        record.mutation.entityType === entityType &&
        record.mutation.entityId === entityId,
    );

  return [
    ...nodes.flatMap((node) =>
      needsMutation({
        entityType: "capture",
        entityId: node.id,
        localVersion: node.version,
        localUpdatedAt: node.updatedAt,
        hasMutation,
        acknowledgements,
      }),
    ),
    ...contexts.flatMap((context) =>
      needsMutation({
        entityType: "concept",
        entityId: context.id,
        localVersion: context.version,
        localUpdatedAt: context.updatedAt,
        hasMutation,
        acknowledgements,
      }),
    ),
    ...relations.flatMap((relation) =>
      needsMutation({
        entityType: "captureConcept",
        entityId: relation.id,
        localVersion: relation.version,
        localUpdatedAt: relation.createdAt,
        hasMutation,
        acknowledgements,
      }),
    ),
  ];
}

function needsMutation({
  entityType,
  entityId,
  localVersion,
  localUpdatedAt,
  hasMutation,
  acknowledgements,
}: {
  entityType: OrphanEntityType;
  entityId: string;
  localVersion: number;
  localUpdatedAt: string | null;
  hasMutation: (entityType: OrphanEntityType, entityId: string) => boolean;
  acknowledgements: SyncEntityAcknowledgementRecord[];
}): OrphanEntity[] {
  if (hasMutation(entityType, entityId)) {
    return [];
  }

  const acknowledgement = acknowledgements.find(
    (record) => record.entityType === entityType && record.entityId === entityId,
  );

  if (!acknowledgement) {
    return [{
      entityType,
      entityId,
      localVersion,
      localUpdatedAt,
      reason: "NEVER_ACKNOWLEDGED",
    }];
  }

  if (
    acknowledgement.acknowledgedLocalVersion !== null &&
    localVersion > acknowledgement.acknowledgedLocalVersion
  ) {
    return [{
      entityType,
      entityId,
      localVersion,
      localUpdatedAt,
      reason: "LOCAL_VERSION_AHEAD",
    }];
  }

  if (
    acknowledgement.acknowledgedLocalVersion === null &&
    localUpdatedAt &&
    acknowledgement.acknowledgedLocalUpdatedAt &&
    localUpdatedAt > acknowledgement.acknowledgedLocalUpdatedAt
  ) {
    return [{
      entityType,
      entityId,
      localVersion,
      localUpdatedAt,
      reason: "LOCAL_VERSION_AHEAD",
    }];
  }

  return [];
}

function createHealthCheck({
  workspaceId,
  deviceId,
  syncState,
  metadata,
  mutations,
}: {
  workspaceId: string;
  deviceId: string;
  syncState: SyncState;
  metadata: SyncMetadataRecord | null;
  mutations: SyncMutationOutboxRecord[];
}): MemoryReconciliationHealthCheck {
  return {
    workspaceId,
    deviceId,
    generation: metadata?.pullCursor ?? null,
    offline: syncState.connectivity === "OFFLINE",
    pendingMutations: countStatus(mutations, "PENDING"),
    processingMutations: countStatus(mutations, "PROCESSING"),
    failedMutations: countStatus(mutations, "FAILED"),
    conflictMutations: countStatus(mutations, "CONFLICT"),
    localCursor: metadata?.pullCursor ?? null,
  };
}

function createOrphanMutation({
  orphan,
  nodes,
  contexts,
  relations,
  mutationId,
}: {
  orphan: OrphanEntity;
  nodes: Node[];
  contexts: Context[];
  relations: NodeContextRelation[];
  mutationId: string;
}) {
  if (orphan.entityType === "capture") {
    const node = nodes.find((candidate) => candidate.id === orphan.entityId);
    return node
      ? {
        createdAt: node.updatedAt,
        localVersion: node.version,
        mutation: mapLocalNodeToCaptureMutation({
          mutationId,
          node,
          baseVersion: null,
        }),
      }
      : null;
  }

  if (orphan.entityType === "concept") {
    const context = contexts.find((candidate) => candidate.id === orphan.entityId);
    return context
      ? {
        createdAt: context.updatedAt,
        localVersion: context.version,
        mutation: mapLocalContextToConceptMutation({
          mutationId,
          context,
          baseVersion: null,
        }),
      }
      : null;
  }

  const relation = relations.find((candidate) => candidate.id === orphan.entityId);
  return relation
    ? {
      createdAt: relation.createdAt,
      localVersion: relation.version,
      mutation: mapLocalRelationToCaptureConceptMutation({
        mutationId,
        relation,
        baseVersion: null,
      }),
    }
    : null;
}

function deriveReconciliationStatus({
  health,
  remainingBlockingMutations,
  convergence,
}: {
  health: MemoryReconciliationHealthCheck;
  orphanEntities: OrphanEntity[];
  remainingBlockingMutations: number;
  convergence: MemoryConvergenceResult;
}): MemoryReconciliationStatus {
  if (health.offline) {
    return "OFFLINE";
  }

  if (health.conflictMutations > 0) {
    return "CONFLICT";
  }

  if (health.failedMutations > 0 || convergence.status === "DIVERGED") {
    return "DIVERGENCE_DETECTED";
  }

  if (remainingBlockingMutations > 0 || convergence.status === "PENDING") {
    return "PENDING_CHANGES";
  }

  return "MEMORY_INTEGRAL";
}

function countStatus(
  mutations: SyncMutationOutboxRecord[],
  status: SyncMutationOutboxRecord["status"],
) {
  return mutations.filter((mutation) => mutation.status === status).length;
}
