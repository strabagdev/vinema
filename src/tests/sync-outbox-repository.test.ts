import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteDB, openDB } from "idb";
import type { Device } from "@/domain/device/device";
import { DevicePlatform } from "@/domain/device/device";
import type { Node } from "@/domain/node/node";
import type { Workspace } from "@/domain/workspace/workspace";
import {
  APP_SETTINGS_STORE,
  CONTEXTS_STORE,
  DEVICES_STORE,
  LEGACY_KEY_VALUE_STORE,
  NODE_CONTEXT_RELATIONS_STORE,
  NODES_STORE,
  SYNC_METADATA_STORE,
  SYNC_MUTATIONS_STORE,
  VINEMA_DB_NAME,
  VINEMA_DB_VERSION,
  WORKSPACES_STORE,
  getVinemaDb,
  resetVinemaDbConnectionForTests,
} from "@/infrastructure/storage/vinema-db";
import {
  IndexedDbSyncMetadataRepository,
  IndexedDbSyncOutboxRepository,
  canTransition,
} from "@/features/sync/sync-outbox-repository";
import type { SyncMutation } from "@vinema/sync-contracts";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const otherWorkspaceId = "22222222-2222-4222-8222-222222222222";
const deviceId = "33333333-3333-4333-8333-333333333333";
const otherDeviceId = "44444444-4444-4444-8444-444444444444";
const now = "2026-07-29T12:00:00.000Z";
const later = "2026-07-29T13:00:00.000Z";

describe("sync outbox repository", () => {
  beforeEach(async () => {
    await resetVinemaDbConnectionForTests();
    await deleteDB(VINEMA_DB_NAME);
  });

  afterEach(async () => {
    await resetVinemaDbConnectionForTests();
    await deleteDB(VINEMA_DB_NAME);
  });

  it("enqueues a valid mutation as pending", async () => {
    const repository = new IndexedDbSyncOutboxRepository(() => now);
    const mutation = makeMutation({ mutationId: "55555555-5555-4555-8555-555555555555" });

    const record = await repository.enqueue({ workspaceId, deviceId, mutation });

    expect(record).toMatchObject({
      mutationId: mutation.mutationId,
      workspaceId,
      deviceId,
      status: "PENDING",
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    await expect(repository.getById(mutation.mutationId)).resolves.toEqual(record);
  });

  it("persists queued mutations after closing and reopening IndexedDB", async () => {
    const mutation = makeMutation({ mutationId: "55555555-5555-4555-8555-555555555555" });
    await new IndexedDbSyncOutboxRepository(() => now).enqueue({
      workspaceId,
      deviceId,
      mutation,
    });

    await resetVinemaDbConnectionForTests();

    await expect(
      new IndexedDbSyncOutboxRepository(() => later).getById(mutation.mutationId),
    ).resolves.toMatchObject({ mutationId: mutation.mutationId });
  });

  it("keeps mutationId unique and idempotent for identical content", async () => {
    const repository = new IndexedDbSyncOutboxRepository(() => now);
    const mutation = makeMutation({ mutationId: "55555555-5555-4555-8555-555555555555" });

    const first = await repository.enqueue({ workspaceId, deviceId, mutation });
    await repository.markProcessing([mutation.mutationId]);
    const existing = await repository.enqueue({ workspaceId, deviceId, mutation });

    expect(existing).toMatchObject({
      mutationId: first.mutationId,
      status: "PROCESSING",
      attemptCount: 1,
    });
    expect(await repository.listPending(workspaceId, 10)).toHaveLength(0);
  });

  it("rejects same mutationId with different content", async () => {
    const repository = new IndexedDbSyncOutboxRepository(() => now);
    const mutation = makeMutation({ mutationId: "55555555-5555-4555-8555-555555555555" });
    await repository.enqueue({ workspaceId, deviceId, mutation });

    await expect(
      repository.enqueue({
        workspaceId,
        deviceId,
        mutation: makeMutation({
          mutationId: mutation.mutationId,
          content: "contenido distinto",
        }),
      }),
    ).rejects.toMatchObject({ code: "DUPLICATE_MUTATION_CONFLICT" });
  });

  it("orders by createdAt and mutationId and filters by workspace", async () => {
    const repository = new IndexedDbSyncOutboxRepository(() => now);
    const newest = makeMutation({ mutationId: "77777777-7777-4777-8777-777777777777" });
    const tieB = makeMutation({ mutationId: "66666666-6666-4666-8666-666666666666" });
    const tieA = makeMutation({ mutationId: "55555555-5555-4555-8555-555555555555" });
    const otherWorkspace = makeMutation({ mutationId: "88888888-8888-4888-8888-888888888888" });

    await repository.enqueue({
      workspaceId,
      deviceId,
      mutation: newest,
      createdAt: "2026-07-29T13:00:00.000Z",
    });
    await repository.enqueue({
      workspaceId,
      deviceId,
      mutation: tieB,
      createdAt: "2026-07-29T12:00:00.000Z",
    });
    await repository.enqueue({
      workspaceId,
      deviceId,
      mutation: tieA,
      createdAt: "2026-07-29T12:00:00.000Z",
    });
    await repository.enqueue({
      workspaceId: otherWorkspaceId,
      deviceId,
      mutation: otherWorkspace,
      createdAt: "2026-07-29T11:00:00.000Z",
    });

    await expect(repository.listPending(workspaceId, 10)).resolves.toMatchObject([
      { mutationId: tieA.mutationId },
      { mutationId: tieB.mutationId },
      { mutationId: newest.mutationId },
    ]);
    await expect(repository.listPending(workspaceId, 2)).resolves.toHaveLength(2);
  });

  it("validates limits and counts pending mutations", async () => {
    const repository = new IndexedDbSyncOutboxRepository(() => now);
    await repository.enqueue({
      workspaceId,
      deviceId,
      mutation: makeMutation({ mutationId: "55555555-5555-4555-8555-555555555555" }),
    });

    await expect(repository.countPending(workspaceId)).resolves.toBe(1);
    await expect(repository.listPending(workspaceId, 0)).rejects.toMatchObject({
      code: "INVALID_LIMIT",
    });
  });

  it("marks processing, pending, failed and conflict with valid transitions", async () => {
    const repository = new IndexedDbSyncOutboxRepository(() => later);
    const pendingMutation = makeMutation({ mutationId: "55555555-5555-4555-8555-555555555555" });
    const failedMutation = makeMutation({ mutationId: "66666666-6666-4666-8666-666666666666" });
    const conflictMutation = makeMutation({ mutationId: "77777777-7777-4777-8777-777777777777" });
    await repository.enqueue({ workspaceId, deviceId, mutation: pendingMutation, createdAt: now });
    await repository.enqueue({ workspaceId, deviceId, mutation: failedMutation, createdAt: now });
    await repository.enqueue({ workspaceId, deviceId, mutation: conflictMutation, createdAt: now });

    await repository.markProcessing([
      pendingMutation.mutationId,
      failedMutation.mutationId,
      conflictMutation.mutationId,
    ]);
    await repository.markPending([pendingMutation.mutationId], {
      nextAttemptAt: "2026-07-29T13:30:00.000Z",
    });
    await repository.markFailed(failedMutation.mutationId, {
      code: "NETWORK_ERROR",
      message: "Fallo temporal",
      nextAttemptAt: "2026-07-29T14:00:00.000Z",
    });
    await repository.markConflict(conflictMutation.mutationId, { serverVersion: 2 });

    await expect(repository.listPending(workspaceId, 10)).resolves.toMatchObject([
      { mutationId: pendingMutation.mutationId, status: "PENDING", attemptCount: 1 },
    ]);
    expect(
      (await repository.getById(pendingMutation.mutationId))?.nextAttemptAt,
    ).toBe("2026-07-29T13:30:00.000Z");
    await expect(repository.listFailed(workspaceId, 10)).resolves.toMatchObject([
      {
        mutationId: failedMutation.mutationId,
        status: "FAILED",
        lastErrorCode: "NETWORK_ERROR",
      },
    ]);
    await expect(repository.listConflicts(workspaceId, 10)).resolves.toMatchObject([
      {
        mutationId: conflictMutation.mutationId,
        status: "CONFLICT",
        conflictData: { serverVersion: 2 },
      },
    ]);
  });

  it("rejects invalid transitions and missing mutations", async () => {
    const repository = new IndexedDbSyncOutboxRepository(() => now);
    const mutation = makeMutation({ mutationId: "55555555-5555-4555-8555-555555555555" });
    await repository.enqueue({ workspaceId, deviceId, mutation });

    await expect(
      repository.markFailed(mutation.mutationId, {
        code: "ERROR",
        message: "No puede fallar sin PROCESSING.",
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATUS_TRANSITION" });
    await expect(
      repository.markProcessing(["99999999-9999-4999-8999-999999999999"]),
    ).rejects.toMatchObject({ code: "MUTATION_NOT_FOUND" });
    expect(canTransition("CONFLICT", "PENDING")).toBe(true);
    expect(canTransition("PENDING", "FAILED")).toBe(false);
  });

  it("removes mutations and returns null for missing records", async () => {
    const repository = new IndexedDbSyncOutboxRepository(() => now);
    const mutation = makeMutation({ mutationId: "55555555-5555-4555-8555-555555555555" });
    await repository.enqueue({ workspaceId, deviceId, mutation });

    await repository.remove([mutation.mutationId]);

    await expect(repository.getById(mutation.mutationId)).resolves.toBeNull();
  });

  it("resets stale processing without touching recent processing records", async () => {
    let currentNow = "2026-07-29T12:00:00.000Z";
    const repository = new IndexedDbSyncOutboxRepository(() => currentNow);
    const stale = makeMutation({ mutationId: "55555555-5555-4555-8555-555555555555" });
    const recent = makeMutation({ mutationId: "66666666-6666-4666-8666-666666666666" });
    await repository.enqueue({ workspaceId, deviceId, mutation: stale });
    await repository.enqueue({ workspaceId, deviceId, mutation: recent });
    await repository.markProcessing([stale.mutationId]);

    currentNow = "2026-07-29T15:00:00.000Z";
    await repository.markProcessing([recent.mutationId]);

    const reset = await repository.resetStaleProcessing("2026-07-29T14:00:00.000Z");

    expect(reset).toHaveLength(1);
    expect(reset[0].mutationId).toBe(stale.mutationId);
    await expect(repository.getById(stale.mutationId)).resolves.toMatchObject({
      status: "PENDING",
      attemptCount: 1,
    });
    await expect(repository.getById(recent.mutationId)).resolves.toMatchObject({
      status: "PROCESSING",
    });
  });

  it("stores metadata by workspace and device", async () => {
    const repository = new IndexedDbSyncMetadataRepository(() => now);

    await expect(repository.get(workspaceId, deviceId)).resolves.toBeNull();
    await expect(repository.upsert({ workspaceId, deviceId })).resolves.toMatchObject({
      workspaceId,
      deviceId,
      pullCursor: "0",
      createdAt: now,
      updatedAt: now,
    });

    await repository.upsert({
      workspaceId: otherWorkspaceId,
      deviceId,
      pullCursor: "3",
    });
    await repository.upsert({
      workspaceId,
      deviceId: otherDeviceId,
      pullCursor: "4",
    });

    await expect(repository.get(workspaceId, deviceId)).resolves.toMatchObject({
      pullCursor: "0",
    });
    await expect(repository.get(otherWorkspaceId, deviceId)).resolves.toMatchObject({
      pullCursor: "3",
    });
    await expect(repository.get(workspaceId, otherDeviceId)).resolves.toMatchObject({
      pullCursor: "4",
    });
  });

  it("updates metadata cursor and success/failure fields", async () => {
    const repository = new IndexedDbSyncMetadataRepository(() => now);

    await repository.updateCursor(workspaceId, deviceId, "10");
    await repository.recordSyncAttempt(workspaceId, deviceId, "2026-07-29T12:10:00.000Z");
    await repository.recordPushSuccess(workspaceId, deviceId, "2026-07-29T12:20:00.000Z");
    await repository.recordPullSuccess(
      workspaceId,
      deviceId,
      "12",
      "2026-07-29T12:30:00.000Z",
    );
    await repository.recordFailure(
      workspaceId,
      deviceId,
      { code: "SERVER_ERROR", message: "API no disponible" },
      "2026-07-29T12:40:00.000Z",
    );
    await expect(repository.get(workspaceId, deviceId)).resolves.toMatchObject({
      pullCursor: "12",
      lastSuccessfulPushAt: "2026-07-29T12:20:00.000Z",
      lastSuccessfulPullAt: "2026-07-29T12:30:00.000Z",
      lastSyncAttemptAt: "2026-07-29T12:40:00.000Z",
      lastSyncErrorCode: "SERVER_ERROR",
      lastSyncErrorMessage: "API no disponible",
    });

    await repository.clearFailure(workspaceId, deviceId);

    await expect(repository.get(workspaceId, deviceId)).resolves.toMatchObject({
      lastSyncErrorCode: null,
      lastSyncErrorMessage: null,
    });
  });

  it("migrates from version 5 and preserves previous stores", async () => {
    const node = makeNode({ id: "legacy-node" });
    const workspace: Workspace = {
      id: workspaceId,
      name: "Personal",
      createdAt: now,
      updatedAt: now,
    };

    await createVersion5Database({
      nodes: [node],
      workspaces: [workspace],
      devices: [
        {
          id: deviceId,
          name: "Vinema web",
          platform: DevicePlatform.WEB,
          createdAt: now,
          lastSeenAt: now,
        },
      ],
      settings: [["setting", { enabled: true }]],
    });
    await resetVinemaDbConnectionForTests();

    const db = await getVinemaDb();

    expect(db.version).toBe(VINEMA_DB_VERSION);
    expect(db.objectStoreNames.contains(SYNC_MUTATIONS_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(SYNC_METADATA_STORE)).toBe(true);
    await expect(db.get(NODES_STORE, node.id)).resolves.toEqual(node);
    await expect(db.get(WORKSPACES_STORE, workspace.id)).resolves.toEqual(workspace);
    await expect(db.get(DEVICES_STORE, deviceId)).resolves.toMatchObject({ id: deviceId });
    await expect(db.get(APP_SETTINGS_STORE, "setting")).resolves.toEqual({ enabled: true });
  });

  it("does not store secrets in outbox or metadata records", async () => {
    const secret = "VINEMA_SYNC_API_KEY=secret-token";
    const outbox = new IndexedDbSyncOutboxRepository(() => now);
    const metadata = new IndexedDbSyncMetadataRepository(() => now);
    const mutation = makeMutation({ mutationId: "55555555-5555-4555-8555-555555555555" });

    const outboxRecord = await outbox.enqueue({ workspaceId, deviceId, mutation });
    const metadataRecord = await metadata.recordFailure(
      workspaceId,
      deviceId,
      { code: "NETWORK_ERROR", message: "Fallo de red" },
      later,
    );

    expect(JSON.stringify(outboxRecord)).not.toContain(secret);
    expect(JSON.stringify(metadataRecord)).not.toContain(secret);
    expect(JSON.stringify(outboxRecord)).not.toContain("accessToken");
    expect(JSON.stringify(metadataRecord)).not.toContain("VINEMA_SYNC_API_KEY");
  });
});

function makeMutation({
  mutationId,
  content = "Contenido local",
}: {
  mutationId: string;
  content?: string;
}): SyncMutation {
  return {
    mutationId,
    entityType: "capture",
    operation: "upsert",
    entityId: crypto.randomUUID(),
    baseVersion: null,
    payload: {
      content,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    },
  };
}

function makeNode(overrides: Partial<Node> = {}): Node {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    workspaceId,
    type: "NOTE",
    content: "Contenido local",
    status: "ACTIVE",
    organizationStatus: "ORGANIZED",
    metadata: {},
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    createdByDeviceId: deviceId,
    lastModifiedByDeviceId: deviceId,
    ...overrides,
  };
}

async function createVersion5Database({
  nodes = [],
  workspaces = [],
  devices = [],
  settings = [],
}: {
  nodes?: Node[];
  workspaces?: Workspace[];
  devices?: Device[];
  settings?: Array<[string, unknown]>;
}) {
  await resetVinemaDbConnectionForTests();
  await deleteDB(VINEMA_DB_NAME);

  const db = await openDB(VINEMA_DB_NAME, 5, {
    upgrade(database) {
      database.createObjectStore(APP_SETTINGS_STORE);
      database.createObjectStore(LEGACY_KEY_VALUE_STORE);
      database.createObjectStore(DEVICES_STORE, { keyPath: "id" });
      database.createObjectStore(WORKSPACES_STORE, { keyPath: "id" });
      const nodesStore = database.createObjectStore(NODES_STORE, { keyPath: "id" });
      nodesStore.createIndex("by-updated-at", "updatedAt");
      nodesStore.createIndex("by-workspace", "workspaceId");
      const contextsStore = database.createObjectStore(CONTEXTS_STORE, {
        keyPath: "id",
      });
      contextsStore.createIndex("by-workspace", "workspaceId");
      contextsStore.createIndex("by-type", "type");
      contextsStore.createIndex("by-archived-at", "archivedAt");
      contextsStore.createIndex("by-workspace-and-type", ["workspaceId", "type"]);
      const relationsStore = database.createObjectStore(
        NODE_CONTEXT_RELATIONS_STORE,
        { keyPath: "id" },
      );
      relationsStore.createIndex("by-workspace", "workspaceId");
      relationsStore.createIndex("by-node", "nodeId");
      relationsStore.createIndex("by-context", "contextId");
      relationsStore.createIndex("by-node-and-context", ["nodeId", "contextId"], {
        unique: true,
      });
      relationsStore.createIndex("by-related-node", "relatedNodeId");
      relationsStore.createIndex("by-relation-type", "relationType");
    },
  });

  for (const node of nodes) {
    await db.put(NODES_STORE, node);
  }

  for (const workspace of workspaces) {
    await db.put(WORKSPACES_STORE, workspace);
  }

  for (const device of devices) {
    await db.put(DEVICES_STORE, device);
  }

  for (const [key, value] of settings) {
    await db.put(APP_SETTINGS_STORE, value, key);
  }

  db.close();
}
