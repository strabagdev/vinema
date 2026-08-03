import { clearCaptureDraft } from "@/features/capture/capture-draft";
import { emitSyncDataChanged } from "@/features/sync/sync-data-events";
import type { KnowledgeResetResponse } from "@vinema/sync-contracts";
import {
  CONTEXTS_STORE,
  NODE_CONTEXT_RELATIONS_STORE,
  NODES_STORE,
  SYNC_ENTITY_ACKS_STORE,
  SYNC_METADATA_STORE,
  SYNC_MUTATIONS_STORE,
  getVinemaDb,
} from "@/infrastructure/storage/vinema-db";
import type { StorageAdapter } from "@/infrastructure/storage/storage-adapter";

export const KNOWLEDGE_RESET_CONFIRMATION = "VACIAR";

export type KnowledgeResetCounts = {
  nodes: number;
  contexts: number;
  relations: number;
};

export type KnowledgeResetRemoteClient = {
  reset(input: {
    workspaceId: string;
    confirmation: typeof KNOWLEDGE_RESET_CONFIRMATION;
    signal?: AbortSignal;
  }): Promise<KnowledgeResetResponse>;
};

export type ResetKnowledgeInput = {
  workspaceId: string;
  confirmation: string;
  storage: StorageAdapter;
  remoteClient: KnowledgeResetRemoteClient;
  signal?: AbortSignal;
};

export type ResetKnowledgeResult = {
  remote: KnowledgeResetResponse;
  local: KnowledgeResetCounts;
};

export class KnowledgeResetError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "KnowledgeResetError";
  }
}

let activeReset = false;

export function isKnowledgeResetRunning() {
  return activeReset;
}

export async function resetKnowledge({
  workspaceId,
  confirmation,
  storage,
  remoteClient,
  signal,
}: ResetKnowledgeInput): Promise<ResetKnowledgeResult> {
  assertConfirmation(confirmation);

  if (activeReset) {
    throw new KnowledgeResetError(
      "RESET_IN_PROGRESS",
      "Ya hay un vaciado de conocimiento en curso.",
    );
  }

  activeReset = true;
  try {
    const remote = await remoteClient.reset({
      workspaceId,
      confirmation: KNOWLEDGE_RESET_CONFIRMATION,
      signal,
    });
    const local = await clearLocalKnowledge({
      workspaceId,
      storage,
      resetVersion: remote.resetVersion,
      occurredAt: remote.occurredAt,
    });
    emitResetInvalidation(workspaceId);
    return { remote, local };
  } finally {
    activeReset = false;
  }
}

export async function summarizeLocalKnowledge(workspaceId: string) {
  const db = await getVinemaDb();
  const [nodes, contexts, relations] = await Promise.all([
    db.getAllFromIndex(NODES_STORE, "by-workspace", workspaceId),
    db.getAllFromIndex(CONTEXTS_STORE, "by-workspace", workspaceId),
    db.getAllFromIndex(NODE_CONTEXT_RELATIONS_STORE, "by-workspace", workspaceId),
  ]);

  return {
    nodes: nodes.length,
    contexts: contexts.length,
    relations: relations.length,
  };
}

export async function clearLocalKnowledge({
  workspaceId,
  storage,
  resetVersion,
  occurredAt,
}: {
  workspaceId: string;
  storage: StorageAdapter;
  resetVersion: string;
  occurredAt: string;
}): Promise<KnowledgeResetCounts> {
  const db = await getVinemaDb();
  const transaction = db.transaction(
    [
      NODE_CONTEXT_RELATIONS_STORE,
      NODES_STORE,
      CONTEXTS_STORE,
      SYNC_ENTITY_ACKS_STORE,
      SYNC_MUTATIONS_STORE,
      SYNC_METADATA_STORE,
    ],
    "readwrite",
  );
  let counts: KnowledgeResetCounts;

  try {
    const relations = await transaction
      .objectStore(NODE_CONTEXT_RELATIONS_STORE)
      .index("by-workspace")
      .getAll(workspaceId);
    const nodes = await transaction
      .objectStore(NODES_STORE)
      .index("by-workspace")
      .getAll(workspaceId);
    const contexts = await transaction
      .objectStore(CONTEXTS_STORE)
      .index("by-workspace")
      .getAll(workspaceId);
    const mutations = await transaction
      .objectStore(SYNC_MUTATIONS_STORE)
      .index("by-workspace")
      .getAll(workspaceId);
    const acknowledgements = await transaction
      .objectStore(SYNC_ENTITY_ACKS_STORE)
      .index("by-workspace")
      .getAll(workspaceId);
    const metadata = await transaction
      .objectStore(SYNC_METADATA_STORE)
      .index("by-workspace")
      .getAll(workspaceId);

    for (const relation of relations) {
      await transaction.objectStore(NODE_CONTEXT_RELATIONS_STORE).delete(relation.id);
    }
    for (const node of nodes) {
      await transaction.objectStore(NODES_STORE).delete(node.id);
    }
    for (const context of contexts) {
      await transaction.objectStore(CONTEXTS_STORE).delete(context.id);
    }
    for (const mutation of mutations) {
      await transaction.objectStore(SYNC_MUTATIONS_STORE).delete(mutation.mutationId);
    }
    for (const acknowledgement of acknowledgements) {
      await transaction.objectStore(SYNC_ENTITY_ACKS_STORE).delete([
        acknowledgement.workspaceId,
        acknowledgement.entityType,
        acknowledgement.entityId,
      ]);
    }
    for (const record of metadata) {
      await transaction.objectStore(SYNC_METADATA_STORE).put({
        ...record,
        pullCursor: resetVersion,
        lastSuccessfulPullAt: occurredAt,
        lastSyncErrorCode: null,
        lastSyncErrorMessage: null,
        updatedAt: occurredAt,
      });
    }

    await transaction.done;
    counts = {
      nodes: nodes.length,
      contexts: contexts.length,
      relations: relations.length,
    };
  } catch (error) {
    transaction.abort();
    await transaction.done.catch(() => undefined);
    throw error;
  }

  await clearCaptureDraft(storage);
  return counts;
}

export function assertConfirmation(confirmation: string) {
  if (confirmation !== KNOWLEDGE_RESET_CONFIRMATION) {
    throw new KnowledgeResetError(
      "INVALID_CONFIRMATION",
      "La confirmacion de vaciado no coincide.",
    );
  }
}

function emitResetInvalidation(workspaceId: string) {
  emitSyncDataChanged({
    workspaceId,
    entityTypes: ["capture", "concept", "captureConcept"],
    changedAt: new Date().toISOString(),
  });
}
