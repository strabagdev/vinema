import { describe, expect, it } from "vitest";
import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import {
  calculateRelationshipStrength,
  deriveConceptGraphNeighborhood,
  deriveConceptRelationships,
  selectRelationshipEvidence,
} from "@/features/exploration/concept-relationships";

const now = new Date("2026-08-01T12:00:00.000Z");

describe("derived concept relationships", () => {
  it("derives bidirectional relationships from accepted co-occurrence", () => {
    const setup = relationshipSetup({
      sharedDates: ["2026-07-31T10:00:00.000Z"],
    });

    expect(
      deriveConceptRelationships({
        sourceConceptId: "tom-ford",
        ...setup,
        now,
      }),
    ).toMatchObject([
      {
        sourceConceptId: "tom-ford",
        targetConceptId: "ombre-leather",
        sharedMemoryCount: 1,
        strength: "WEAK",
      },
    ]);
    expect(
      deriveConceptRelationships({
        sourceConceptId: "ombre-leather",
        ...setup,
        now,
      }),
    ).toMatchObject([
      {
        sourceConceptId: "ombre-leather",
        targetConceptId: "tom-ford",
        sharedMemoryCount: 1,
        strength: "WEAK",
      },
    ]);
  });

  it("classifies weak, medium and strong relationships deterministically", () => {
    expect(
      calculateRelationshipStrength({
        sharedMemoryCount: 1,
        recentSharedMemoryCount: 1,
        monthlySpread: 1,
        averageConceptsPerMemory: 2,
        firstSharedAt: new Date("2026-07-31T00:00:00.000Z"),
        lastSharedAt: new Date("2026-07-31T00:00:00.000Z"),
      }).strength,
    ).toBe("WEAK");
    expect(
      calculateRelationshipStrength({
        sharedMemoryCount: 3,
        recentSharedMemoryCount: 1,
        monthlySpread: 2,
        averageConceptsPerMemory: 2,
        firstSharedAt: new Date("2026-06-01T00:00:00.000Z"),
        lastSharedAt: new Date("2026-07-31T00:00:00.000Z"),
      }).strength,
    ).toBe("MEDIUM");
    expect(
      calculateRelationshipStrength({
        sharedMemoryCount: 6,
        recentSharedMemoryCount: 3,
        monthlySpread: 4,
        averageConceptsPerMemory: 2,
        firstSharedAt: new Date("2026-03-01T00:00:00.000Z"),
        lastSharedAt: new Date("2026-07-31T00:00:00.000Z"),
      }).strength,
    ).toBe("STRONG");
  });

  it("scores temporal spread, recent activity and evidence order", () => {
    const setup = relationshipSetup({
      sharedDates: [
        "2026-05-01T10:00:00.000Z",
        "2026-06-01T10:00:00.000Z",
        "2026-07-31T10:00:00.000Z",
      ],
    });
    const [relationship] = deriveConceptRelationships({
      sourceConceptId: "tom-ford",
      ...setup,
      now,
    });

    expect(relationship).toMatchObject({
      sharedMemoryCount: 3,
      recentSharedMemoryCount: 1,
      monthlySpread: 3,
      strength: "MEDIUM",
    });
    expect(relationship.firstSharedAt?.toISOString()).toBe(
      "2026-05-01T10:00:00.000Z",
    );
    expect(relationship.lastSharedAt?.toISOString()).toBe(
      "2026-07-31T10:00:00.000Z",
    );
    expect(relationship.evidence.map((item) => item.nodeId)).toEqual([
      "memory-2",
      "memory-0",
      "memory-1",
    ]);
  });

  it("penalizes overly general concepts without deleting them", () => {
    const contexts = [
      context({ id: "tom-ford", name: "Tom Ford" }),
      context({ id: "perfumes", name: "Perfumes" }),
      context({ id: "reunion", name: "Reunión" }),
    ];
    const nodes = Array.from({ length: 20 }, (_, index) =>
      node({
        id: `memory-${index}`,
        content: `Memoria de perfumes ${index}`,
        updatedAt: `2026-07-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
      }),
    );
    const relations = nodes.flatMap((memory, index) => [
      relation({ nodeId: memory.id, contextId: "reunion" }),
      ...(index < 5
        ? [
            relation({ nodeId: memory.id, contextId: "tom-ford" }),
            relation({ nodeId: memory.id, contextId: "perfumes" }),
          ]
        : []),
    ]);

    const relationships = deriveConceptRelationships({
      sourceConceptId: "tom-ford",
      contexts,
      nodes,
      relations,
      now,
    });
    const perfumes = relationships.find(
      (relationship) => relationship.targetConceptId === "perfumes",
    );
    const reunion = relationships.find(
      (relationship) => relationship.targetConceptId === "reunion",
    );

    expect(reunion).toBeDefined();
    expect((perfumes?.score ?? 0) > (reunion?.score ?? 0)).toBe(true);
  });

  it("excludes archived captures, archived concepts, duplicate aliases and removed relations", () => {
    const contexts = [
      context({ id: "vinema", name: "Vinema", aliases: ["Segundo cerebro"] }),
      context({ id: "alias-context", name: "Segundo cerebro" }),
      context({ id: "sync", name: "Sync" }),
      context({
        id: "archived",
        name: "Archivado",
        archivedAt: "2026-07-01T00:00:00.000Z",
      }),
      context({ id: "removed", name: "Removed" }),
    ];
    const nodes = [
      node({ id: "active", content: "Vinema y Sync activos." }),
      node({ id: "archived-node", status: "ARCHIVED" }),
    ];
    const relations = [
      relation({ nodeId: "active", contextId: "vinema" }),
      relation({ nodeId: "active", contextId: "alias-context" }),
      relation({ nodeId: "active", contextId: "sync" }),
      relation({ nodeId: "active", contextId: "archived" }),
      relation({ nodeId: "archived-node", contextId: "vinema" }),
      relation({ nodeId: "archived-node", contextId: "removed" }),
    ];

    const relationships = deriveConceptRelationships({
      sourceConceptId: "vinema",
      contexts,
      nodes,
      relations,
      now,
    });

    expect(relationships.map((relationship) => relationship.targetConceptId)).toEqual([
      "removed",
      "archived",
      "sync",
    ]);
  });

  it("selects at most three evidence memories with concrete excerpts", () => {
    const setup = relationshipSetup({
      sharedDates: [
        "2026-04-01T10:00:00.000Z",
        "2026-05-01T10:00:00.000Z",
        "2026-06-01T10:00:00.000Z",
        "2026-07-01T10:00:00.000Z",
      ],
    });

    expect(
      selectRelationshipEvidence({
        nodes: setup.nodes,
        contexts: setup.contexts,
        relations: setup.relations,
      }),
    ).toHaveLength(3);
    const [evidence] = selectRelationshipEvidence({
      nodes: setup.nodes,
      contexts: setup.contexts,
      relations: setup.relations,
    });

    expect(evidence).toMatchObject({
      nodeId: "memory-3",
      excerpt: "Tom Ford y Ombre Leather comparten memoria 3.",
    });
    expect(evidence?.identityLabels).toEqual(
      expect.arrayContaining(["Tom Ford", "Ombre Leather"]),
    );
  });

  it("reconstructs after restore and returns an empty network after reset", () => {
    const setup = relationshipSetup({
      sharedDates: ["2026-07-31T10:00:00.000Z"],
    });

    expect(
      deriveConceptRelationships({
        sourceConceptId: "tom-ford",
        ...setup,
        now,
      }),
    ).toHaveLength(1);
    expect(
      deriveConceptRelationships({
        sourceConceptId: "tom-ford",
        contexts: setup.contexts,
        nodes: [],
        relations: [],
        now,
      }),
    ).toEqual([]);
  });

  it("derives a graph neighborhood without positions or persisted edges", () => {
    const setup = relationshipSetup({
      sharedDates: [
        "2026-06-01T10:00:00.000Z",
        "2026-07-31T10:00:00.000Z",
      ],
    });
    setup.contexts.push(context({ id: "perfumes", name: "Perfumes" }));
    setup.relations.push(
      relation({ nodeId: "memory-1", contextId: "perfumes" }),
    );

    expect(
      deriveConceptGraphNeighborhood({
        currentConceptId: "tom-ford",
        ...setup,
        now,
      }),
    ).toMatchObject({
      center: { conceptId: "tom-ford", label: "Tom Ford", memoryCount: 2 },
      nodes: [
        { conceptId: "tom-ford" },
        { conceptId: "ombre-leather" },
        { conceptId: "perfumes" },
      ],
      edges: [
        {
          sourceId: "tom-ford",
          targetId: "ombre-leather",
          sharedMemoryCount: 2,
        },
        {
          sourceId: "tom-ford",
          targetId: "perfumes",
          sharedMemoryCount: 1,
        },
      ],
    });
  });

  it("handles 1,000 concepts and 10,000 relations without a persistent cache", () => {
    const contexts = [
      context({ id: "vinema", name: "Vinema" }),
      ...Array.from({ length: 1000 }, (_, index) =>
        context({ id: `concept-${index}`, name: `Concept ${index}` }),
      ),
    ];
    const nodes = Array.from({ length: 5000 }, (_, index) =>
      node({
        id: `memory-${index}`,
        content: `Vinema relationship memory ${index}`,
        updatedAt: `2026-07-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
      }),
    );
    const relations = nodes.flatMap((memory, index) => [
      relation({ nodeId: memory.id, contextId: "vinema" }),
      relation({ nodeId: memory.id, contextId: `concept-${index % 1000}` }),
    ]);

    const relationships = deriveConceptRelationships({
      sourceConceptId: "vinema",
      contexts,
      nodes,
      relations,
      now,
      limit: 8,
    });

    expect(relations).toHaveLength(10_000);
    expect(relationships).toHaveLength(8);
    expect(relationships[0]).toMatchObject({
      sharedMemoryCount: 5,
      strength: "MEDIUM",
    });
  });
});

function relationshipSetup({ sharedDates }: { sharedDates: string[] }) {
  const contexts = [
    context({ id: "tom-ford", name: "Tom Ford" }),
    context({ id: "ombre-leather", name: "Ombre Leather" }),
  ];
  const nodes = sharedDates.map((updatedAt, index) =>
    node({
      id: `memory-${index}`,
      content: `Tom Ford y Ombre Leather comparten memoria ${index}.`,
      updatedAt,
    }),
  );
  const relations = nodes.flatMap((memory) => [
    relation({ nodeId: memory.id, contextId: "tom-ford" }),
    relation({ nodeId: memory.id, contextId: "ombre-leather" }),
  ]);

  return { contexts, nodes, relations };
}

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
    id: `relation-${overrides.nodeId}-${overrides.contextId}`,
    workspaceId: "workspace-1",
    nodeId: "node",
    contextId: "context",
    relationType: "CONTEXT",
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}
