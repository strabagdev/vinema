import type {
  CaptureConceptEntity,
  CaptureEntity,
  ConceptEntity,
  PullResponse,
} from "@vinema/sync-contracts";
import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import { normalizeStoredContext } from "@/infrastructure/context/indexed-db-context-repository";
import { normalizeStoredNodeContextRelation } from "@/infrastructure/context/indexed-db-node-context-relation-repository";
import { normalizeStoredNode } from "@/infrastructure/node/indexed-db-node-repository";
import {
  CONTEXTS_STORE,
  NODE_CONTEXT_RELATIONS_STORE,
  NODES_STORE,
  SYNC_MUTATIONS_STORE,
} from "@/infrastructure/storage/vinema-db";
import {
  mapRemoteCaptureConceptToLocalRelation,
  mapRemoteCaptureToLocalNode,
  mapRemoteConceptToLocalContext,
} from "@/features/sync/sync-mappers";
import type {
  SyncMutationOutboxRecord,
  SyncMutationOutboxStatus,
} from "@/features/sync/sync-outbox-repository";

export type RemoteSyncChange = PullResponse["changes"][number];
type RemoteEntitySyncChange = Exclude<
  RemoteSyncChange,
  { entityType: "workspaceKnowledgeReset" }
>;

export type RemoteChangeApplierResult = {
  applied: number;
  ignored: number;
  idempotent: number;
  conflicts: RemoteChangeConflict[];
};

export type RemoteChangeConflict = {
  entityType: Exclude<RemoteSyncChange["entityType"], "workspaceKnowledgeReset">;
  entityId: string;
  mutationId: string;
  remoteVersion: number;
  localStatus: SyncMutationOutboxStatus;
};

export type RemoteChangeApplierTransaction = {
  objectStore(name: typeof NODES_STORE): RemoteObjectStore<Node>;
  objectStore(name: typeof CONTEXTS_STORE): RemoteObjectStore<Context>;
  objectStore(
    name: typeof NODE_CONTEXT_RELATIONS_STORE,
  ): RemoteObjectStore<NodeContextRelation>;
  objectStore(
    name: typeof SYNC_MUTATIONS_STORE,
  ): RemoteObjectStore<SyncMutationOutboxRecord>;
};

type RemoteObjectStore<T> = {
  get(key: string): Promise<T | undefined>;
  getAll(): Promise<T[]>;
  put(value: T): Promise<unknown>;
  delete(key: string): Promise<unknown>;
};

type ApplyRemoteChangesInput = {
  transaction: RemoteChangeApplierTransaction;
  changes: RemoteSyncChange[];
  workspaceId: string;
  deviceId: string;
};

export class RemoteChangeApplyError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "RemoteChangeApplyError";
  }
}

export function createRemoteChangeApplier() {
  return {
    applyChanges(input: ApplyRemoteChangesInput) {
      return applyRemoteChanges(input);
    },
  };
}

export async function applyRemoteChanges({
  transaction,
  changes,
  workspaceId,
  deviceId,
}: ApplyRemoteChangesInput): Promise<RemoteChangeApplierResult> {
  const result: RemoteChangeApplierResult = {
    applied: 0,
    ignored: 0,
    idempotent: 0,
    conflicts: [],
  };
  const resetChanges = changes.filter(isWorkspaceKnowledgeResetChange);
  const entityChanges = changes.filter(
    (change): change is RemoteEntitySyncChange =>
      change.entityType !== "captureConcept" &&
      change.entityType !== "workspaceKnowledgeReset",
  );
  const relationChanges = changes.filter(
    (change): change is RemoteEntitySyncChange =>
      change.entityType === "captureConcept",
  );

  for (const change of resetChanges) {
    await applyWorkspaceKnowledgeReset({
      transaction,
      change,
      workspaceId,
      result,
    });
  }

  for (const change of entityChanges) {
    await applyChange({
      transaction,
      change,
      workspaceId,
      deviceId,
      result,
    });
  }

  for (const change of relationChanges) {
    await applyChange({
      transaction,
      change,
      workspaceId,
      deviceId,
      result,
    });
  }

  return result;
}

async function applyChange(input: {
  transaction: RemoteChangeApplierTransaction;
  change: RemoteEntitySyncChange;
  workspaceId: string;
  deviceId: string;
  result: RemoteChangeApplierResult;
}) {
  assertWorkspace(input.change, input.workspaceId);
  const conflict = await findLocalConflict(
    input.transaction,
    input.change.entityType,
    input.change.entity.id,
  );

  if (conflict) {
    await markLocalMutationConflict(input.transaction, conflict, input.change);
    input.result.conflicts.push({
      entityType: input.change.entityType,
      entityId: input.change.entity.id,
      mutationId: conflict.mutationId,
      remoteVersion: input.change.entity.version,
      localStatus: conflict.status,
    });
    return;
  }

  if (input.change.entityType === "capture") {
    await applyCapture({
      transaction: input.transaction,
      change: input.change,
      entity: input.change.entity as CaptureEntity,
      deviceId: input.deviceId,
      result: input.result,
    });
    return;
  }

  if (input.change.entityType === "concept") {
    await applyConcept({
      transaction: input.transaction,
      change: input.change,
      entity: input.change.entity as ConceptEntity,
      result: input.result,
    });
    return;
  }

  await applyCaptureConcept({
    transaction: input.transaction,
    change: input.change,
    entity: input.change.entity as CaptureConceptEntity,
    result: input.result,
  });
}

function isWorkspaceKnowledgeResetChange(
  change: RemoteSyncChange,
): change is Extract<RemoteSyncChange, { entityType: "workspaceKnowledgeReset" }> {
  return change.entityType === "workspaceKnowledgeReset";
}

async function applyWorkspaceKnowledgeReset(input: {
  transaction: RemoteChangeApplierTransaction;
  change: Extract<RemoteSyncChange, { entityType: "workspaceKnowledgeReset" }>;
  workspaceId: string;
  result: RemoteChangeApplierResult;
}) {
  if (input.change.reset.workspaceId !== input.workspaceId) {
    throw new RemoteChangeApplyError(
      "WORKSPACE_MISMATCH",
      "El reset remoto pertenece a otro workspace.",
    );
  }

  const [relations, nodes, contexts, mutations] = await Promise.all([
    input.transaction.objectStore(NODE_CONTEXT_RELATIONS_STORE).getAll(),
    input.transaction.objectStore(NODES_STORE).getAll(),
    input.transaction.objectStore(CONTEXTS_STORE).getAll(),
    input.transaction.objectStore(SYNC_MUTATIONS_STORE).getAll(),
  ]);
  let deleted = 0;

  for (const relation of relations) {
    if (relation.workspaceId === input.workspaceId) {
      await input.transaction.objectStore(NODE_CONTEXT_RELATIONS_STORE).delete(relation.id);
      deleted += 1;
    }
  }
  for (const node of nodes) {
    if (node.workspaceId === input.workspaceId) {
      await input.transaction.objectStore(NODES_STORE).delete(node.id);
      deleted += 1;
    }
  }
  for (const context of contexts) {
    if (context.workspaceId === input.workspaceId) {
      await input.transaction.objectStore(CONTEXTS_STORE).delete(context.id);
      deleted += 1;
    }
  }
  for (const mutation of mutations) {
    if (mutation.workspaceId === input.workspaceId) {
      await input.transaction.objectStore(SYNC_MUTATIONS_STORE).delete(mutation.mutationId);
    }
  }

  if (deleted > 0) {
    input.result.applied += 1;
    return;
  }

  input.result.idempotent += 1;
}

async function applyCapture({
  transaction,
  entity,
  deviceId,
  result,
}: {
  transaction: RemoteChangeApplierTransaction;
  change: RemoteEntitySyncChange;
  entity: CaptureEntity;
  deviceId: string;
  result: RemoteChangeApplierResult;
}) {
  const store = transaction.objectStore(NODES_STORE);
  const existing = normalizeStoredNode(await store.get(entity.id));
  const decision = decideVersion(existing?.version ?? null, entity.version);

  if (decision === "IGNORE") {
    result.ignored += 1;
    return;
  }

  if (decision === "IDEMPOTENT") {
    result.idempotent += 1;
    return;
  }

  await store.put(mapRemoteCaptureToLocalNode(entity, deviceId));
  result.applied += 1;
}

async function applyConcept({
  transaction,
  entity,
  result,
}: {
  transaction: RemoteChangeApplierTransaction;
  change: RemoteEntitySyncChange;
  entity: ConceptEntity;
  result: RemoteChangeApplierResult;
}) {
  const store = transaction.objectStore(CONTEXTS_STORE);
  const existing = normalizeStoredContext(await store.get(entity.id));
  const decision = decideVersion(existing?.version ?? null, entity.version);

  if (decision === "IGNORE") {
    result.ignored += 1;
    return;
  }

  if (decision === "IDEMPOTENT") {
    result.idempotent += 1;
    return;
  }

  await store.put(mapRemoteConceptToLocalContext(entity));
  result.applied += 1;
}

async function applyCaptureConcept({
  transaction,
  change,
  entity,
  result,
}: {
  transaction: RemoteChangeApplierTransaction;
  change: RemoteEntitySyncChange;
  entity: CaptureConceptEntity;
  result: RemoteChangeApplierResult;
}) {
  const store = transaction.objectStore(NODE_CONTEXT_RELATIONS_STORE);
  const existing = normalizeStoredNodeContextRelation(
    await store.get(entity.id),
  );
  const decision = decideVersion(existing?.version ?? null, entity.version);

  if (decision === "IGNORE") {
    result.ignored += 1;
    return;
  }

  if (entity.archivedAt !== null || change.operation === "archive") {
    if (existing) {
      await store.delete(entity.id);
      result.applied += 1;
      return;
    }

    result.idempotent += 1;
    return;
  }

  if (decision === "IDEMPOTENT") {
    result.idempotent += 1;
    return;
  }

  await assertRelationDependencies(transaction, change);
  await store.put(mapRemoteCaptureConceptToLocalRelation(entity));
  result.applied += 1;
}

async function assertRelationDependencies(
  transaction: RemoteChangeApplierTransaction,
  change: RemoteEntitySyncChange,
) {
  const entity = change.entity as CaptureConceptEntity;
  const node = normalizeStoredNode(
    await transaction.objectStore(NODES_STORE).get(entity.captureId),
  );
  const context = normalizeStoredContext(
    await transaction.objectStore(CONTEXTS_STORE).get(entity.conceptId),
  );

  if (!node || !context) {
    throw new RemoteChangeApplyError(
      "MISSING_RELATION_DEPENDENCY",
      "La relacion remota requiere captura y concepto locales.",
      {
        relationId: change.entity.id,
        captureId: entity.captureId,
        conceptId: entity.conceptId,
      },
    );
  }
}

async function findLocalConflict(
  transaction: RemoteChangeApplierTransaction,
  entityType: RemoteEntitySyncChange["entityType"],
  entityId: string,
) {
  const records = await transaction.objectStore(SYNC_MUTATIONS_STORE).getAll();
  return records.find(
    (record) =>
      record.mutation.entityType === entityType &&
      record.mutation.entityId === entityId &&
      isLocalPendingStatus(record.status),
  );
}

async function markLocalMutationConflict(
  transaction: RemoteChangeApplierTransaction,
  record: SyncMutationOutboxRecord,
  change: RemoteEntitySyncChange,
) {
  await transaction.objectStore(SYNC_MUTATIONS_STORE).put({
    ...record,
    status: "CONFLICT",
    conflictData: {
      reason: "REMOTE_CHANGE_CONFLICT",
      remoteChange: {
        sequence: change.sequence,
        entityType: change.entityType,
        entityId: change.entity.id,
        version: change.entity.version,
      },
    },
  });
}

function isLocalPendingStatus(status: SyncMutationOutboxStatus) {
  return status === "PENDING" || status === "PROCESSING" || status === "FAILED";
}

function assertWorkspace(change: RemoteEntitySyncChange, workspaceId: string) {
  if (change.entity.workspaceId !== workspaceId) {
    throw new RemoteChangeApplyError(
      "WORKSPACE_MISMATCH",
      "El cambio remoto pertenece a otro workspace.",
      {
        expectedWorkspaceId: workspaceId,
        actualWorkspaceId: change.entity.workspaceId,
      },
    );
  }
}

function decideVersion(
  localVersion: number | null,
  remoteVersion: number,
): "APPLY" | "IDEMPOTENT" | "IGNORE" {
  if (localVersion === null) {
    return "APPLY";
  }

  if (remoteVersion > localVersion) {
    return "APPLY";
  }

  if (remoteVersion === localVersion) {
    return "IDEMPOTENT";
  }

  return "IGNORE";
}
