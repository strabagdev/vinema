import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteDB } from "idb";
import type { Device } from "@/domain/device/device";
import { DevicePlatform } from "@/domain/device/device";
import type { Context } from "@/domain/context/context";
import type { Node } from "@/domain/node/node";
import type { Workspace } from "@/domain/workspace/workspace";
import { commitCaptureText } from "@/features/capture/capture-flow";
import { createContext } from "@/features/context/create-context";
import {
  attachNodeToContext,
  detachNodeFromContext,
} from "@/features/context/node-context-relations";
import { updateContext } from "@/features/context/update-context";
import { convertIdeaToNote } from "@/features/node/convert-idea-to-note";
import { archiveNode } from "@/features/node/archive-node";
import { createNode } from "@/features/node/create-node";
import { updateNode } from "@/features/node/update-node";
import { IndexedDbSyncOutboxRepository } from "@/features/sync/sync-outbox-repository";
import { IndexedDbNodeRepository } from "@/infrastructure/node/indexed-db-node-repository";
import {
  IndexedDbLocalSyncNodeRepository,
  createLocalSyncRepositories,
} from "@/infrastructure/sync/indexed-db-local-sync-repositories";
import {
  NODES_STORE,
  CONTEXTS_STORE,
  SYNC_MUTATIONS_STORE,
  VINEMA_DB_NAME,
  getVinemaDb,
  resetVinemaDbConnectionForTests,
} from "@/infrastructure/storage/vinema-db";
import type { StorageAdapter } from "@/infrastructure/storage/storage-adapter";

class MemoryStorageAdapter implements StorageAdapter {
  readonly data = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | null> {
    return (this.data.get(key) as T | undefined) ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.data.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.data.delete(key);
  }
}

const workspace: Workspace = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Vinema local",
  createdAt: "2026-07-29T00:00:00.000Z",
  updatedAt: "2026-07-29T00:00:00.000Z",
};

const device: Device = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Vinema web",
  platform: DevicePlatform.WEB,
  createdAt: "2026-07-29T00:00:00.000Z",
  lastSeenAt: "2026-07-29T00:00:00.000Z",
};

describe("local sync repositories", () => {
  beforeEach(async () => {
    await resetVinemaDbConnectionForTests();
    await deleteDB(VINEMA_DB_NAME);
  });

  it("resolves selected emerging aliases to existing concepts without creating duplicates", async () => {
    const mutationIds = [
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
      "66666666-6666-4666-8666-666666666666",
    ];
    const repositories = createLocalSyncRepositories({
      syncContext: {
        workspaceId: workspace.id,
        deviceId: device.id,
      },
      mutationIdFactory: () => mutationIds.shift() ?? crypto.randomUUID(),
    });
    await repositories.contextRepository.save(
      contextFixture({
        id: "77777777-7777-4777-8777-777777777777",
        name: "Operational Core",
        aliases: ["OC", "Ops Core"],
      }),
    );

    const result = await commitCaptureText({
      content: "OC debe consolidar contratos",
      workspace,
      device,
      repository: repositories.nodeRepository,
      contextRepository: repositories.contextRepository,
      relationRepository: repositories.nodeContextRelationRepository,
      storage: new MemoryStorageAdapter(),
      selectedEmergingConcepts: [
        {
          kind: "emerging",
          candidateId: "emerging:oc",
          suggestedLabel: "OC",
          score: 0.9,
          evidenceCaptureIds: [],
          representativeTerms: ["oc"],
        },
      ],
    });
    const db = await getVinemaDb();
    const contexts = await db.getAllFromIndex(CONTEXTS_STORE, "by-workspace", workspace.id);
    const relations =
      await repositories.nodeContextRelationRepository.listByNodeId(result.node.id);

    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      id: "77777777-7777-4777-8777-777777777777",
      name: "Operational Core",
      aliases: ["OC", "Ops Core"],
      normalizedAliases: ["oc", "ops core"],
    });
    expect(relations).toMatchObject([
      {
        nodeId: result.node.id,
        contextId: "77777777-7777-4777-8777-777777777777",
      },
    ]);
    await expect(
      new IndexedDbSyncOutboxRepository().listPending(workspace.id, 10),
    ).resolves.toHaveLength(3);
  });

  afterEach(async () => {
    await resetVinemaDbConnectionForTests();
    await deleteDB(VINEMA_DB_NAME);
  });

  it("enqueues node create and update with previous baseVersion", async () => {
    const mutationIds = mutationIdFactory([
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
    ]);
    const repositories = createLocalSyncRepositories({
      syncContext: { workspaceId: workspace.id, deviceId: device.id },
      mutationIdFactory: mutationIds,
    });
    const outbox = new IndexedDbSyncOutboxRepository();

    const node = await createNode(repositories.nodeRepository, {
      type: "NOTE",
      content: "Primera captura local",
      organizationStatus: "ORGANIZED",
      workspace,
      device,
    });
    await updateNode(repositories.nodeRepository, {
      id: node.id,
      content: "Captura editada",
      device,
    });
    await expect(outbox.getById("33333333-3333-4333-8333-333333333333")).resolves.toMatchObject({
      mutation: { entityType: "capture", entityId: node.id, baseVersion: null },
    });
    await expect(outbox.getById("44444444-4444-4444-8444-444444444444")).resolves.toMatchObject({
      mutation: { entityType: "capture", entityId: node.id, baseVersion: 1 },
    });
    await expect(outbox.listPending(workspace.id, 10)).resolves.toHaveLength(2);
  });

  it("archives captures locally and enqueues an archive mutation without deleting the record", async () => {
    const archivedAt = "2026-07-29T10:00:00.000Z";
    const repositories = createLocalSyncRepositories({
      syncContext: { workspaceId: workspace.id, deviceId: device.id },
      mutationIdFactory: mutationIdFactory([
        "33333333-3333-4333-8333-333333333333",
        "44444444-4444-4444-8444-444444444444",
      ]),
    });
    const outbox = new IndexedDbSyncOutboxRepository();
    const node = await createNode(repositories.nodeRepository, {
      type: "NOTE",
      content: "Captura a olvidar",
      organizationStatus: "ORGANIZED",
      workspace,
      device,
    });

    const archived = await archiveNode(repositories.nodeRepository, {
      id: node.id,
      archivedAt,
    });

    expect(archived).toMatchObject({
      id: node.id,
      status: "ARCHIVED",
      archivedAt,
      version: 2,
    });
    await expect(repositories.nodeRepository.findById(node.id)).resolves.toBeNull();
    await expect(
      new IndexedDbNodeRepository().listByWorkspace(workspace.id),
    ).resolves.toEqual([]);
    await expect(
      new IndexedDbNodeRepository().listByWorkspace(workspace.id, {
        includeArchived: true,
      }),
    ).resolves.toMatchObject([{ id: node.id, archivedAt }]);
    await expect(outbox.getById("44444444-4444-4444-8444-444444444444")).resolves.toMatchObject({
      localVersion: 2,
      mutation: {
        entityType: "capture",
        operation: "archive",
        entityId: node.id,
        baseVersion: 1,
        payload: { archivedAt, updatedAt: archivedAt },
      },
    });
  });

  it("updates a conflicted capture locally without creating repeated outbox mutations", async () => {
    const mutationIds = mutationIdFactory([
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
    ]);
    const repositories = createLocalSyncRepositories({
      syncContext: { workspaceId: workspace.id, deviceId: device.id },
      mutationIdFactory: mutationIds,
    });
    const outbox = new IndexedDbSyncOutboxRepository();

    const node = await createNode(repositories.nodeRepository, {
      type: "NOTE",
      content: "Primera captura local",
      organizationStatus: "ORGANIZED",
      workspace,
      device,
    });
    await updateNode(repositories.nodeRepository, {
      id: node.id,
      content: "Captura en conflicto",
      device,
    });
    await outbox.markProcessing(["44444444-4444-4444-8444-444444444444"]);
    await outbox.markConflict("44444444-4444-4444-8444-444444444444", {
      reason: "VERSION_CONFLICT",
      serverEntity: {
        id: node.id,
        workspaceId: workspace.id,
        content: "Captura remota",
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        archivedAt: null,
        version: 11,
      },
    });

    await updateNode(repositories.nodeRepository, {
      id: node.id,
      content: "Nueva edicion local mientras sigue el conflicto",
      device,
    });

    await expect(outbox.getById("55555555-5555-4555-8555-555555555555"))
      .resolves.toBeNull();
    await expect(outbox.listByWorkspace(workspace.id, 10)).resolves.toHaveLength(2);
    await expect(outbox.getById("44444444-4444-4444-8444-444444444444"))
      .resolves.toMatchObject({
        status: "CONFLICT",
        localVersion: 3,
        mutation: {
          payload: {
            content: "Nueva edicion local mientras sigue el conflicto",
          },
        },
      });
  });

  it("commits a capture into nodes and sync_mutations for the authenticated workspace", async () => {
    const authenticatedWorkspace: Workspace = {
      ...workspace,
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    };
    const authenticatedDevice: Device = {
      ...device,
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    };
    const repositories = createLocalSyncRepositories({
      syncContext: {
        workspaceId: authenticatedWorkspace.id,
        deviceId: authenticatedDevice.id,
      },
      mutationIdFactory: () => "33333333-3333-4333-8333-333333333333",
    });

    const result = await commitCaptureText({
      content: "Captura creada desde la superficie principal",
      workspace: authenticatedWorkspace,
      device: authenticatedDevice,
      repository: repositories.nodeRepository,
      contextRepository: repositories.contextRepository,
      relationRepository: repositories.nodeContextRelationRepository,
      storage: new MemoryStorageAdapter(),
    });
    const db = await getVinemaDb();
    const storedNode = await db.get(NODES_STORE, result.node.id);
    const storedMutation = await db.get(
      SYNC_MUTATIONS_STORE,
      "33333333-3333-4333-8333-333333333333",
    );

    expect(storedNode).toMatchObject({
      id: result.node.id,
      workspaceId: authenticatedWorkspace.id,
      createdByDeviceId: authenticatedDevice.id,
      lastModifiedByDeviceId: authenticatedDevice.id,
    });
    expect(storedMutation).toMatchObject({
      workspaceId: authenticatedWorkspace.id,
      deviceId: authenticatedDevice.id,
      status: "PENDING",
      mutation: {
        entityType: "capture",
        entityId: result.node.id,
        baseVersion: null,
      },
    });
    await expect(
      new IndexedDbSyncOutboxRepository().listPending(
        authenticatedWorkspace.id,
        10,
      ),
    ).resolves.toHaveLength(1);
    await expect(
      new IndexedDbSyncOutboxRepository().listPending(workspace.id, 10),
    ).resolves.toHaveLength(0);
  });

  it("does not enqueue node no-ops and does enqueue IDEA to NOTE conversion", async () => {
    const repositories = createLocalSyncRepositories({
      syncContext: { workspaceId: workspace.id, deviceId: device.id },
      mutationIdFactory: mutationIdFactory([
        "33333333-3333-4333-8333-333333333333",
        "44444444-4444-4444-8444-444444444444",
      ]),
    });
    const idea = await createNode(repositories.nodeRepository, {
      type: "IDEA",
      content: "Idea que luego sera nota",
      organizationStatus: "INBOX",
      workspace,
      device,
    });

    const noOp = await updateNode(repositories.nodeRepository, {
      id: idea.id,
      content: idea.content,
      device,
    });
    const note = await convertIdeaToNote(
      repositories.nodeRepository,
      idea.id,
      device,
    );

    expect(noOp.version).toBe(idea.version);
    expect(note.type).toBe("NOTE");
    await expect(
      new IndexedDbSyncOutboxRepository().listPending(workspace.id, 10),
    ).resolves.toMatchObject([
      { mutation: { mutationId: "33333333-3333-4333-8333-333333333333" } },
      {
        mutation: {
          mutationId: "44444444-4444-4444-8444-444444444444",
          baseVersion: 1,
        },
      },
    ]);
  });

  it("enqueues context and relation writes without exposing mutations to UI", async () => {
    const mutationIds = mutationIdFactory([
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
      "66666666-6666-4666-8666-666666666666",
      "77777777-7777-4777-8777-777777777777",
      "88888888-8888-4888-8888-888888888888",
      "99999999-9999-4999-8999-999999999999",
    ]);
    const repositories = createLocalSyncRepositories({
      syncContext: { workspaceId: workspace.id, deviceId: device.id },
      mutationIdFactory: mutationIds,
      clock: () => "2026-07-29T10:00:00.000Z",
    });
    const node = await createNode(repositories.nodeRepository, {
      type: "NOTE",
      content: "Captura con contexto",
      organizationStatus: "ORGANIZED",
      workspace,
      device,
    });
    const context = await createContext(repositories.contextRepository, {
      workspaceId: workspace.id,
      type: "AREA",
      name: "Trabajo",
    });
    await updateContext(repositories.contextRepository, {
      id: context.id,
      name: "Trabajo profundo",
    });
    const relation = await attachNodeToContext(repositories, {
      nodeId: node.id,
      contextId: context.id,
    });
    await detachNodeFromContext(repositories.nodeContextRelationRepository, {
      nodeId: node.id,
      contextId: context.id,
    });

    const outbox = new IndexedDbSyncOutboxRepository();
    await expect(outbox.getById("44444444-4444-4444-8444-444444444444")).resolves.toMatchObject({
      mutation: { entityType: "concept", entityId: context.id, baseVersion: null },
    });
    await expect(outbox.getById("55555555-5555-4555-8555-555555555555")).resolves.toMatchObject({
      mutation: { entityType: "concept", entityId: context.id, baseVersion: 1 },
    });
    await expect(outbox.getById("66666666-6666-4666-8666-666666666666")).resolves.toMatchObject({
      mutation: {
        entityType: "captureConcept",
        entityId: relation.id,
        baseVersion: null,
      },
    });
    await expect(outbox.getById("77777777-7777-4777-8777-777777777777")).resolves.toMatchObject({
      mutation: {
        entityType: "captureConcept",
        entityId: relation.id,
        baseVersion: 1,
        payload: { archivedAt: "2026-07-29T10:00:00.000Z" },
      },
    });
  });

  it("does not enqueue context and relation no-ops", async () => {
    const repositories = createLocalSyncRepositories({
      syncContext: { workspaceId: workspace.id, deviceId: device.id },
      mutationIdFactory: mutationIdFactory([
        "33333333-3333-4333-8333-333333333333",
        "44444444-4444-4444-8444-444444444444",
        "55555555-5555-4555-8555-555555555555",
      ]),
    });
    const node = await createNode(repositories.nodeRepository, {
      type: "NOTE",
      content: "Captura con contexto",
      organizationStatus: "ORGANIZED",
      workspace,
      device,
    });
    const context = await createContext(repositories.contextRepository, {
      workspaceId: workspace.id,
      type: "AREA",
      name: "Trabajo",
    });
    await updateContext(repositories.contextRepository, {
      id: context.id,
      name: context.name,
      description: context.description,
    });
    await attachNodeToContext(repositories, {
      nodeId: node.id,
      contextId: context.id,
    });
    await attachNodeToContext(repositories, {
      nodeId: node.id,
      contextId: context.id,
    });
    await detachNodeFromContext(repositories.nodeContextRelationRepository, {
      nodeId: node.id,
      contextId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });

    await expect(
      new IndexedDbSyncOutboxRepository().listPending(workspace.id, 10),
    ).resolves.toHaveLength(3);
  });

  it("persists remote-origin writes without enqueuing local mutations", async () => {
    const repositories = createLocalSyncRepositories({
      syncContext: { workspaceId: workspace.id, deviceId: device.id },
      origin: "REMOTE",
      mutationIdFactory: () => "33333333-3333-4333-8333-333333333333",
    });
    const node = await createNode(repositories.nodeRepository, {
      type: "NOTE",
      content: "Captura remota aplicada localmente",
      organizationStatus: "ORGANIZED",
      workspace,
      device,
    });

    await expect(repositories.nodeRepository.findById(node.id)).resolves.toEqual(node);
    await expect(new IndexedDbSyncOutboxRepository().listPending(workspace.id, 10)).resolves.toHaveLength(0);
  });

  it("persists system-origin writes without enqueuing local mutations", async () => {
    const repositories = createLocalSyncRepositories({
      syncContext: { workspaceId: workspace.id, deviceId: device.id },
      origin: "SYSTEM",
      mutationIdFactory: () => "33333333-3333-4333-8333-333333333333",
    });
    const node = await createNode(repositories.nodeRepository, {
      type: "NOTE",
      content: "Importacion local controlada",
      organizationStatus: "ORGANIZED",
      workspace,
      device,
    });

    await expect(repositories.nodeRepository.findById(node.id)).resolves.toEqual(node);
    await expect(new IndexedDbSyncOutboxRepository().listPending(workspace.id, 10)).resolves.toHaveLength(0);
  });

  it("rejects invalid sync context and invalid origins", () => {
    expectLocalSyncError(
      () =>
        createLocalSyncRepositories({
          syncContext: { workspaceId: "", deviceId: device.id },
        }),
      "INVALID_SYNC_CONTEXT",
    );
    expectLocalSyncError(
      () =>
        createLocalSyncRepositories({
          syncContext: { workspaceId: workspace.id, deviceId: device.id },
          origin: "OTHER" as "LOCAL",
        }),
      "INVALID_MUTATION_ORIGIN",
    );
  });

  it("keeps domain and outbox records after closing and reopening IndexedDB", async () => {
    const repositories = createLocalSyncRepositories({
      syncContext: { workspaceId: workspace.id, deviceId: device.id },
      mutationIdFactory: () => "33333333-3333-4333-8333-333333333333",
    });
    const node = await createNode(repositories.nodeRepository, {
      type: "NOTE",
      content: "Persistencia local",
      organizationStatus: "ORGANIZED",
      workspace,
      device,
    });

    await resetVinemaDbConnectionForTests();

    await expect(new IndexedDbNodeRepository().findById(node.id)).resolves.toEqual(node);
    await expect(
      new IndexedDbSyncOutboxRepository().getById(
        "33333333-3333-4333-8333-333333333333",
      ),
    ).resolves.toMatchObject({
      workspaceId: workspace.id,
      deviceId: device.id,
      mutation: { entityId: node.id },
    });
  });

  it("rolls back the domain write if the outbox mutation is invalid", async () => {
    const repository = new IndexedDbLocalSyncNodeRepository({
      syncContext: { workspaceId: workspace.id, deviceId: device.id },
      mutationIdFactory: () => "invalid-mutation-id",
    });
    const node = makeNode({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });

    await expect(repository.create(node)).rejects.toMatchObject({
      code: "OUTBOX_ENQUEUE_FAILED",
    });
    await expect(new IndexedDbNodeRepository().findById(node.id)).resolves.toBeNull();
    await expect(new IndexedDbSyncOutboxRepository().listPending(workspace.id, 10)).resolves.toHaveLength(0);
  });
});

function mutationIdFactory(ids: string[]) {
  let index = 0;
  return () => ids[index++] ?? crypto.randomUUID();
}

function expectLocalSyncError(operation: () => unknown, code: string) {
  try {
    operation();
    throw new Error("Expected operation to throw.");
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
}

function makeNode(overrides: Partial<Node> = {}): Node {
  const now = "2026-07-29T09:00:00.000Z";

  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    workspaceId: workspace.id,
    type: "NOTE",
    content: "Captura local",
    status: "ACTIVE",
    organizationStatus: "ORGANIZED",
    metadata: {},
    version: 1,
    createdAt: now,
    contentUpdatedAt: now,
    archivedAt: null,
    restoredAt: null,
    updatedAt: now,
    deletedAt: null,
    createdByDeviceId: device.id,
    lastModifiedByDeviceId: device.id,
    ...overrides,
  };
}

function contextFixture(overrides: Partial<Context> = {}): Context {
  const now = "2026-07-29T09:00:00.000Z";

  return {
    id: "77777777-7777-4777-8777-777777777777",
    workspaceId: workspace.id,
    type: "AREA",
    name: "Operational Core",
    description: null,
    aliases: [],
    normalizedAliases: [],
    version: 1,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    ...overrides,
  };
}
