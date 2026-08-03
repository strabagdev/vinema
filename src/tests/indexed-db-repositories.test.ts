import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteDB, openDB } from "idb";
import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Device } from "@/domain/device/device";
import { DevicePlatform } from "@/domain/device/device";
import type { Node } from "@/domain/node/node";
import type { Workspace } from "@/domain/workspace/workspace";
import { getOrCreateDevice } from "@/features/device/get-or-create-device";
import { archiveNode } from "@/features/node/archive-node";
import { convertIdeaToNote } from "@/features/node/convert-idea-to-note";
import { restoreNode } from "@/features/node/restore-node";
import { updateNode } from "@/features/node/update-node";
import {
  buildAssociationIndex,
  suggestAssociations,
} from "@/features/associations/association-engine";
import { getOrCreateDefaultWorkspace } from "@/features/workspace/get-or-create-default-workspace";
import { IndexedDbContextRepository } from "@/infrastructure/context/indexed-db-context-repository";
import { IndexedDbNodeContextRelationRepository } from "@/infrastructure/context/indexed-db-node-context-relation-repository";
import { IndexedDbNodeRepository } from "@/infrastructure/node/indexed-db-node-repository";
import { IndexedDbAdapter } from "@/infrastructure/storage/indexed-db-adapter";
import {
  APP_SETTINGS_STORE,
  AUTH_SESSION_STORE,
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
import { IndexedDbWorkspaceRepository } from "@/infrastructure/workspace/indexed-db-workspace-repository";

const workspaceId = "workspace-indexeddb";

const device: Device = {
  id: "device-indexeddb",
  name: "Vinema web",
  platform: DevicePlatform.WEB,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastSeenAt: "2026-01-01T00:00:00.000Z",
};

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
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    createdByDeviceId: device.id,
    lastModifiedByDeviceId: device.id,
    ...overrides,
  };
}

function makeContext(overrides: Partial<Context> = {}): Context {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    workspaceId,
    type: "AREA",
    name: "Trabajo",
    description: null,
    aliases: [],
    normalizedAliases: [],
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}

function makeRelation(
  overrides: Partial<NodeContextRelation> = {},
): NodeContextRelation {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    workspaceId,
    nodeId: "node-1",
    contextId: "context-1",
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("IndexedDB repositories", () => {
  beforeEach(async () => {
    await resetVinemaDbConnectionForTests();
    await deleteDB(VINEMA_DB_NAME);
  });

  afterEach(async () => {
    await resetVinemaDbConnectionForTests();
    await deleteDB(VINEMA_DB_NAME);
  });

  it("creates a clean version 8 database with the expected keyPath schema", async () => {
    const db = await getVinemaDb();
    const authSessionStore = db
      .transaction(AUTH_SESSION_STORE)
      .objectStore(AUTH_SESSION_STORE);
    const nodesStore = db.transaction(NODES_STORE).objectStore(NODES_STORE);
    const contextsStore = db
      .transaction(CONTEXTS_STORE)
      .objectStore(CONTEXTS_STORE);
    const relationsStore = db
      .transaction(NODE_CONTEXT_RELATIONS_STORE)
      .objectStore(NODE_CONTEXT_RELATIONS_STORE);
    const syncMutationsStore = db
      .transaction(SYNC_MUTATIONS_STORE)
      .objectStore(SYNC_MUTATIONS_STORE);
    const syncMetadataStore = db
      .transaction(SYNC_METADATA_STORE)
      .objectStore(SYNC_METADATA_STORE);
    const syncEntityAcknowledgementsStore = db
      .transaction("sync_entity_acknowledgements")
      .objectStore("sync_entity_acknowledgements");

    expect(db.version).toBe(VINEMA_DB_VERSION);
    expect(authSessionStore.keyPath).toBeNull();
    expect(nodesStore.keyPath).toBe("id");
    expect(contextsStore.keyPath).toBe("id");
    expect(contextsStore.indexNames.contains("by-workspace")).toBe(true);
    expect(contextsStore.indexNames.contains("by-type")).toBe(true);
    expect(contextsStore.indexNames.contains("by-archived-at")).toBe(true);
    expect(contextsStore.indexNames.contains("by-workspace-and-type")).toBe(true);
    expect(relationsStore.keyPath).toBe("id");
    expect(relationsStore.indexNames.contains("by-workspace")).toBe(true);
    expect(relationsStore.indexNames.contains("by-node")).toBe(true);
    expect(relationsStore.indexNames.contains("by-context")).toBe(true);
    expect(relationsStore.indexNames.contains("by-node-and-context")).toBe(true);
    expect(relationsStore.indexNames.contains("by-related-node")).toBe(true);
    expect(relationsStore.indexNames.contains("by-relation-type")).toBe(true);
    expect(syncMutationsStore.keyPath).toBe("mutationId");
    expect(syncMutationsStore.indexNames.contains("by-workspace")).toBe(true);
    expect(syncMutationsStore.indexNames.contains("by-status")).toBe(true);
    expect(syncMutationsStore.indexNames.contains("by-created-at")).toBe(true);
    expect(syncMutationsStore.indexNames.contains("by-workspace-and-status")).toBe(
      true,
    );
    expect(syncMutationsStore.indexNames.contains("by-next-at")).toBe(true);
    expect(syncMetadataStore.keyPath).toEqual(["workspaceId", "deviceId"]);
    expect(syncMetadataStore.indexNames.contains("by-workspace")).toBe(true);
    expect(syncMetadataStore.indexNames.contains("by-device")).toBe(true);
    expect(syncEntityAcknowledgementsStore.keyPath).toEqual([
      "workspaceId",
      "entityType",
      "entityId",
    ]);
    expect(
      syncEntityAcknowledgementsStore.indexNames.contains("by-workspace"),
    ).toBe(true);
    expect(
      db.transaction(WORKSPACES_STORE).objectStore(WORKSPACES_STORE).keyPath,
    ).toBe("id");
    expect(db.transaction(DEVICES_STORE).objectStore(DEVICES_STORE).keyPath).toBe(
      "id",
    );
    expect(
      db.transaction(APP_SETTINGS_STORE).objectStore(APP_SETTINGS_STORE).keyPath,
    ).toBeNull();
    expect(
      db
        .transaction(LEGACY_KEY_VALUE_STORE)
        .objectStore(LEGACY_KEY_VALUE_STORE).keyPath,
    ).toBeNull();
  });

  it("stores a Node with an inline id and retrieves it by that id", async () => {
    const repository = new IndexedDbNodeRepository();
    const node = makeNode({ id: "node-1" });

    await repository.create(node);

    await expect(repository.findById("node-1")).resolves.toEqual(node);
  });

  it("normalizes historical nodes with title without exposing title", async () => {
    const repository = new IndexedDbNodeRepository();
    const db = await getVinemaDb();
    const historicalNode = {
      ...makeNode({
        id: "historical-with-title",
        content: "Contenido preservado",
      }),
      title: "Titulo historico ignorado",
    };

    await db.put(NODES_STORE, historicalNode as Node);

    const node = await repository.findById("historical-with-title");

    expect(node).toMatchObject({
      id: "historical-with-title",
      content: "Contenido preservado",
    });
    expect(node && "title" in node).toBe(false);
  });

  it("recovers historical title as content only when content is empty and cleans it on update", async () => {
    const repository = new IndexedDbNodeRepository();
    const db = await getVinemaDb();
    const historicalNode = {
      ...makeNode({
        id: "historical-empty-content",
        content: "",
      }),
      title: "Contenido que solo existia en titulo historico",
    };

    await db.put(NODES_STORE, historicalNode as Node);

    await expect(repository.findById("historical-empty-content")).resolves.toMatchObject({
      content: "Contenido que solo existia en titulo historico",
    });

    await updateNode(repository, {
      id: "historical-empty-content",
      content: "Contenido limpiado",
      device,
    });

    const storedNode = (await db.get(NODES_STORE, "historical-empty-content")) as
      | (Node & { title?: unknown })
      | undefined;

    expect(storedNode?.content).toBe("Contenido limpiado");
    expect(storedNode && "title" in storedNode).toBe(false);
  });

  it("updates a Node by the same id without creating duplicates", async () => {
    const repository = new IndexedDbNodeRepository();
    const node = makeNode({ id: "node-1" });
    await repository.create(node);

    const updatedNode = await updateNode(repository, {
      id: node.id,
      content: "Contenido editado",
      device,
    });

    expect(updatedNode.id).toBe(node.id);
    await expect(repository.findById(node.id)).resolves.toMatchObject({
      id: node.id,
      version: 2,
    });
    await expect(repository.listActive()).resolves.toHaveLength(1);
  });

  it("stores contexts and relations separately from nodes", async () => {
    const nodeRepository = new IndexedDbNodeRepository();
    const contextRepository = new IndexedDbContextRepository();
    const relationRepository = new IndexedDbNodeContextRelationRepository();
    const node = makeNode({ id: "node-1" });
    const context = makeContext({ id: "context-1", type: "PROJECT" });
    const relation = makeRelation({
      id: "relation-1",
      nodeId: node.id,
      contextId: context.id,
    });

    await nodeRepository.create(node);
    await contextRepository.save(context);
    await relationRepository.save(relation);

    await expect(contextRepository.getById(context.id)).resolves.toEqual(context);
    await expect(
      relationRepository.getByNodeAndContext(node.id, context.id),
    ).resolves.toEqual(relation);
    await expect(nodeRepository.findById(node.id)).resolves.toEqual(node);
  });

  it("persists contexts and relations after reopening the database", async () => {
    const contextRepository = new IndexedDbContextRepository();
    const relationRepository = new IndexedDbNodeContextRelationRepository();
    const context = makeContext({ id: "context-1" });
    const relation = makeRelation({ id: "relation-1" });

    await contextRepository.save(context);
    await relationRepository.save(relation);
    await resetVinemaDbConnectionForTests();

    await expect(
      new IndexedDbContextRepository().getById(context.id),
    ).resolves.toEqual(context);
    await expect(
      new IndexedDbNodeContextRelationRepository().getByNodeAndContext(
        relation.nodeId,
        relation.contextId,
      ),
    ).resolves.toEqual(relation);
  });

  it("prevents duplicate relations through a unique nodeId + contextId index", async () => {
    const repository = new IndexedDbNodeContextRelationRepository();
    await repository.save(makeRelation({ id: "relation-1" }));

    await expect(
      repository.save(makeRelation({ id: "relation-2" })),
    ).rejects.toThrow();
  });

  it("migrates a historical version 4 relation store without workspace indexes", async () => {
    const relation = makeRelation({
      id: "legacy-relation",
      workspaceId,
      nodeId: "node-a",
      contextId: "node-b",
    });

    await createVersion4Database({
      includeRelationStore: true,
      relationIndexes: ["by-node", "by-context"],
      relations: [relation],
    });

    const repository = new IndexedDbNodeContextRelationRepository();

    await expect(repository.listByWorkspace(workspaceId)).resolves.toHaveLength(1);
    await expect(
      repository.getByNodeAndContext("node-a", "node-b"),
    ).resolves.toMatchObject({ id: "legacy-relation" });

    const migratedDb = await getVinemaDb();
    const relationStore = migratedDb
      .transaction(NODE_CONTEXT_RELATIONS_STORE)
      .objectStore(NODE_CONTEXT_RELATIONS_STORE);
    expect(migratedDb.version).toBe(VINEMA_DB_VERSION);
    expect(relationStore.indexNames.contains("by-workspace")).toBe(true);
    expect(relationStore.indexNames.contains("by-related-node")).toBe(true);
    expect(relationStore.indexNames.contains("by-relation-type")).toBe(true);
  });

  it("archives, restores and converts using inline Node keys", async () => {
    const repository = new IndexedDbNodeRepository();
    const idea = makeNode({
      id: "idea-1",
      type: "IDEA",
      content: "Idea persistente",
      organizationStatus: "INBOX",
    });
    await repository.create(idea);

    const note = await convertIdeaToNote(repository, idea.id, device);
    expect(note.id).toBe(idea.id);
    expect(note.type).toBe("NOTE");
    await expect(repository.listActive()).resolves.toHaveLength(1);

    const archived = await archiveNode(repository, note.id, device);
    expect(archived.status).toBe("ARCHIVED");
    await expect(repository.listActive()).resolves.toHaveLength(0);
    await expect(repository.listArchived()).resolves.toHaveLength(1);

    const restored = await restoreNode(repository, note.id, device);
    expect(restored.status).toBe("ACTIVE");
    await expect(repository.listActive()).resolves.toHaveLength(1);
  });

  it("stores the default Workspace by explicit id", async () => {
    const repository = new IndexedDbWorkspaceRepository();
    const workspace: Workspace = {
      id: workspaceId,
      name: "Personal",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    await repository.saveDefault(workspace);

    await expect(repository.getDefault()).resolves.toEqual(workspace);
  });

  it("stores settings with a string key and preserves Device persistence", async () => {
    const adapter = new IndexedDbAdapter();

    await adapter.set("setting-key", { enabled: true });

    await expect(adapter.get("setting-key")).resolves.toEqual({ enabled: true });

    const firstDevice = await getOrCreateDevice(adapter, DevicePlatform.WEB);
    const secondDevice = await getOrCreateDevice(adapter, DevicePlatform.PWA);

    expect(secondDevice.id).toBe(firstDevice.id);
    expect(secondDevice.platform).toBe(DevicePlatform.PWA);
  });

  it("creates and retrieves the default Workspace through the use case", async () => {
    const repository = new IndexedDbWorkspaceRepository();

    const firstWorkspace = await getOrCreateDefaultWorkspace(repository);
    const secondWorkspace = await getOrCreateDefaultWorkspace(repository);

    expect(firstWorkspace.name).toBe("Personal");
    expect(secondWorkspace).toEqual(firstWorkspace);
  });

  it("migrates a version 2 out-of-line nodes store into inline id keys", async () => {
    const oldNode = makeNode({ id: "legacy-out-of-line-node" });

    await createVersion2Database({
      nodesKeyPath: null,
      nodes: [oldNode],
    });

    await resetVinemaDbConnectionForTests();
    const repository = new IndexedDbNodeRepository();

    await expect(repository.findById(oldNode.id)).resolves.toEqual(oldNode);

    const db = await getVinemaDb();
    expect(db.version).toBe(VINEMA_DB_VERSION);
    expect(db.transaction(NODES_STORE).objectStore(NODES_STORE).keyPath).toBe("id");
    await expect(repository.listActive()).resolves.toHaveLength(1);
  });

  it("creates contexts and relations stores when migrating from version 3", async () => {
    await createVersion3Database({ nodes: [makeNode({ id: "legacy-node" })] });

    await resetVinemaDbConnectionForTests();
    const db = await getVinemaDb();

    expect(db.objectStoreNames.contains(CONTEXTS_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(NODE_CONTEXT_RELATIONS_STORE)).toBe(true);
  });

  it("migrates a version 4 database without the relation store and preserves captures", async () => {
    const legacyNode = makeNode({
      id: "legacy-meeting-note",
      content:
        "Las reuniones extensas reducen mi capacidad de concentración durante la tarde.",
    });

    await createVersion4Database({
      includeRelationStore: false,
      nodes: [legacyNode],
    });

    await resetVinemaDbConnectionForTests();
    const db = await getVinemaDb();
    const relationRepository = new IndexedDbNodeContextRelationRepository();
    const nodeRepository = new IndexedDbNodeRepository();

    expect(db.version).toBe(VINEMA_DB_VERSION);
    expect(db.objectStoreNames.contains(NODE_CONTEXT_RELATIONS_STORE)).toBe(true);
    await expect(nodeRepository.findById(legacyNode.id)).resolves.toEqual(
      legacyNode,
    );
    await expect(relationRepository.listByWorkspace(workspaceId)).resolves.toEqual(
      [],
    );

    const nodes = await nodeRepository.listByWorkspace(workspaceId);
    const relations = await relationRepository.listByWorkspace(workspaceId);
    const suggestions = suggestAssociations(
      buildAssociationIndex({ nodes, relations }),
      {
        text: "Después de muchas reuniones me cuesta concentrarme.",
      },
    );

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].node.id).toBe(legacyNode.id);
    expect(
      suggestions[0].reasons.some((reason) => reason.type === "SHARED_RELATION"),
    ).toBe(false);
  });

  it("migrates a version 4 relation store with partial indexes without losing records", async () => {
    const relation = makeRelation({
      id: "partial-index-relation",
      relationType: "CAPTURE_ASSOCIATION",
      relatedNodeId: "node-b",
    });

    await createVersion4Database({
      includeRelationStore: true,
      relationIndexes: ["by-workspace"],
      relations: [relation],
    });

    await resetVinemaDbConnectionForTests();
    const repository = new IndexedDbNodeContextRelationRepository();

    await expect(repository.listByWorkspace(workspaceId)).resolves.toEqual([
      relation,
    ]);

    const db = await getVinemaDb();
    const relationStore = db
      .transaction(NODE_CONTEXT_RELATIONS_STORE)
      .objectStore(NODE_CONTEXT_RELATIONS_STORE);

    expect(relationStore.indexNames.contains("by-workspace")).toBe(true);
    expect(relationStore.indexNames.contains("by-node")).toBe(true);
    expect(relationStore.indexNames.contains("by-context")).toBe(true);
    expect(relationStore.indexNames.contains("by-node-and-context")).toBe(true);
    expect(relationStore.indexNames.contains("by-related-node")).toBe(true);
    expect(relationStore.indexNames.contains("by-relation-type")).toBe(true);
  });

  it("repairs a missing relation store when upgrading an anomalous version 5 database", async () => {
    const legacyNode = makeNode({
      id: "version-five-without-relations-store",
      content:
        "Revisar el avance semanal del contrato y preparar el informe de gestión.",
    });

    await createVersion5DatabaseWithoutRelationStore({ nodes: [legacyNode] });

    await resetVinemaDbConnectionForTests();
    const relationRepository = new IndexedDbNodeContextRelationRepository();
    const nodeRepository = new IndexedDbNodeRepository();

    await expect(relationRepository.listByWorkspace(workspaceId)).resolves.toEqual(
      [],
    );

    const suggestions = suggestAssociations(
      buildAssociationIndex({
        nodes: await nodeRepository.listByWorkspace(workspaceId),
        relations: await relationRepository.listByWorkspace(workspaceId),
      }),
      {
        text: "Preparar el avance del contrato para el informe semanal.",
      },
    );

    expect(suggestions).toHaveLength(1);
    await expect(
      relationRepository.save(makeRelation({ id: "can-write-after-v6-upgrade" })),
    ).resolves.toMatchObject({ id: "can-write-after-v6-upgrade" });
  });

  it("saves and reloads associations after migrating a version 4 database without the relation store", async () => {
    const firstNode = makeNode({ id: "first-node" });
    const secondNode = makeNode({ id: "second-node" });
    const relation = makeRelation({
      id: "first-node-second-node",
      nodeId: firstNode.id,
      contextId: secondNode.id,
      relationType: "CAPTURE_ASSOCIATION",
      relatedNodeId: secondNode.id,
    });

    await createVersion4Database({
      includeRelationStore: false,
      nodes: [firstNode, secondNode],
    });

    await resetVinemaDbConnectionForTests();
    const repository = new IndexedDbNodeContextRelationRepository();

    await expect(repository.save(relation)).resolves.toEqual(relation);
    await expect(repository.listByWorkspace(workspaceId)).resolves.toEqual([
      relation,
    ]);

    await resetVinemaDbConnectionForTests();

    await expect(
      new IndexedDbNodeContextRelationRepository().listByWorkspace(workspaceId),
    ).resolves.toEqual([relation]);
  });

  it("migrates a version 2 in-line nodes store without losing records", async () => {
    const oldNode = makeNode({ id: "legacy-inline-node" });

    await createVersion2Database({
      nodesKeyPath: "id",
      nodes: [oldNode],
    });

    await resetVinemaDbConnectionForTests();
    const repository = new IndexedDbNodeRepository();

    await expect(repository.findById(oldNode.id)).resolves.toEqual(oldNode);

    const updatedNode = await updateNode(repository, {
      id: oldNode.id,
      content: oldNode.content,
      device,
    });

    expect(updatedNode.id).toBe(oldNode.id);
    await expect(repository.listActive()).resolves.toHaveLength(1);
  });

  it("preserves workspaces and devices when migrating incompatible version 2 stores", async () => {
    const workspace: Workspace = {
      id: "legacy-workspace",
      name: "Personal",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    await createVersion2Database({
      nodesKeyPath: null,
      workspacesKeyPath: null,
      devicesKeyPath: null,
      workspaces: [workspace],
      devices: [device],
      settings: [["vinema:default-workspace-id", workspace.id]],
    });

    await resetVinemaDbConnectionForTests();
    const db = await getVinemaDb();

    expect(
      db.transaction(WORKSPACES_STORE).objectStore(WORKSPACES_STORE).keyPath,
    ).toBe("id");
    expect(db.transaction(DEVICES_STORE).objectStore(DEVICES_STORE).keyPath).toBe(
      "id",
    );
    await expect(db.get(WORKSPACES_STORE, workspace.id)).resolves.toEqual(
      workspace,
    );
    await expect(db.get(DEVICES_STORE, device.id)).resolves.toEqual(device);
  });
});

async function createVersion2Database({
  nodesKeyPath,
  workspacesKeyPath = "id",
  devicesKeyPath = "id",
  nodes = [],
  workspaces = [],
  devices = [],
  settings = [],
}: {
  nodesKeyPath: "id" | null;
  workspacesKeyPath?: "id" | null;
  devicesKeyPath?: "id" | null;
  nodes?: Node[];
  workspaces?: Workspace[];
  devices?: Device[];
  settings?: Array<[string, unknown]>;
}) {
  await resetVinemaDbConnectionForTests();
  await deleteDB(VINEMA_DB_NAME);

  const db = await openDB(VINEMA_DB_NAME, 2, {
    upgrade(database) {
      const appSettings = database.createObjectStore(APP_SETTINGS_STORE);
      database.createObjectStore(LEGACY_KEY_VALUE_STORE);
      const nodesStore =
        nodesKeyPath === "id"
          ? database.createObjectStore(NODES_STORE, { keyPath: "id" })
          : database.createObjectStore(NODES_STORE);
      const workspacesStore =
        workspacesKeyPath === "id"
          ? database.createObjectStore(WORKSPACES_STORE, { keyPath: "id" })
          : database.createObjectStore(WORKSPACES_STORE);
      const devicesStore =
        devicesKeyPath === "id"
          ? database.createObjectStore(DEVICES_STORE, { keyPath: "id" })
          : database.createObjectStore(DEVICES_STORE);

      nodes.forEach((node) => {
        if (nodesKeyPath === "id") {
          nodesStore.put(node);
        } else {
          nodesStore.put(node, node.id);
        }
      });
      workspaces.forEach((workspace) => {
        if (workspacesKeyPath === "id") {
          workspacesStore.put(workspace);
        } else {
          workspacesStore.put(workspace, workspace.id);
        }
      });
      devices.forEach((legacyDevice) => {
        if (devicesKeyPath === "id") {
          devicesStore.put(legacyDevice);
        } else {
          devicesStore.put(legacyDevice, legacyDevice.id);
        }
      });
      settings.forEach(([key, value]) => {
        appSettings.put(value, key);
      });
    },
  });

  db.close();
}

async function createVersion3Database({
  nodes = [],
}: {
  nodes?: Node[];
}) {
  await resetVinemaDbConnectionForTests();
  await deleteDB(VINEMA_DB_NAME);

  const db = await openDB(VINEMA_DB_NAME, 3, {
    upgrade(database) {
      database.createObjectStore(APP_SETTINGS_STORE);
      database.createObjectStore(LEGACY_KEY_VALUE_STORE);
      database.createObjectStore(WORKSPACES_STORE, { keyPath: "id" });
      database.createObjectStore(DEVICES_STORE, { keyPath: "id" });
      const nodesStore = database.createObjectStore(NODES_STORE, {
        keyPath: "id",
      });

      nodesStore.createIndex("by-updated-at", "updatedAt");
      nodesStore.createIndex("by-workspace", "workspaceId");

      nodes.forEach((node) => {
        nodesStore.put(node);
      });
    },
  });

  db.close();
}

async function createVersion4Database({
  includeRelationStore,
  relationIndexes = [],
  nodes = [],
  relations = [],
}: {
  includeRelationStore: boolean;
  relationIndexes?: Array<
    | "by-workspace"
    | "by-node"
    | "by-context"
    | "by-node-and-context"
    | "by-related-node"
    | "by-relation-type"
  >;
  nodes?: Node[];
  relations?: NodeContextRelation[];
}) {
  await resetVinemaDbConnectionForTests();
  await deleteDB(VINEMA_DB_NAME);

  const db = await openDB(VINEMA_DB_NAME, 4, {
    upgrade(database) {
      database.createObjectStore(APP_SETTINGS_STORE);
      database.createObjectStore(LEGACY_KEY_VALUE_STORE);
      database.createObjectStore(WORKSPACES_STORE, { keyPath: "id" });
      database.createObjectStore(DEVICES_STORE, { keyPath: "id" });
      const nodesStore = database.createObjectStore(NODES_STORE, {
        keyPath: "id",
      });
      const contextsStore = database.createObjectStore(CONTEXTS_STORE, {
        keyPath: "id",
      });

      nodesStore.createIndex("by-updated-at", "updatedAt");
      nodesStore.createIndex("by-workspace", "workspaceId");
      contextsStore.createIndex("by-workspace", "workspaceId");
      contextsStore.createIndex("by-type", "type");
      contextsStore.createIndex("by-archived-at", "archivedAt");
      contextsStore.createIndex("by-workspace-and-type", ["workspaceId", "type"]);

      for (const node of nodes) {
        nodesStore.put(node);
      }

      if (!includeRelationStore) {
        return;
      }

      const relationStore = database.createObjectStore(
        NODE_CONTEXT_RELATIONS_STORE,
        { keyPath: "id" },
      );
      createLegacyRelationIndexes(relationStore, relationIndexes);

      for (const relation of relations) {
        relationStore.put(relation);
      }
    },
  });

  db.close();
}

async function createVersion5DatabaseWithoutRelationStore({
  nodes = [],
}: {
  nodes?: Node[];
}) {
  await resetVinemaDbConnectionForTests();
  await deleteDB(VINEMA_DB_NAME);

  const db = await openDB(VINEMA_DB_NAME, 5, {
    upgrade(database) {
      database.createObjectStore(APP_SETTINGS_STORE);
      database.createObjectStore(LEGACY_KEY_VALUE_STORE);
      database.createObjectStore(WORKSPACES_STORE, { keyPath: "id" });
      database.createObjectStore(DEVICES_STORE, { keyPath: "id" });
      const nodesStore = database.createObjectStore(NODES_STORE, {
        keyPath: "id",
      });
      const contextsStore = database.createObjectStore(CONTEXTS_STORE, {
        keyPath: "id",
      });

      nodesStore.createIndex("by-updated-at", "updatedAt");
      nodesStore.createIndex("by-workspace", "workspaceId");
      contextsStore.createIndex("by-workspace", "workspaceId");
      contextsStore.createIndex("by-type", "type");
      contextsStore.createIndex("by-archived-at", "archivedAt");
      contextsStore.createIndex("by-workspace-and-type", ["workspaceId", "type"]);

      for (const node of nodes) {
        nodesStore.put(node);
      }
    },
  });

  db.close();
}

function createLegacyRelationIndexes(
  store: IDBPObjectStoreLike,
  indexes: Array<
    | "by-workspace"
    | "by-node"
    | "by-context"
    | "by-node-and-context"
    | "by-related-node"
    | "by-relation-type"
  >,
) {
  for (const index of indexes) {
    if (index === "by-workspace") {
      store.createIndex("by-workspace", "workspaceId");
    }
    if (index === "by-node") {
      store.createIndex("by-node", "nodeId");
    }
    if (index === "by-context") {
      store.createIndex("by-context", "contextId");
    }
    if (index === "by-node-and-context") {
      store.createIndex("by-node-and-context", ["nodeId", "contextId"], {
        unique: true,
      });
    }
    if (index === "by-related-node") {
      store.createIndex("by-related-node", "relatedNodeId");
    }
    if (index === "by-relation-type") {
      store.createIndex("by-relation-type", "relationType");
    }
  }
}

type IDBPObjectStoreLike = {
  createIndex(
    name: string,
    keyPath: string | string[],
    options?: IDBIndexParameters,
  ): unknown;
};
