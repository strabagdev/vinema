import { deleteDB } from "idb";
import type {
  PullResponse,
  PushRequest,
  PushResponse,
} from "@vinema/sync-contracts";
import type { Context } from "@/domain/context/context";
import type { Device } from "@/domain/device/device";
import { DevicePlatform } from "@/domain/device/device";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import {
  createPullCoordinator,
  createPullCoordinatorRunRegistry,
  type PullCoordinator,
} from "@/features/sync/pull-coordinator";
import {
  createPushCoordinator,
  createPushCoordinatorRunRegistry,
  type PushCoordinator,
} from "@/features/sync/push-coordinator";
import {
  IndexedDbSyncMetadataRepository,
  IndexedDbSyncOutboxRepository,
  type SyncMutationOutboxRecord,
} from "@/features/sync/sync-outbox-repository";
import type { SyncClient } from "@/features/sync/sync-client";
import { SyncClientError } from "@/features/sync/sync-client";
import {
  createLocalSyncRepositories,
  type LocalSyncRepositories,
} from "@/infrastructure/sync/indexed-db-local-sync-repositories";
import {
  CONTEXTS_STORE,
  NODE_CONTEXT_RELATIONS_STORE,
  NODES_STORE,
  SYNC_METADATA_STORE,
  SYNC_MUTATIONS_STORE,
  getVinemaDb,
  resetVinemaDbConnectionForTests,
  resetVinemaDbNameForTests,
  setVinemaDbNameForTests,
} from "@/infrastructure/storage/vinema-db";
import { InMemorySyncStore } from "../../server/src/testing/in-memory-sync-store";
import { processPull, processPush } from "../../server/src/sync/sync-service";

export type E2eSyncHarness = {
  workspaceId: string;
  remoteStore: InMemorySyncStore;
  remoteClient: ControllableSyncClient;
  deviceA: E2eSyncDevice;
  deviceB: E2eSyncDevice;
  cleanup(): Promise<void>;
  compareDevices(): Promise<ConvergenceResult>;
  runOnDevice<T>(device: E2eSyncDevice, operation: () => Promise<T>): Promise<T>;
};

export type E2eSyncDevice = {
  label: "A" | "B";
  dbName: string;
  device: Device;
  repositories: LocalSyncRepositories;
  outboxRepository: IndexedDbSyncOutboxRepository;
  metadataRepository: IndexedDbSyncMetadataRepository;
  pushCoordinator: PushCoordinator;
  pullCoordinator: PullCoordinator;
};

export type E2eSyncHarnessOptions = {
  workspaceId?: string;
  dbPrefix?: string;
  now?: () => string;
  mutationIdFactory?: () => string;
};

export type LogicalDeviceSnapshot = {
  nodes: Array<Pick<Node, "id" | "workspaceId" | "content" | "status" | "version" | "archivedAt">>;
  contexts: Array<Pick<Context, "id" | "workspaceId" | "name" | "type" | "aliases" | "normalizedAliases" | "version" | "archivedAt">>;
  relations: Array<Pick<NodeContextRelation, "id" | "workspaceId" | "nodeId" | "contextId" | "relationType" | "version">>;
};

export type ConvergenceResult = {
  converged: boolean;
  differences: string[];
  deviceA: LogicalDeviceSnapshot;
  deviceB: LogicalDeviceSnapshot;
};

export type ControllableSyncClient = SyncClient & {
  remoteStore: InMemorySyncStore;
  failNextPush(error: SyncClientError): void;
  failNextPull(error: SyncClientError): void;
  blockNextPushUntilAbort(): void;
  blockNextPullUntilAbort(): void;
};

export async function createE2eSyncHarness(
  options: E2eSyncHarnessOptions = {},
): Promise<E2eSyncHarness> {
  const workspaceId = options.workspaceId ?? crypto.randomUUID();
  const dbPrefix = options.dbPrefix ?? `vinema-e2e-${crypto.randomUUID()}`;
  const now = options.now ?? createIncrementingClock();
  const remoteStore = new InMemorySyncStore([workspaceId]);
  const remoteClient = createControllableSyncClient(remoteStore);
  const runRegistry = createPushCoordinatorRunRegistry();
  const pullRunRegistry = createPullCoordinatorRunRegistry();
  const deviceA = createDevice({
    label: "A",
    dbName: `${dbPrefix}-device-a`,
    workspaceId,
    syncClient: remoteClient,
    now,
    mutationIdFactory: options.mutationIdFactory,
    runRegistry,
    pullRunRegistry,
  });
  const deviceB = createDevice({
    label: "B",
    dbName: `${dbPrefix}-device-b`,
    workspaceId,
    syncClient: remoteClient,
    now,
    mutationIdFactory: options.mutationIdFactory,
    runRegistry,
    pullRunRegistry,
  });

  await cleanupDb(deviceA.dbName);
  await cleanupDb(deviceB.dbName);

  async function runOnDevice<T>(
    device: E2eSyncDevice,
    operation: () => Promise<T>,
  ): Promise<T> {
    await setVinemaDbNameForTests(device.dbName);
    return operation();
  }

  return {
    workspaceId,
    remoteStore,
    remoteClient,
    deviceA,
    deviceB,
    cleanup: async () => {
      await cleanupDb(deviceA.dbName);
      await cleanupDb(deviceB.dbName);
      await resetVinemaDbNameForTests();
    },
    compareDevices: async () => {
      const [snapshotA, snapshotB] = await Promise.all([
        runOnDevice(deviceA, () => snapshotDevice(workspaceId)),
        runOnDevice(deviceB, () => snapshotDevice(workspaceId)),
      ]);

      return compareSnapshots(snapshotA, snapshotB);
    },
    runOnDevice,
  };
}

export async function snapshotDevice(
  workspaceId: string,
): Promise<LogicalDeviceSnapshot> {
  const db = await getVinemaDb();
  const [nodes, contexts, relations] = await Promise.all([
    db.getAllFromIndex(NODES_STORE, "by-workspace", workspaceId),
    db.getAllFromIndex(CONTEXTS_STORE, "by-workspace", workspaceId),
    db.getAllFromIndex(NODE_CONTEXT_RELATIONS_STORE, "by-workspace", workspaceId),
  ]);

  return {
    nodes: nodes
      .map((node) => ({
        id: node.id,
        workspaceId: node.workspaceId,
        content: node.content,
        status: node.status,
        version: node.version,
        archivedAt: node.archivedAt ?? null,
      }))
      .sort(byId),
    contexts: contexts
      .map((context) => ({
        id: context.id,
        workspaceId: context.workspaceId,
        name: context.name,
        type: context.type,
        aliases: context.aliases ?? [],
        normalizedAliases: context.normalizedAliases ?? [],
        version: context.version,
        archivedAt: context.archivedAt,
      }))
      .sort(byId),
    relations: relations
      .map((relation) => ({
        id: relation.id,
        workspaceId: relation.workspaceId,
        nodeId: relation.nodeId,
        contextId: relation.contextId,
        relationType: relation.relationType ?? "CONTEXT",
        version: relation.version,
      }))
      .sort(byId),
  };
}

export async function getOutboxRecords(): Promise<SyncMutationOutboxRecord[]> {
  const db = await getVinemaDb();
  return db.getAll(SYNC_MUTATIONS_STORE);
}

export async function getPullCursor(
  workspaceId: string,
  deviceId: string,
): Promise<string> {
  const db = await getVinemaDb();
  const metadata = await db.get(SYNC_METADATA_STORE, [workspaceId, deviceId]);
  return metadata?.pullCursor ?? "0";
}

export async function setPullCursor(
  workspaceId: string,
  deviceId: string,
  cursor: string,
): Promise<void> {
  const db = await getVinemaDb();
  const now = new Date().toISOString();
  const existing = await db.get(SYNC_METADATA_STORE, [workspaceId, deviceId]);
  await db.put(SYNC_METADATA_STORE, {
    workspaceId,
    deviceId,
    pullCursor: cursor,
    lastPullAttemptAt: existing?.lastPullAttemptAt ?? null,
    lastSuccessfulPushAt: existing?.lastSuccessfulPushAt ?? null,
    lastSuccessfulPullAt: existing?.lastSuccessfulPullAt ?? null,
    lastSyncAttemptAt: existing?.lastSyncAttemptAt ?? null,
    lastSyncErrorCode: existing?.lastSyncErrorCode ?? null,
    lastSyncErrorMessage: existing?.lastSyncErrorMessage ?? null,
    lastMemoryVerificationAt: existing?.lastMemoryVerificationAt ?? null,
    lastMemoryVerificationStatus: existing?.lastMemoryVerificationStatus ?? null,
    lastMemoryVerificationError: existing?.lastMemoryVerificationError ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
}

export function makeNode(input: {
  id?: string;
  workspaceId: string;
  deviceId: string;
  content: string;
  version?: number;
  archivedAt?: string | null;
  at?: string;
}): Node {
  const at = input.at ?? new Date().toISOString();

  return {
    id: input.id ?? crypto.randomUUID(),
    workspaceId: input.workspaceId,
    type: "NOTE",
    content: input.content,
    status: input.archivedAt ? "ARCHIVED" : "ACTIVE",
    organizationStatus: "ORGANIZED",
    metadata: {},
    version: input.version ?? 1,
    createdAt: at,
    contentUpdatedAt: at,
    archivedAt: input.archivedAt ?? null,
    restoredAt: null,
    updatedAt: at,
    deletedAt: null,
    createdByDeviceId: input.deviceId,
    lastModifiedByDeviceId: input.deviceId,
  };
}

export function makeContext(input: {
  id?: string;
  workspaceId: string;
  name: string;
  version?: number;
  archivedAt?: string | null;
  aliases?: string[];
  normalizedAliases?: string[];
  at?: string;
}): Context {
  const at = input.at ?? new Date().toISOString();

  return {
    id: input.id ?? crypto.randomUUID(),
    workspaceId: input.workspaceId,
    type: "AREA",
    name: input.name,
    description: null,
    aliases: input.aliases ?? [],
    normalizedAliases: input.normalizedAliases ?? [],
    version: input.version ?? 1,
    createdAt: at,
    updatedAt: at,
    archivedAt: input.archivedAt ?? null,
  };
}

export function makeRelation(input: {
  id?: string;
  workspaceId: string;
  nodeId: string;
  contextId: string;
  version?: number;
  at?: string;
}): NodeContextRelation {
  return {
    id: input.id ?? crypto.randomUUID(),
    workspaceId: input.workspaceId,
    nodeId: input.nodeId,
    contextId: input.contextId,
    relationType: "CONTEXT",
    version: input.version ?? 1,
    createdAt: input.at ?? new Date().toISOString(),
  };
}

export function createIncrementingClock(
  start = "2026-07-30T12:00:00.000Z",
  stepMs = 1_000,
) {
  let current = Date.parse(start);

  return () => {
    const value = new Date(current).toISOString();
    current += stepMs;
    return value;
  };
}

function createDevice(input: {
  label: "A" | "B";
  dbName: string;
  workspaceId: string;
  syncClient: SyncClient;
  now: () => string;
  mutationIdFactory?: () => string;
  runRegistry: ReturnType<typeof createPushCoordinatorRunRegistry>;
  pullRunRegistry: ReturnType<typeof createPullCoordinatorRunRegistry>;
}): E2eSyncDevice {
  const device: Device = {
    id: crypto.randomUUID(),
    name: `E2E Device ${input.label}`,
    platform: DevicePlatform.WEB,
    createdAt: input.now(),
    lastSeenAt: input.now(),
  };
  const repositories = createLocalSyncRepositories({
    syncContext: {
      workspaceId: input.workspaceId,
      deviceId: device.id,
    },
    clock: input.now,
    mutationIdFactory: input.mutationIdFactory,
  });
  const outboxRepository = new IndexedDbSyncOutboxRepository(input.now);
  const metadataRepository = new IndexedDbSyncMetadataRepository(input.now);

  return {
    label: input.label,
    dbName: input.dbName,
    device,
    repositories,
    outboxRepository,
    metadataRepository,
    pushCoordinator: createPushCoordinator({
      workspaceId: input.workspaceId,
      deviceId: device.id,
      syncClient: input.syncClient,
      outboxRepository,
      metadataRepository,
      config: { batchSize: 25, retryBaseDelayMs: 1, retryMaxDelayMs: 1 },
      sleep: async (_ms, signal) => {
        if (signal.aborted) {
          throw new SyncClientError({
            code: "ABORTED",
            message: "Push cancelado.",
          });
        }
      },
      clock: input.now,
      runRegistry: input.runRegistry,
    }),
    pullCoordinator: createPullCoordinator({
      workspaceId: input.workspaceId,
      deviceId: device.id,
      syncClient: input.syncClient,
      config: { pullBatchSize: 25, maxPullBatchesPerRun: 20 },
      clock: input.now,
      runRegistry: input.pullRunRegistry,
    }),
  };
}

function createControllableSyncClient(
  remoteStore: InMemorySyncStore,
): ControllableSyncClient {
  const pushFailures: SyncClientError[] = [];
  const pullFailures: SyncClientError[] = [];
  let blockPush = false;
  let blockPull = false;

  return {
    remoteStore,
    async health() {
      await remoteStore.health();
      return { status: "ok", database: "connected" };
    },
    async getCapture(input) {
      const stored = await remoteStore.getEntity(
        input.workspaceId,
        "capture",
        input.entityId,
      );
      if (!stored || stored.entityType !== "capture") {
        throw new SyncClientError({
          code: "UNKNOWN_ERROR",
          status: 404,
          message: "La captura no existe.",
        });
      }

      return {
        entityType: "capture",
        entityId: stored.entity.id,
        version: stored.entity.version,
        content: stored.entity.content,
        archivedAt: stored.entity.archivedAt,
        updatedAt: stored.entity.updatedAt,
      };
    },
    async getEntity(input) {
      const stored = await remoteStore.getEntity(
        input.workspaceId,
        input.entityType,
        input.entityId,
      );
      if (!stored) {
        throw new SyncClientError({
          code: "UNKNOWN_ERROR",
          status: 404,
          message: "La entidad no existe.",
        });
      }

      return stored;
    },
    async push(input: PushRequest & { signal?: AbortSignal }): Promise<PushResponse> {
      await maybeBlockUntilAbort(input.signal, blockPush);
      blockPush = false;
      const failure = pushFailures.shift();
      if (failure) {
        throw failure;
      }

      return processPush(remoteStore, input);
    },
    async pull(input): Promise<PullResponse> {
      await maybeBlockUntilAbort(input.signal, blockPull);
      blockPull = false;
      const failure = pullFailures.shift();
      if (failure) {
        throw failure;
      }

      return processPull(remoteStore, {
        workspaceId: input.workspaceId,
        cursor: input.cursor ?? "0",
        limit: input.limit ?? 100,
      });
    },
    failNextPush(error) {
      pushFailures.push(error);
    },
    failNextPull(error) {
      pullFailures.push(error);
    },
    blockNextPushUntilAbort() {
      blockPush = true;
    },
    blockNextPullUntilAbort() {
      blockPull = true;
    },
  };
}

async function maybeBlockUntilAbort(signal: AbortSignal | undefined, block: boolean) {
  if (!block) {
    return;
  }

  if (signal?.aborted) {
    throw new SyncClientError({ code: "ABORTED", message: "Sync cancelado." });
  }

  await new Promise<never>((_resolve, reject) => {
    signal?.addEventListener(
      "abort",
      () => {
        reject(new SyncClientError({ code: "ABORTED", message: "Sync cancelado." }));
      },
      { once: true },
    );
  });
}

async function cleanupDb(dbName: string) {
  await setVinemaDbNameForTests(dbName);
  await resetVinemaDbConnectionForTests();
  await deleteDB(dbName);
}

function compareSnapshots(
  deviceA: LogicalDeviceSnapshot,
  deviceB: LogicalDeviceSnapshot,
): ConvergenceResult {
  const differences: string[] = [];
  compareCollection("nodes", deviceA.nodes, deviceB.nodes, differences);
  compareCollection("contexts", deviceA.contexts, deviceB.contexts, differences);
  compareCollection("relations", deviceA.relations, deviceB.relations, differences);

  return {
    converged: differences.length === 0,
    differences,
    deviceA,
    deviceB,
  };
}

function compareCollection<T extends { id: string }>(
  label: string,
  left: T[],
  right: T[],
  differences: string[],
) {
  const leftById = new Map(left.map((item) => [item.id, item]));
  const rightById = new Map(right.map((item) => [item.id, item]));
  const ids = new Set([...leftById.keys(), ...rightById.keys()]);

  for (const id of [...ids].sort()) {
    const leftItem = leftById.get(id);
    const rightItem = rightById.get(id);

    if (!leftItem || !rightItem) {
      differences.push(`${label}:${id} exists only on ${leftItem ? "A" : "B"}`);
      continue;
    }

    const leftJson = JSON.stringify(leftItem);
    const rightJson = JSON.stringify(rightItem);
    if (leftJson !== rightJson) {
      differences.push(`${label}:${id} differs: A=${leftJson} B=${rightJson}`);
    }
  }
}

function byId<T extends { id: string }>(left: T, right: T) {
  return left.id.localeCompare(right.id);
}
