import { describe, expect, it } from "vitest";
import type { Context } from "@/domain/context/context";
import type { Node } from "@/domain/node/node";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import { deriveConceptNeighborhood } from "@/features/exploration/concept-neighborhood";
import {
  getConceptExplorationPath,
  getConceptIdFromSearchParams,
} from "@/features/exploration/concept-routes";

describe("contextual concept exploration", () => {
  it("builds static concept exploration routes", () => {
    expect(getConceptExplorationPath("railway/sync?")).toBe(
      "/concepts/detail?contextId=railway%2Fsync%3F",
    );
    expect(
      getConceptExplorationPath("workspace", { returnTo: "/notes/detail?nodeId=a" }),
    ).toBe(
      "/concepts/detail?contextId=workspace&returnTo=%2Fnotes%2Fdetail%3FnodeId%3Da",
    );
    expect(
      getConceptIdFromSearchParams(new URLSearchParams("contextId=Railway")),
    ).toBe("Railway");
    expect(getConceptIdFromSearchParams(new URLSearchParams())).toBeNull();
  });

  it("derives connected concepts by capture cooccurrence", () => {
    const neighborhood = deriveConceptNeighborhood({
      currentContextId: "railway",
      contexts: [
        context({ id: "railway", name: "Railway" }),
        context({ id: "sync", name: "Sync" }),
        context({ id: "workspace", name: "Workspace" }),
        context({ id: "auth", name: "Auth" }),
      ],
      nodes: [
        node({ id: "a", updatedAt: "2026-01-03T00:00:00.000Z" }),
        node({ id: "b", updatedAt: "2026-01-02T00:00:00.000Z" }),
        node({ id: "c", updatedAt: "2026-01-04T00:00:00.000Z" }),
      ],
      relations: [
        relation({ nodeId: "a", contextId: "railway" }),
        relation({ nodeId: "a", contextId: "sync" }),
        relation({ nodeId: "a", contextId: "workspace" }),
        relation({ nodeId: "b", contextId: "railway" }),
        relation({ nodeId: "b", contextId: "sync" }),
        relation({ nodeId: "c", contextId: "auth" }),
      ],
    });

    expect(neighborhood?.relatedConcepts).toMatchObject([
      {
        id: "sync",
        label: "Sync",
        sharedCaptureCount: 2,
      },
      {
        id: "workspace",
        label: "Workspace",
        sharedCaptureCount: 1,
      },
    ]);
  });

  it("orders by shared count, recent activity and label while excluding archived records", () => {
    const neighborhood = deriveConceptNeighborhood({
      currentContextId: "railway",
      contexts: [
        context({ id: "railway", name: "Railway" }),
        context({ id: "a", name: "A" }),
        context({ id: "b", name: "B" }),
        context({
          id: "archived-context",
          name: "Archivado",
          archivedAt: "2026-01-01T00:00:00.000Z",
        }),
      ],
      nodes: [
        node({ id: "old", updatedAt: "2026-01-01T00:00:00.000Z" }),
        node({ id: "new", updatedAt: "2026-01-05T00:00:00.000Z" }),
        node({ id: "archived", status: "ARCHIVED" }),
      ],
      relations: [
        relation({ nodeId: "old", contextId: "railway" }),
        relation({ nodeId: "old", contextId: "a" }),
        relation({ nodeId: "new", contextId: "railway" }),
        relation({ nodeId: "new", contextId: "b" }),
        relation({ nodeId: "new", contextId: "archived-context" }),
        relation({ nodeId: "archived", contextId: "railway" }),
        relation({ nodeId: "archived", contextId: "a" }),
      ],
    });

    expect(neighborhood?.relatedConcepts.map((item) => item.id)).toEqual([
      "b",
      "a",
    ]);
  });
});

function context(overrides: Partial<Context>): Context {
  return {
    id: "context",
    workspaceId: "workspace-1",
    type: "PROJECT",
    name: "Context",
    description: null,
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}

function node(overrides: Partial<Node>): Node {
  return {
    id: "node",
    workspaceId: "workspace-1",
    type: "NOTE",
    content: "Contenido",
    status: "ACTIVE",
    organizationStatus: "ORGANIZED",
    metadata: {},
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    createdByDeviceId: "device-1",
    lastModifiedByDeviceId: "device-1",
    ...overrides,
  };
}

function relation(
  overrides: Partial<NodeContextRelation>,
): NodeContextRelation {
  return {
    id: `relation-${overrides.nodeId}-${overrides.contextId}`,
    workspaceId: "workspace-1",
    nodeId: "node",
    contextId: "context",
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}
