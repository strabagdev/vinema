import { describe, expect, it } from "vitest";
import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import { createMemoryEvidenceModel } from "@/features/cognition/memory-evidence/memory-evidence-model";

const now = new Date("2026-08-01T12:00:00.000Z");

describe("Memory Evidence Model", () => {
  it("canonicalizes aliases once per node and builds deterministic concept series", () => {
    const contexts = [
      context({ id: "vinema", name: "Vinema", aliases: ["Segundo cerebro"] }),
      context({ id: "alias", name: "Segundo cerebro" }),
      context({ id: "sync", name: "Sync" }),
    ];
    const nodes = [
      node({ id: "a", updatedAt: "2026-07-20T10:00:00.000Z" }),
      node({ id: "b", updatedAt: "2026-06-20T10:00:00.000Z" }),
    ];
    const relations = nodes.flatMap((memory) => [
      relation({ nodeId: memory.id, contextId: "vinema" }),
      relation({ nodeId: memory.id, contextId: "alias" }),
      relation({ nodeId: memory.id, contextId: "sync" }),
    ]);

    const model = createMemoryEvidenceModel({
      contexts,
      relations,
      nodes,
      now,
      recentWindowDays: 30,
    });

    expect(model.conceptSeriesById.get("vinema")?.evidenceNodeIds).toEqual([
      "a",
      "b",
    ]);
    expect(model.conceptSeriesById.has("alias")).toBe(false);
    expect(model.evidenceNodes.map((memory) => memory.conceptIds)).toEqual([
      ["sync", "vinema"],
      ["sync", "vinema"],
    ]);
  });

  it("computes temporal windows, monthly spread and latest evidence", () => {
    const model = createMemoryEvidenceModel({
      contexts: [context({ id: "vinema", name: "Vinema" })],
      nodes: [
        node({ id: "historical", updatedAt: "2026-05-01T10:00:00.000Z" }),
        node({ id: "previous", updatedAt: "2026-06-20T10:00:00.000Z" }),
        node({ id: "recent", updatedAt: "2026-07-20T10:00:00.000Z" }),
      ],
      relations: [
        relation({ nodeId: "historical", contextId: "vinema" }),
        relation({ nodeId: "previous", contextId: "vinema" }),
        relation({ nodeId: "recent", contextId: "vinema" }),
      ],
      now,
      recentWindowDays: 30,
    });
    const series = model.conceptSeriesById.get("vinema");

    expect(series).toMatchObject({
      totalCount: 3,
      recentCount: 1,
      previousCount: 1,
      historicalCount: 2,
      monthlySpread: 3,
      recentEvidenceNodeIds: ["recent"],
      previousEvidenceNodeIds: ["previous"],
      historicalEvidenceNodeIds: ["historical", "previous"],
    });
    expect(series?.firstSeenAt?.toISOString()).toBe("2026-05-01T10:00:00.000Z");
    expect(series?.latestActivityAt?.toISOString()).toBe(
      "2026-07-20T10:00:00.000Z",
    );
  });

  it("builds relationship series from accepted co-occurrence", () => {
    const model = createMemoryEvidenceModel({
      contexts: [
        context({ id: "mitcom", name: "Mitcom" }),
        context({ id: "tracking", name: "Tracking" }),
      ],
      nodes: [
        node({ id: "previous", updatedAt: "2026-06-20T10:00:00.000Z" }),
        node({ id: "recent", updatedAt: "2026-07-20T10:00:00.000Z" }),
      ],
      relations: [
        ...relationsFor("previous", ["mitcom", "tracking"]),
        ...relationsFor("recent", ["mitcom", "tracking"]),
      ],
      now,
      recentWindowDays: 30,
    });

    expect(model.relationshipSeriesByKey.get("mitcom+tracking")).toMatchObject({
      conceptIds: ["mitcom", "tracking"],
      sharedEvidenceNodeIds: ["previous", "recent"],
      totalCount: 2,
      recentCount: 1,
      previousCount: 1,
      monthlySpread: 2,
    });
  });

  it("excludes deleted captures and forgotten capture tombstones but keeps legacy archived concepts", () => {
    const model = createMemoryEvidenceModel({
      contexts: [
        context({ id: "active", name: "Active" }),
        context({
          id: "legacy-archived",
          name: "Legacy Archived",
          archivedAt: "2026-01-01T00:00:00.000Z",
        }),
      ],
      nodes: [
        node({ id: "active-node", updatedAt: "2026-07-20T10:00:00.000Z" }),
        node({
          id: "forgotten-node",
          archivedAt: "2026-07-21T10:00:00.000Z",
          updatedAt: "2026-07-21T10:00:00.000Z",
        }),
        node({
          id: "deleted-node",
          deletedAt: "2026-07-21T10:00:00.000Z",
          updatedAt: "2026-07-21T10:00:00.000Z",
        }),
      ],
      relations: [
        ...relationsFor("active-node", ["active", "legacy-archived"]),
        ...relationsFor("forgotten-node", ["active", "legacy-archived"]),
        ...relationsFor("deleted-node", ["active", "legacy-archived"]),
        relation({
          nodeId: "active-node",
          contextId: "discarded",
          relationType: "CAPTURE_ASSOCIATION",
        }),
      ],
      now,
      recentWindowDays: 30,
    });

    expect(model.evidenceNodes.map((memory) => memory.nodeId)).toEqual([
      "active-node",
    ]);
    expect(model.conceptSeriesById.has("legacy-archived")).toBe(true);
    expect(model.conceptSeriesById.has("discarded")).toBe(false);
  });

  it("returns stable order for equivalent input permutations", () => {
    const contexts = [
      context({ id: "mitcom", name: "Mitcom" }),
      context({ id: "tracking", name: "Tracking" }),
    ];
    const nodes = [
      node({ id: "a", updatedAt: "2026-06-20T10:00:00.000Z" }),
      node({ id: "b", updatedAt: "2026-07-20T10:00:00.000Z" }),
    ];
    const relations = [
      ...relationsFor("a", ["mitcom", "tracking"]),
      ...relationsFor("b", ["mitcom", "tracking"]),
    ];
    const first = createMemoryEvidenceModel({
      contexts,
      nodes,
      relations,
      now,
      recentWindowDays: 30,
    });
    const second = createMemoryEvidenceModel({
      contexts: [...contexts].reverse(),
      nodes: [...nodes].reverse(),
      relations: [...relations].reverse(),
      now,
      recentWindowDays: 30,
    });

    expect(first.evidenceNodes.map((memory) => memory.nodeId)).toEqual(
      second.evidenceNodes.map((memory) => memory.nodeId),
    );
    expect(Array.from(first.relationshipSeriesByKey.keys())).toEqual(
      Array.from(second.relationshipSeriesByKey.keys()),
    );
  });
});

function context(overrides: Partial<Context>): Context {
  return {
    id: "context",
    workspaceId: "workspace-1",
    type: "AREA",
    name: "Context",
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
    contentUpdatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
    archivedAt: null,
    restoredAt: null,
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
    id: `${overrides.nodeId ?? "node"}-${overrides.contextId ?? "context"}`,
    workspaceId: "workspace-1",
    nodeId: "node",
    contextId: "context",
    relationType: "CONTEXT",
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function relationsFor(nodeId: string, contextIds: string[]) {
  return contextIds.map((contextId) => relation({ nodeId, contextId }));
}
