import { describe, expect, it } from "vitest";
import type { Node } from "@/domain/node/node";
import {
  compareByArchivedTimestamp,
  compareByContentTimestamp,
  getCaptureTimestamps,
} from "@/features/capture/capture-timestamps";
import {
  listArchivedCapturePage,
  listKnowledgeCapturePage,
} from "@/features/capture/list-knowledge-captures";
import { archiveNode } from "@/features/node/archive-node";
import { createNode } from "@/features/node/create-node";
import { restoreNode } from "@/features/node/restore-node";
import { updateNode } from "@/features/node/update-node";
import { InMemoryNodeRepository } from "@/tests/fakes/in-memory-node-repository";
import { DevicePlatform, type Device } from "@/domain/device/device";
import type { Workspace } from "@/domain/workspace/workspace";

const device: Device = {
  id: "device-1",
  name: "Web",
  platform: DevicePlatform.WEB,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastSeenAt: "2026-01-01T00:00:00.000Z",
};

const workspace: Workspace = {
  id: "workspace-1",
  name: "Personal",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("capture timestamps", () => {
  it("derives compatible timestamps for legacy active and archived captures", () => {
    const active = makeNode({
      id: "active",
      updatedAt: "2026-01-03T00:00:00.000Z",
    });
    const archived = makeNode({
      id: "archived",
      status: "ARCHIVED",
      updatedAt: "2026-01-04T00:00:00.000Z",
    });

    expect(getCaptureTimestamps(active)).toMatchObject({
      contentUpdatedAt: "2026-01-03T00:00:00.000Z",
      archivedAt: null,
    });
    expect(getCaptureTimestamps(archived)).toMatchObject({
      contentUpdatedAt: "2026-01-04T00:00:00.000Z",
      archivedAt: "2026-01-04T00:00:00.000Z",
    });
  });

  it("sets coherent initial timestamps when creating", async () => {
    const repository = new InMemoryNodeRepository();
    const node = await createNode(repository, {
      type: "NOTE",
      content: "Contenido",
      organizationStatus: "ORGANIZED",
      workspace,
      device,
    });

    expect(node.createdAt).toBe(node.contentUpdatedAt);
    expect(node.updatedAt).toBe(node.contentUpdatedAt);
    expect(node.archivedAt).toBeNull();
    expect(node.restoredAt).toBeNull();
  });

  it("updates contentUpdatedAt on edit and preserves archive fields", async () => {
    const repository = new InMemoryNodeRepository([
      makeNode({
        id: "capture",
        contentUpdatedAt: "2026-01-02T00:00:00.000Z",
        archivedAt: null,
      }),
    ]);

    const updated = await updateNode(repository, {
      id: "capture",
      content: "Contenido editado",
      device,
    });

    expect(updated.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(updated.contentUpdatedAt).toEqual(expect.any(String));
    expect(updated.contentUpdatedAt).toBe(updated.updatedAt);
    expect(updated.archivedAt).toBeNull();
  });

  it("archives and restores without changing contentUpdatedAt or createdAt", async () => {
    const repository = new InMemoryNodeRepository([
      makeNode({
        id: "capture",
        contentUpdatedAt: "2026-01-02T00:00:00.000Z",
      }),
    ]);

    const archived = await archiveNode(repository, "capture", device);

    expect(archived.status).toBe("ARCHIVED");
    expect(archived.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(archived.contentUpdatedAt).toBe("2026-01-02T00:00:00.000Z");
    expect(archived.archivedAt).toEqual(expect.any(String));
    expect(archived.updatedAt).toBe(archived.archivedAt);

    const restored = await restoreNode(repository, "capture", device);

    expect(restored.status).toBe("ACTIVE");
    expect(restored.id).toBe("capture");
    expect(restored.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(restored.contentUpdatedAt).toBe("2026-01-02T00:00:00.000Z");
    expect(restored.archivedAt).toBeNull();
    expect(restored.restoredAt).toEqual(expect.any(String));
    expect(restored.updatedAt).toBe(restored.restoredAt);
  });

  it("orders Base by contentUpdatedAt and Archive by archivedAt", async () => {
    const repository = new InMemoryNodeRepository([
      makeNode({
        id: "old-restored",
        status: "ACTIVE",
        contentUpdatedAt: "2026-01-01T00:00:00.000Z",
        restoredAt: "2026-01-06T00:00:00.000Z",
        updatedAt: "2026-01-06T00:00:00.000Z",
      }),
      makeNode({
        id: "fresh-content",
        status: "ACTIVE",
        contentUpdatedAt: "2026-01-05T00:00:00.000Z",
        updatedAt: "2026-01-05T00:00:00.000Z",
      }),
      makeNode({
        id: "archive-a",
        status: "ARCHIVED",
        contentUpdatedAt: "2026-01-05T00:00:00.000Z",
        archivedAt: "2026-01-03T00:00:00.000Z",
      }),
      makeNode({
        id: "archive-b",
        status: "ARCHIVED",
        contentUpdatedAt: "2026-01-01T00:00:00.000Z",
        archivedAt: "2026-01-04T00:00:00.000Z",
      }),
    ]);

    await expect(
      listKnowledgeCapturePage(repository, { workspaceId: workspace.id, limit: 10 }),
    ).resolves.toMatchObject({
      items: [{ id: "fresh-content" }, { id: "old-restored" }],
    });
    await expect(
      listArchivedCapturePage(repository, { workspaceId: workspace.id, limit: 10 }),
    ).resolves.toMatchObject({
      items: [{ id: "archive-b" }, { id: "archive-a" }],
    });
  });

  it("uses id as stable timestamp tie breaker", () => {
    const b = makeNode({ id: "b", contentUpdatedAt: "2026-01-01T00:00:00.000Z" });
    const a = makeNode({ id: "a", contentUpdatedAt: "2026-01-01T00:00:00.000Z" });

    expect([b, a].sort(compareByContentTimestamp).map((node) => node.id)).toEqual([
      "a",
      "b",
    ]);
    expect([b, a].sort(compareByArchivedTimestamp).map((node) => node.id)).toEqual([
      "a",
      "b",
    ]);
  });
});

function makeNode(overrides: Partial<Node> & { id: string }): Node {
  const { id, ...rest } = overrides;

  return {
    id,
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
    ...rest,
  };
}
