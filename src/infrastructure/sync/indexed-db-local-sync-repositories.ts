import type { Context } from "@/domain/context/context";
import type {
  ContextRepository,
  ListContextsOptions,
} from "@/domain/context/context-repository";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { NodeContextRelationRepository } from "@/domain/context/node-context-relation-repository";
import type { Node } from "@/domain/node/node";
import type { NodeRepository } from "@/domain/node/node-repository";
import { IndexedDbContextRepository } from "@/infrastructure/context/indexed-db-context-repository";
import {
  normalizeStoredNodeContextRelation,
  toStoredNodeContextRelation,
} from "@/infrastructure/context/indexed-db-node-context-relation-repository";
import { IndexedDbNodeContextRelationRepository } from "@/infrastructure/context/indexed-db-node-context-relation-repository";
import { IndexedDbNodeRepository } from "@/infrastructure/node/indexed-db-node-repository";
import {
  CONTEXTS_STORE,
  NODE_CONTEXT_RELATIONS_STORE,
  NODES_STORE,
  SYNC_MUTATIONS_STORE,
  getVinemaDb,
} from "@/infrastructure/storage/vinema-db";
import {
  mapLocalContextToConceptMutation,
  mapLocalNodeToCaptureMutation,
  mapLocalRelationToCaptureConceptMutation,
} from "@/features/sync/sync-mappers";
import {
  SyncOutboxError,
  createSyncMutationOutboxRecord,
  isSameEnqueuedMutation,
  type SyncMutationOutboxRecord,
} from "@/features/sync/sync-outbox-repository";
import { normalizeContextAliases } from "@/features/concepts/concept-identity";

export type MutationOrigin = "LOCAL" | "REMOTE" | "SYSTEM";
export type MutationIdFactory = () => string;
export type Clock = () => string;

export type LocalSyncContext = {
  workspaceId: string;
  deviceId: string;
};

export type LocalSyncRepositoryOptions = {
  syncContext: LocalSyncContext;
  origin?: MutationOrigin;
  mutationIdFactory?: MutationIdFactory;
  clock?: Clock;
};

export type LocalSyncWriteErrorCode =
  | "INVALID_SYNC_CONTEXT"
  | "INVALID_MUTATION_ORIGIN"
  | "DOMAIN_RECORD_NOT_FOUND"
  | "OUTBOX_ENQUEUE_FAILED"
  | "ATOMIC_WRITE_FAILED";

export class LocalSyncWriteError extends Error {
  constructor(
    public readonly code: LocalSyncWriteErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "LocalSyncWriteError";
  }
}

type OutboxStore = {
  get(mutationId: string): Promise<SyncMutationOutboxRecord | undefined>;
  put(record: SyncMutationOutboxRecord): Promise<unknown>;
};

type TransactionLike = {
  abort(): void;
  done: Promise<void>;
};

export class IndexedDbLocalSyncNodeRepository implements NodeRepository {
  private readonly delegate = new IndexedDbNodeRepository();
  private readonly origin: MutationOrigin;
  private readonly mutationIdFactory: MutationIdFactory;

  constructor(private readonly options: LocalSyncRepositoryOptions) {
    assertValidSyncContext(options.syncContext);
    this.origin = options.origin ?? "LOCAL";
    assertValidOrigin(this.origin);
    this.mutationIdFactory = options.mutationIdFactory ?? (() => crypto.randomUUID());
  }

  findById(id: string) {
    return this.delegate.findById(id);
  }

  listActive() {
    return this.delegate.listActive();
  }

  listInbox() {
    return this.delegate.listInbox();
  }

  listArchived() {
    return this.delegate.listArchived();
  }

  listByWorkspace(workspaceId: string, options?: { includeArchived?: boolean }) {
    return this.delegate.listByWorkspace(workspaceId, options);
  }

  async create(node: Node): Promise<Node> {
    assertSameWorkspace(this.options.syncContext, node.workspaceId);
    const db = await getVinemaDb();
    const transaction = db.transaction(
      [NODES_STORE, SYNC_MUTATIONS_STORE],
      "readwrite",
    );

    return runAtomically(transaction, async () => {
      await transaction.objectStore(NODES_STORE).add(node);
      await enqueueLocalMutation({
        outboxStore: transaction.objectStore(SYNC_MUTATIONS_STORE),
        syncContext: this.options.syncContext,
        origin: this.origin,
        at: node.createdAt,
        mutation: mapLocalNodeToCaptureMutation({
          mutationId: this.mutationIdFactory(),
          node,
          baseVersion: null,
        }),
      });
      await transaction.done;
      return node;
    });
  }

  async update(node: Node): Promise<Node> {
    assertSameWorkspace(this.options.syncContext, node.workspaceId);
    const db = await getVinemaDb();
    const transaction = db.transaction(
      [NODES_STORE, SYNC_MUTATIONS_STORE],
      "readwrite",
    );

    return runAtomically(transaction, async () => {
      const nodes = transaction.objectStore(NODES_STORE);
      const existing = await nodes.get(node.id);

      if (existing && !hasNodeSyncChange(existing, node)) {
        await transaction.done;
        return existing;
      }

      await nodes.put(node);
      await enqueueLocalMutation({
        outboxStore: transaction.objectStore(SYNC_MUTATIONS_STORE),
        syncContext: this.options.syncContext,
        origin: this.origin,
        at: node.updatedAt,
        mutation: mapLocalNodeToCaptureMutation({
          mutationId: this.mutationIdFactory(),
          node,
          baseVersion: existing?.version ?? null,
        }),
      });
      await transaction.done;
      return node;
    });
  }
}

export class IndexedDbLocalSyncContextRepository implements ContextRepository {
  private readonly delegate = new IndexedDbContextRepository();
  private readonly origin: MutationOrigin;
  private readonly mutationIdFactory: MutationIdFactory;

  constructor(private readonly options: LocalSyncRepositoryOptions) {
    assertValidSyncContext(options.syncContext);
    this.origin = options.origin ?? "LOCAL";
    assertValidOrigin(this.origin);
    this.mutationIdFactory = options.mutationIdFactory ?? (() => crypto.randomUUID());
  }

  getById(id: string) {
    return this.delegate.getById(id);
  }

  list(options: ListContextsOptions) {
    return this.delegate.list(options);
  }

  save(context: Context) {
    return this.persist(context);
  }

  archive(context: Context) {
    return this.persist(context);
  }

  restore(context: Context) {
    return this.persist(context);
  }

  private async persist(context: Context): Promise<Context> {
    const storedContext = normalizeContextAliases(context);
    assertSameWorkspace(this.options.syncContext, storedContext.workspaceId);
    const db = await getVinemaDb();
    const transaction = db.transaction(
      [CONTEXTS_STORE, SYNC_MUTATIONS_STORE],
      "readwrite",
    );

    return runAtomically(transaction, async () => {
      const contexts = transaction.objectStore(CONTEXTS_STORE);
      const existing = await contexts.get(storedContext.id);

      if (existing && !hasContextSyncChange(existing, storedContext)) {
        await transaction.done;
        return existing;
      }

      await contexts.put(storedContext);
      await enqueueLocalMutation({
        outboxStore: transaction.objectStore(SYNC_MUTATIONS_STORE),
        syncContext: this.options.syncContext,
        origin: this.origin,
        at: storedContext.updatedAt,
        mutation: mapLocalContextToConceptMutation({
          mutationId: this.mutationIdFactory(),
          context: storedContext,
          baseVersion: existing?.version ?? null,
        }),
      });
      await transaction.done;
      return storedContext;
    });
  }
}

export class IndexedDbLocalSyncNodeContextRelationRepository
  implements NodeContextRelationRepository
{
  private readonly delegate = new IndexedDbNodeContextRelationRepository();
  private readonly origin: MutationOrigin;
  private readonly mutationIdFactory: MutationIdFactory;
  private readonly clock: Clock;

  constructor(private readonly options: LocalSyncRepositoryOptions) {
    assertValidSyncContext(options.syncContext);
    this.origin = options.origin ?? "LOCAL";
    assertValidOrigin(this.origin);
    this.mutationIdFactory = options.mutationIdFactory ?? (() => crypto.randomUUID());
    this.clock = options.clock ?? (() => new Date().toISOString());
  }

  getByNodeAndContext(nodeId: string, contextId: string) {
    return this.delegate.getByNodeAndContext(nodeId, contextId);
  }

  listByNodeId(nodeId: string) {
    return this.delegate.listByNodeId(nodeId);
  }

  listByContextId(contextId: string) {
    return this.delegate.listByContextId(contextId);
  }

  listByWorkspace(workspaceId: string) {
    return this.delegate.listByWorkspace(workspaceId);
  }

  async save(relation: NodeContextRelation): Promise<NodeContextRelation> {
    assertSameWorkspace(this.options.syncContext, relation.workspaceId);
    const db = await getVinemaDb();
    const transaction = db.transaction(
      [NODE_CONTEXT_RELATIONS_STORE, SYNC_MUTATIONS_STORE],
      "readwrite",
    );

    return runAtomically(transaction, async () => {
      const relations = transaction.objectStore(NODE_CONTEXT_RELATIONS_STORE);
      const existing = normalizeStoredNodeContextRelation(
        await relations.get(relation.id),
      );
      const storedRelation = toStoredNodeContextRelation({
        ...relation,
        version: existing ? existing.version + 1 : relation.version,
      });

      if (existing && !hasRelationSyncChange(existing, storedRelation)) {
        await transaction.done;
        return existing;
      }

      await relations.put(storedRelation);
      await enqueueLocalMutation({
        outboxStore: transaction.objectStore(SYNC_MUTATIONS_STORE),
        syncContext: this.options.syncContext,
        origin: this.origin,
        at: storedRelation.createdAt,
        mutation: mapLocalRelationToCaptureConceptMutation({
          mutationId: this.mutationIdFactory(),
          relation: storedRelation,
          baseVersion: existing?.version ?? null,
        }),
      });
      await transaction.done;
      return storedRelation;
    });
  }

  async delete(id: string): Promise<void> {
    const db = await getVinemaDb();
    const transaction = db.transaction(
      [NODE_CONTEXT_RELATIONS_STORE, SYNC_MUTATIONS_STORE],
      "readwrite",
    );

    await runAtomically(transaction, async () => {
      const relations = transaction.objectStore(NODE_CONTEXT_RELATIONS_STORE);
      const existing = normalizeStoredNodeContextRelation(await relations.get(id));

      if (!existing) {
        await transaction.done;
        return;
      }

      assertSameWorkspace(this.options.syncContext, existing.workspaceId);
      const archivedAt = this.clock();
      await relations.delete(id);
      await enqueueLocalMutation({
        outboxStore: transaction.objectStore(SYNC_MUTATIONS_STORE),
        syncContext: this.options.syncContext,
        origin: this.origin,
        at: archivedAt,
        mutation: mapLocalRelationToCaptureConceptMutation({
          mutationId: this.mutationIdFactory(),
          relation: existing,
          baseVersion: existing.version,
          updatedAt: archivedAt,
          archivedAt,
        }),
      });
      await transaction.done;
    });
  }
}

export function createLocalSyncRepositories(
  options: LocalSyncRepositoryOptions,
) {
  return {
    contextRepository: new IndexedDbLocalSyncContextRepository(options),
    nodeContextRelationRepository:
      new IndexedDbLocalSyncNodeContextRelationRepository(options),
    nodeRepository: new IndexedDbLocalSyncNodeRepository(options),
  };
}

async function enqueueLocalMutation({
  outboxStore,
  syncContext,
  origin,
  at,
  mutation,
}: {
  outboxStore: OutboxStore;
  syncContext: LocalSyncContext;
  origin: MutationOrigin;
  at: string;
  mutation: Parameters<typeof createSyncMutationOutboxRecord>[0]["mutation"];
}) {
  if (origin !== "LOCAL") {
    return null;
  }

  try {
    const record = createSyncMutationOutboxRecord(
      {
        workspaceId: syncContext.workspaceId,
        deviceId: syncContext.deviceId,
        mutation,
        createdAt: at,
      },
      at,
    );
    const existing = await outboxStore.get(record.mutationId);

    if (existing) {
      if (!isSameEnqueuedMutation(existing, record)) {
        throw new LocalSyncWriteError(
          "OUTBOX_ENQUEUE_FAILED",
          "La mutacion local ya existe con contenido distinto.",
          { mutationId: record.mutationId },
        );
      }

      return existing;
    }

    await outboxStore.put(record);
    return record;
  } catch (error) {
    if (error instanceof LocalSyncWriteError) {
      throw error;
    }

    throw new LocalSyncWriteError(
      "OUTBOX_ENQUEUE_FAILED",
      "No se pudo registrar la mutacion local en la cola de sincronizacion.",
      error instanceof SyncOutboxError
        ? { code: error.code, details: error.details }
        : undefined,
    );
  }
}

async function runAtomically<T>(
  transaction: TransactionLike,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // The transaction may already be inactive after an IndexedDB request error.
    }
    await transaction.done.catch(() => undefined);

    if (error instanceof LocalSyncWriteError) {
      throw error;
    }

    throw new LocalSyncWriteError(
      "ATOMIC_WRITE_FAILED",
      "No se pudo completar la escritura local y su mutacion de sincronizacion.",
      error,
    );
  }
}

function assertValidSyncContext(context: LocalSyncContext) {
  if (!context.workspaceId.trim() || !context.deviceId.trim()) {
    throw new LocalSyncWriteError(
      "INVALID_SYNC_CONTEXT",
      "El contexto local de sincronizacion requiere workspaceId y deviceId.",
      context,
    );
  }
}

function assertValidOrigin(origin: MutationOrigin) {
  if (origin !== "LOCAL" && origin !== "REMOTE" && origin !== "SYSTEM") {
    throw new LocalSyncWriteError(
      "INVALID_MUTATION_ORIGIN",
      "El origen de la mutacion local no es valido.",
      { origin },
    );
  }
}

function assertSameWorkspace(
  context: LocalSyncContext,
  entityWorkspaceId: string,
) {
  if (context.workspaceId !== entityWorkspaceId) {
    throw new LocalSyncWriteError(
      "INVALID_SYNC_CONTEXT",
      "La entidad local pertenece a otro workspace.",
      { contextWorkspaceId: context.workspaceId, entityWorkspaceId },
    );
  }
}

function hasNodeSyncChange(existing: Node, next: Node) {
  return (
    existing.type !== next.type ||
    existing.organizationStatus !== next.organizationStatus ||
    existing.content !== next.content ||
    existing.status !== next.status ||
    (existing.archivedAt ?? null) !== (next.archivedAt ?? null)
  );
}

function hasContextSyncChange(existing: Context, next: Context) {
  return (
    existing.name !== next.name ||
    (existing.description ?? null) !== (next.description ?? null) ||
    (existing.aliases ?? []).join("\u0001") !== (next.aliases ?? []).join("\u0001") ||
    (existing.normalizedAliases ?? []).join("\u0001") !==
    (next.normalizedAliases ?? []).join("\u0001") ||
    (existing.archivedAt ?? null) !== (next.archivedAt ?? null)
  );
}

function hasRelationSyncChange(
  existing: NodeContextRelation,
  next: NodeContextRelation,
) {
  return (
    existing.nodeId !== next.nodeId ||
    existing.contextId !== next.contextId ||
    existing.relationType !== next.relationType ||
    existing.relatedNodeId !== next.relatedNodeId
  );
}

export type LocalSyncRepositories = ReturnType<typeof createLocalSyncRepositories>;
