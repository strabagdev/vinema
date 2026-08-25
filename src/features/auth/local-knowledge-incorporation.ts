import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import {
  createConceptIdentity,
  normalizeConceptIdentityLabel,
} from "@/features/concepts/concept-identity";
import { emitSyncDataChanged } from "@/features/sync/sync-data-events";
import { IndexedDbSyncOutboxRepository } from "@/features/sync/sync-outbox-repository";
import type {
  LocalAuthIdentityStorage,
  StoredLocalAuthIdentity,
} from "@/features/auth/storage/auth-session-storage";
import { isMigratedLocalAuthIdentity } from "@/features/auth/storage/auth-session-storage";
import { createLocalSyncRepositorySet } from "@/infrastructure/repositories";
import {
  CONTEXTS_STORE,
  NODE_CONTEXT_RELATIONS_STORE,
  NODES_STORE,
  SYNC_ENTITY_ACKS_STORE,
  SYNC_METADATA_STORE,
  SYNC_MUTATIONS_STORE,
  getVinemaDb,
} from "@/infrastructure/storage/vinema-db";
import {
  IndexedDbContextRepository,
} from "@/infrastructure/context/indexed-db-context-repository";
import {
  IndexedDbNodeContextRelationRepository,
} from "@/infrastructure/context/indexed-db-node-context-relation-repository";
import { IndexedDbNodeRepository } from "@/infrastructure/node/indexed-db-node-repository";

export type LocalKnowledgeIncorporationOffer = {
  identity: StoredLocalAuthIdentity;
  counts: {
    captures: number;
    concepts: number;
    relations: number;
  };
  interrupted: boolean;
};

export type LocalKnowledgeIncorporationResult = {
  migrated: {
    captures: number;
    concepts: number;
    relations: number;
  };
  reused: {
    captures: number;
    concepts: number;
    relations: number;
  };
  cleaned: {
    captures: number;
    concepts: number;
    relations: number;
  };
};

export class LocalKnowledgeIncorporationError extends Error {
  constructor(
    public readonly code:
      | "NO_LOCAL_IDENTITY"
      | "LOCAL_ALREADY_MIGRATED"
      | "REMOTE_SESSION_MISSING"
      | "REMOTE_SYNC_NOT_CONFIRMED"
      | "INCORPORATION_FAILED",
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "LocalKnowledgeIncorporationError";
  }
}

export async function detectLocalKnowledgeIncorporationOffer({
  localAuthIdentityStorage,
}: {
  localAuthIdentityStorage: LocalAuthIdentityStorage;
}): Promise<LocalKnowledgeIncorporationOffer | null> {
  const identity = await localAuthIdentityStorage.load();
  if (!identity || isMigratedLocalAuthIdentity(identity)) {
    return null;
  }

  const snapshot = await readLocalKnowledgeSnapshot(identity.workspaceId);
  if (!hasLocalKnowledge(snapshot)) {
    return null;
  }

  return {
    identity,
    counts: {
      captures: snapshot.nodes.length,
      concepts: snapshot.contexts.length,
      relations: snapshot.relations.length,
    },
    interrupted: identity.migrationStatus === "LOCAL_MIGRATING",
  };
}

export async function incorporateLocalKnowledgeToRemoteAccount({
  localAuthIdentityStorage,
  remoteUserId,
  remoteWorkspaceId,
  remoteDeviceId,
  syncNow,
  clock = () => new Date().toISOString(),
  idFactory = createId,
  verifyRemoteSync = verifyMigratedEntitiesSynced,
  sleep = defaultSleep,
}: {
  localAuthIdentityStorage: LocalAuthIdentityStorage;
  remoteUserId: string | null | undefined;
  remoteWorkspaceId: string | null | undefined;
  remoteDeviceId: string | null | undefined;
  syncNow: () => Promise<void>;
  clock?: () => string;
  idFactory?: () => string;
  verifyRemoteSync?: (input: {
    workspaceId: string;
    entityIds: string[];
  }) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
}): Promise<LocalKnowledgeIncorporationResult> {
  if (!remoteUserId || !remoteWorkspaceId || !remoteDeviceId) {
    throw new LocalKnowledgeIncorporationError(
      "REMOTE_SESSION_MISSING",
      "No hay una cuenta remota lista para incorporar conocimiento.",
    );
  }

  const identity = await localAuthIdentityStorage.load();
  if (!identity) {
    throw new LocalKnowledgeIncorporationError(
      "NO_LOCAL_IDENTITY",
      "No existe identidad local para incorporar.",
    );
  }

  if (isMigratedLocalAuthIdentity(identity)) {
    throw new LocalKnowledgeIncorporationError(
      "LOCAL_ALREADY_MIGRATED",
      "Este conocimiento local ya fue incorporado a una cuenta.",
    );
  }

  const runId = idFactory();
  const startedAt = clock();
  await localAuthIdentityStorage.save({
    ...identity,
    active: false,
    migrationStatus: "LOCAL_MIGRATING",
    migrationStartedAt: startedAt,
    migrationRunId: runId,
    updatedAt: startedAt,
  });

  try {
    const snapshot = await readLocalKnowledgeSnapshot(identity.workspaceId);
    const remote = createLocalSyncRepositorySet({
      workspaceId: remoteWorkspaceId,
      deviceId: remoteDeviceId,
    });
    const remoteSnapshot = await readLocalKnowledgeSnapshot(remoteWorkspaceId);
    const migratedEntityIds = new Set<string>();
    const contextMap = new Map<string, string>();
    const nodeMap = new Map<string, string>();
    const result: LocalKnowledgeIncorporationResult = {
      migrated: { captures: 0, concepts: 0, relations: 0 },
      reused: { captures: 0, concepts: 0, relations: 0 },
      cleaned: { captures: 0, concepts: 0, relations: 0 },
    };

    const remoteContexts = [...remoteSnapshot.contexts];
    for (const context of snapshot.contexts) {
      const existing = findEquivalentContext(context, remoteContexts);
      if (existing) {
        const merged = mergeContext(existing, context, clock());
        if (merged !== existing) {
          await remote.contextRepository.save(merged);
          migratedEntityIds.add(merged.id);
        }
        contextMap.set(context.id, existing.id);
        result.reused.concepts += 1;
        continue;
      }

      const remoteContext = {
        ...context,
        id: idFactory(),
        workspaceId: remoteWorkspaceId,
      };
      await remote.contextRepository.save(remoteContext);
      remoteContexts.push(remoteContext);
      migratedEntityIds.add(remoteContext.id);
      contextMap.set(context.id, remoteContext.id);
      result.migrated.concepts += 1;
    }

    const remoteNodes = [...remoteSnapshot.nodes];
    for (const node of snapshot.nodes) {
      const existing = findEquivalentNode(node, remoteNodes, identity.workspaceId);
      if (existing) {
        nodeMap.set(node.id, existing.id);
        result.reused.captures += 1;
        continue;
      }

      const remoteNode = {
        ...node,
        id: idFactory(),
        workspaceId: remoteWorkspaceId,
        createdByDeviceId: remoteDeviceId,
        lastModifiedByDeviceId: remoteDeviceId,
        metadata: {
          ...node.metadata,
          localIncorporation: {
            sourceWorkspaceId: identity.workspaceId,
            sourceDeviceId: identity.deviceId,
            sourceNodeId: node.id,
            incorporatedAt: startedAt,
            migrationRunId: runId,
          },
        },
      };
      await remote.nodeRepository.create(remoteNode);
      remoteNodes.push(remoteNode);
      migratedEntityIds.add(remoteNode.id);
      nodeMap.set(node.id, remoteNode.id);
      result.migrated.captures += 1;
    }

    const remoteRelations = [...remoteSnapshot.relations];
    for (const relation of snapshot.relations) {
      const remoteNodeId = nodeMap.get(relation.nodeId);
      const remoteContextId = contextMap.get(relation.contextId);
      if (!remoteNodeId || !remoteContextId) {
        continue;
      }

      const remoteRelatedNodeId = relation.relatedNodeId
        ? nodeMap.get(relation.relatedNodeId)
        : undefined;
      const existing = remoteRelations.find((candidate) =>
        candidate.nodeId === remoteNodeId &&
        candidate.contextId === remoteContextId &&
        (candidate.relationType ?? "CONTEXT") === (relation.relationType ?? "CONTEXT") &&
        (candidate.relatedNodeId ?? null) === (remoteRelatedNodeId ?? null),
      );

      if (existing) {
        result.reused.relations += 1;
        continue;
      }

      const remoteRelation = {
        ...relation,
        id: idFactory(),
        workspaceId: remoteWorkspaceId,
        nodeId: remoteNodeId,
        contextId: remoteContextId,
        relatedNodeId: remoteRelatedNodeId,
      };
      await remote.nodeContextRelationRepository.save(remoteRelation);
      remoteRelations.push(remoteRelation);
      migratedEntityIds.add(remoteRelation.id);
      result.migrated.relations += 1;
    }

    await flushAndVerifyRemoteSync({
      syncNow,
      verifyRemoteSync,
      workspaceId: remoteWorkspaceId,
      entityIds: [...migratedEntityIds],
      sleep,
    });

    result.cleaned = await clearMigratedLocalKnowledge(identity.workspaceId);
    const migratedAt = clock();
    await localAuthIdentityStorage.save({
      ...identity,
      active: false,
      migrationStatus: "LOCAL_MIGRATED",
      migrationStartedAt: startedAt,
      migratedAt,
      migratedToUserId: remoteUserId,
      migratedToWorkspaceId: remoteWorkspaceId,
      migrationRunId: runId,
      updatedAt: migratedAt,
    });
    emitSyncDataChanged({
      workspaceId: remoteWorkspaceId,
      entityTypes: ["capture", "concept", "captureConcept"],
      changedAt: migratedAt,
    });
    return result;
  } catch (error) {
    const failedAt = clock();
    await localAuthIdentityStorage.save({
      ...identity,
      active: false,
      migrationStatus: "LOCAL_PENDING",
      migrationStartedAt: startedAt,
      migrationRunId: runId,
      updatedAt: failedAt,
    });

    if (error instanceof LocalKnowledgeIncorporationError) {
      throw error;
    }

    throw new LocalKnowledgeIncorporationError(
      "INCORPORATION_FAILED",
      "No se pudo incorporar el conocimiento local.",
      error,
    );
  }
}

async function readLocalKnowledgeSnapshot(workspaceId: string) {
  const [nodes, contexts, relations] = await Promise.all([
    new IndexedDbNodeRepository().listByWorkspace(workspaceId),
    new IndexedDbContextRepository().list({ workspaceId }),
    new IndexedDbNodeContextRelationRepository().listByWorkspace(workspaceId),
  ]);

  return { nodes, contexts, relations };
}

function hasLocalKnowledge(snapshot: {
  nodes: Node[];
  contexts: Context[];
  relations: NodeContextRelation[];
}) {
  return snapshot.nodes.length > 0 ||
    snapshot.contexts.length > 0 ||
    snapshot.relations.length > 0;
}

function findEquivalentContext(context: Context, candidates: Context[]) {
  const sourceKeys = new Set([
    normalizeConceptIdentityLabel(context.name),
    ...createConceptIdentity(context).normalizedAliases,
  ]);

  return candidates.find((candidate) => {
    const candidateKeys = new Set([
      normalizeConceptIdentityLabel(candidate.name),
      ...createConceptIdentity(candidate).normalizedAliases,
    ]);

    for (const key of sourceKeys) {
      if (candidateKeys.has(key)) {
        return true;
      }
    }

    return false;
  }) ?? null;
}

function mergeContext(remote: Context, local: Context, updatedAt: string) {
  const aliases = mergeAliases(remote.aliases ?? [], local.aliases ?? []);
  const normalizedAliases = mergeAliases(
    remote.normalizedAliases ?? [],
    local.normalizedAliases ?? [],
  );
  const description = remote.description ?? local.description;
  const changed = description !== remote.description ||
    aliases.join("\u0001") !== (remote.aliases ?? []).join("\u0001") ||
    normalizedAliases.join("\u0001") !== (remote.normalizedAliases ?? []).join("\u0001");

  if (!changed) {
    return remote;
  }

  return {
    ...remote,
    description,
    aliases,
    normalizedAliases,
    version: remote.version + 1,
    updatedAt,
  };
}

function mergeAliases(first: string[], second: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of [...first, ...second]) {
    const normalized = normalizeConceptIdentityLabel(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(value.trim());
  }
  return result;
}

function findEquivalentNode(
  node: Node,
  candidates: Node[],
  sourceWorkspaceId: string,
) {
  const contentKey = normalizeCaptureContent(node.content);
  return candidates.find((candidate) =>
    candidate.id === node.id ||
    normalizeCaptureContent(candidate.content) === contentKey ||
    getLocalIncorporationSource(candidate) === `${sourceWorkspaceId}:${node.id}`,
  ) ?? null;
}

function normalizeCaptureContent(content: string) {
  return content.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function getLocalIncorporationSource(node: Node) {
  const value = node.metadata.localIncorporation;
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  return typeof record.sourceWorkspaceId === "string" &&
    typeof record.sourceNodeId === "string"
    ? `${record.sourceWorkspaceId}:${record.sourceNodeId}`
    : null;
}

async function verifyMigratedEntitiesSynced({
  workspaceId,
  entityIds,
}: {
  workspaceId: string;
  entityIds: string[];
}) {
  const outboxRepository = new IndexedDbSyncOutboxRepository();
  for (const entityId of entityIds) {
    const pending = await outboxRepository.listByEntity({
      workspaceId,
      entityId,
    });
    if (pending.length > 0) {
      throw new LocalKnowledgeIncorporationError(
        "REMOTE_SYNC_NOT_CONFIRMED",
        "La sincronizacion remota aun no confirmo la incorporacion.",
        { entityId, statuses: pending.map((record) => record.status) },
      );
    }
  }
}

async function flushAndVerifyRemoteSync({
  syncNow,
  verifyRemoteSync,
  workspaceId,
  entityIds,
  attempts = 4,
  sleep = defaultSleep,
}: {
  syncNow: () => Promise<void>;
  verifyRemoteSync: (input: {
    workspaceId: string;
    entityIds: string[];
  }) => Promise<void>;
  workspaceId: string;
  entityIds: string[];
  attempts?: number;
  sleep?: (ms: number) => Promise<void>;
}) {
  if (entityIds.length === 0) {
    return;
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await syncNow();
    try {
      await verifyRemoteSync({ workspaceId, entityIds });
      return;
    } catch (error) {
      lastError = error;
      if (await hasBlockingOutboxStatus(workspaceId, entityIds)) {
        throw error;
      }

      if (attempt < attempts - 1) {
        await sleep(250 * (attempt + 1));
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new LocalKnowledgeIncorporationError(
    "REMOTE_SYNC_NOT_CONFIRMED",
    "La sincronizacion remota aun no confirmo la incorporacion.",
  );
}

async function hasBlockingOutboxStatus(workspaceId: string, entityIds: string[]) {
  const outboxRepository = new IndexedDbSyncOutboxRepository();
  for (const entityId of entityIds) {
    const records = await outboxRepository.listByEntity({ workspaceId, entityId });
    if (records.some((record) => record.status === "FAILED" || record.status === "CONFLICT")) {
      return true;
    }
  }

  return false;
}

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

async function clearMigratedLocalKnowledge(workspaceId: string) {
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
      await transaction.objectStore(SYNC_METADATA_STORE).delete([
        record.workspaceId,
        record.deviceId,
      ]);
    }

    await transaction.done;
    return {
      captures: nodes.length,
      concepts: contexts.length,
      relations: relations.length,
    };
  } catch (error) {
    transaction.abort();
    await transaction.done.catch(() => undefined);
    throw error;
  }
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `migration-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
