import { describe, expect, it } from "vitest";
import type { Node } from "@/domain/node/node";
import {
  compareByContentTimestamp,
  getCaptureTimestamps,
} from "@/features/capture/capture-timestamps";
import { listKnowledgeCapturePage } from "@/features/capture/list-knowledge-captures";
import { createNode } from "@/features/node/create-node";
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
  it("derives content timestamps for active and legacy archived captures", () => {
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
    });
    expect(getCaptureTimestamps(archived)).toMatchObject({
      contentUpdatedAt: "2026-01-04T00:00:00.000Z",
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
  });

  it("updates contentUpdatedAt on edit", async () => {
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
  });

  it("orders Base by contentUpdatedAt and includes legacy archived captures", async () => {
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
      items: [
        { id: "archive-a" },
        { id: "fresh-content" },
        { id: "archive-b" },
        { id: "old-restored" },
      ],
    });
  });

  it("uses id as stable timestamp tie breaker", () => {
    const b = makeNode({ id: "b", contentUpdatedAt: "2026-01-01T00:00:00.000Z" });
    const a = makeNode({ id: "a", contentUpdatedAt: "2026-01-01T00:00:00.000Z" });

    expect([b, a].sort(compareByContentTimestamp).map((node) => node.id)).toEqual([
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
