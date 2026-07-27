import { describe, expect, it } from "vitest";
import type { Device } from "@/domain/device/device";
import { DevicePlatform } from "@/domain/device/device";
import type { Node } from "@/domain/node/node";
import type { Workspace } from "@/domain/workspace/workspace";
import { archiveNode } from "@/features/node/archive-node";
import { convertIdeaToNote } from "@/features/node/convert-idea-to-note";
import { createNode } from "@/features/node/create-node";
import { listActiveNodes, listInboxNodes } from "@/features/node/list-nodes";
import { restoreNode } from "@/features/node/restore-node";
import { updateNode } from "@/features/node/update-node";
import { InMemoryNodeRepository } from "@/tests/fakes/in-memory-node-repository";

const workspace: Workspace = {
  id: "workspace-1",
  name: "Personal",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const device: Device = {
  id: "device-1",
  name: "Vinema web",
  platform: DevicePlatform.WEB,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastSeenAt: "2026-01-01T00:00:00.000Z",
};

function makeNode(overrides: Partial<Node>): Node {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    workspaceId: workspace.id,
    type: "NOTE",
    content: "Contenido",
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

describe("Node core", () => {
  it("creates a Node with default domain values", async () => {
    const repository = new InMemoryNodeRepository();

    const node = await createNode(repository, {
      type: "NOTE",
      content: "Contenido vivo",
      organizationStatus: "ORGANIZED",
      workspace,
      device,
    });

    expect(node.id).toEqual(expect.any(String));
    expect("title" in node).toBe(false);
    expect(node.version).toBe(1);
    expect(node.status).toBe("ACTIVE");
    expect("context" in node).toBe(false);
    expect(node.metadata).toEqual({});
    expect(node.deletedAt).toBeNull();
    expect(await repository.findById(node.id)).toEqual(node);
  });

  it("rejects empty content", async () => {
    const repository = new InMemoryNodeRepository();

    await expect(
      createNode(repository, {
        type: "NOTE",
        content: " ",
        organizationStatus: "ORGANIZED",
        workspace,
        device,
      }),
    ).rejects.toThrow("Escribe contenido");
  });

  it("increments version when editing", async () => {
    const repository = new InMemoryNodeRepository();
    const node = await createNode(repository, {
      type: "NOTE",
      content: "Contenido",
      organizationStatus: "ORGANIZED",
      workspace,
      device,
    });

    const updatedNode = await updateNode(repository, {
      id: node.id,
      content: "Contenido editado",
      device,
    });

    expect(updatedNode.version).toBe(2);
    expect("title" in updatedNode).toBe(false);
    expect(updatedNode.content).toBe("Contenido editado");
  });

  it("archives and restores without deleting", async () => {
    const repository = new InMemoryNodeRepository([makeNode({ id: "note-1" })]);

    const archivedNode = await archiveNode(repository, "note-1", device);

    expect(archivedNode.status).toBe("ARCHIVED");
    expect(archivedNode.version).toBe(2);
    expect(archivedNode.deletedAt).toBeNull();

    const restoredNode = await restoreNode(repository, "note-1", device);

    expect(restoredNode.status).toBe("ACTIVE");
    expect(restoredNode.version).toBe(3);
  });

  it("lists active notes and inbox ideas separately", async () => {
    const activeNote = makeNode({ id: "active-note", type: "NOTE" });
    const inboxIdea = makeNode({
      id: "inbox-idea",
      type: "IDEA",
      organizationStatus: "INBOX",
    });
    const archivedNote = makeNode({ id: "archived-note", status: "ARCHIVED" });
    const repository = new InMemoryNodeRepository([
      activeNote,
      inboxIdea,
      archivedNote,
    ]);

    await expect(listActiveNodes(repository)).resolves.toEqual([activeNote]);
    await expect(listInboxNodes(repository)).resolves.toEqual([inboxIdea]);
  });

  it("converts an IDEA into an existing NOTE without duplicating it", async () => {
    const idea = makeNode({
      id: "idea-1",
      type: "IDEA",
      content: "Investigar arquitectura local first",
      organizationStatus: "INBOX",
    });
    const repository = new InMemoryNodeRepository([idea]);

    const note = await convertIdeaToNote(repository, idea.id, device);

    expect(note.id).toBe(idea.id);
    expect(note.type).toBe("NOTE");
    expect(note.organizationStatus).toBe("ORGANIZED");
    expect(note.content).toBe("Investigar arquitectura local first");
    expect("title" in note).toBe(false);
    expect(note.version).toBe(2);
    await expect(repository.listInbox()).resolves.toEqual([]);
    await expect(repository.listActive()).resolves.toHaveLength(1);
  });

  it("orders lists by updatedAt descending", async () => {
    const oldNode = makeNode({
      id: "old",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const newNode = makeNode({
      id: "new",
      updatedAt: "2026-01-03T00:00:00.000Z",
    });
    const middleNode = makeNode({
      id: "middle",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    const repository = new InMemoryNodeRepository([
      oldNode,
      newNode,
      middleNode,
    ]);

    await expect(listActiveNodes(repository)).resolves.toEqual([
      newNode,
      middleNode,
      oldNode,
    ]);
  });
});
