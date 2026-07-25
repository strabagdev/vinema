import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteDB, openDB } from "idb";
import type { Device } from "@/domain/device/device";
import { DevicePlatform } from "@/domain/device/device";
import type { Node } from "@/domain/node/node";
import type { Workspace } from "@/domain/workspace/workspace";
import { getOrCreateDevice } from "@/features/device/get-or-create-device";
import { archiveNode } from "@/features/node/archive-node";
import { convertIdeaToNote } from "@/features/node/convert-idea-to-note";
import { restoreNode } from "@/features/node/restore-node";
import { updateNode } from "@/features/node/update-node";
import { getOrCreateDefaultWorkspace } from "@/features/workspace/get-or-create-default-workspace";
import { IndexedDbNodeRepository } from "@/infrastructure/node/indexed-db-node-repository";
import { IndexedDbAdapter } from "@/infrastructure/storage/indexed-db-adapter";
import {
  APP_SETTINGS_STORE,
  DEVICES_STORE,
  LEGACY_KEY_VALUE_STORE,
  NODES_STORE,
  VINEMA_DB_NAME,
  WORKSPACES_STORE,
  getVinemaDb,
  resetVinemaDbConnectionForTests,
} from "@/infrastructure/storage/vinema-db";
import { IndexedDbWorkspaceRepository } from "@/infrastructure/workspace/indexed-db-workspace-repository";

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
    workspaceId: "workspace-indexeddb",
    type: "NOTE",
    title: "Nota local",
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

describe("IndexedDB repositories", () => {
  beforeEach(async () => {
    await resetVinemaDbConnectionForTests();
    await deleteDB(VINEMA_DB_NAME);
  });

  afterEach(async () => {
    await resetVinemaDbConnectionForTests();
    await deleteDB(VINEMA_DB_NAME);
  });

  it("creates a clean version 3 database with the expected keyPath schema", async () => {
    const db = await getVinemaDb();

    expect(db.version).toBe(3);
    expect(db.transaction(NODES_STORE).objectStore(NODES_STORE).keyPath).toBe("id");
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

  it("updates a Node by the same id without creating duplicates", async () => {
    const repository = new IndexedDbNodeRepository();
    const node = makeNode({ id: "node-1" });
    await repository.create(node);

    const updatedNode = await updateNode(repository, {
      id: node.id,
      title: "Nota editada",
      content: "Contenido editado",
      device,
    });

    expect(updatedNode.id).toBe(node.id);
    await expect(repository.findById(node.id)).resolves.toMatchObject({
      id: node.id,
      title: "Nota editada",
      version: 2,
    });
    await expect(repository.listActive()).resolves.toHaveLength(1);
  });

  it("archives, restores and converts using inline Node keys", async () => {
    const repository = new IndexedDbNodeRepository();
    const idea = makeNode({
      id: "idea-1",
      type: "IDEA",
      title: "",
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
      id: "workspace-indexeddb",
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
    expect(db.version).toBe(3);
    expect(db.transaction(NODES_STORE).objectStore(NODES_STORE).keyPath).toBe("id");
    await expect(repository.listActive()).resolves.toHaveLength(1);
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
      title: "Migrada",
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
