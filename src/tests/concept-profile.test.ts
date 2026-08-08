import { describe, expect, it } from "vitest";
import type { Context } from "@/domain/context/context";
import type { Node } from "@/domain/node/node";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import {
  deriveConceptActivity,
  deriveConceptProfile,
  deriveRepresentativeMemories,
} from "@/features/exploration/concept-profile";

const now = new Date("2026-08-01T12:00:00.000Z");

describe("concept profiles", () => {
  it("derives an empty profile without showing derived noise", () => {
    const profile = deriveConceptProfile({
      currentContextId: "tom-ford",
      contexts: [context({ id: "tom-ford", name: "Tom Ford", aliases: ["TOM FORD"] })],
      nodes: [],
      relations: [],
      now,
    });

    expect(profile).toMatchObject({
      concept: {
        canonicalLabel: "Tom Ford",
        aliases: ["TOM FORD"],
      },
      memoryCount: 0,
      firstSeenAt: null,
      lastSeenAt: null,
      relatedConcepts: [],
      representativeMemories: [],
      activity: {
        total: 0,
        last7Days: 0,
        last30Days: 0,
        monthlyBuckets: [],
      },
    });
  });

  it("derives a simple profile with one memory and no fabricated title", () => {
    const profile = deriveConceptProfile({
      currentContextId: "operational-core",
      contexts: [
        context({ id: "operational-core", name: "Operational Core", aliases: ["OC"] }),
      ],
      nodes: [
        node({
          id: "memory-1",
          content: "OC debe consolidar contratos pendientes.",
          updatedAt: "2026-07-31T10:00:00.000Z",
        }),
      ],
      relations: [
        relation({ nodeId: "memory-1", contextId: "operational-core" }),
      ],
      now,
    });

    expect(profile?.memoryCount).toBe(1);
    expect(profile?.representativeMemories).toHaveLength(1);
    expect(profile?.representativeMemories[0]).toMatchObject({
      nodeId: "memory-1",
      excerpt: "OC debe consolidar contratos pendientes.",
      identityLabels: ["Operational Core"],
    });
    expect(profile?.representativeMemories[0].excerpt).not.toContain("Sin título");
  });

  it("does not treat aliases as independent related concepts", () => {
    const profile = deriveConceptProfile({
      currentContextId: "tom-ford",
      contexts: [
        context({
          id: "tom-ford",
          name: "Tom Ford",
          aliases: ["TOM FORD", "Tom Ford Beauty"],
        }),
        context({ id: "alias-context", name: "TOM FORD" }),
        context({ id: "ombre-leather", name: "Ombre Leather" }),
      ],
      nodes: [
        node({
          id: "memory-1",
          content: "Tom Ford aparece con Ombre Leather.",
          updatedAt: "2026-07-31T10:00:00.000Z",
        }),
      ],
      relations: [
        relation({ nodeId: "memory-1", contextId: "tom-ford" }),
        relation({ nodeId: "memory-1", contextId: "alias-context" }),
        relation({ nodeId: "memory-1", contextId: "ombre-leather" }),
      ],
      now,
    });

    expect(profile?.relatedConcepts).toMatchObject([
      { conceptId: "ombre-leather", label: "Ombre Leather" },
    ]);
    expect(profile?.relatedConcepts.map((concept) => concept.conceptId)).not.toContain(
      "alias-context",
    );
  });

  it("derives related concepts, representative memories and temporal activity", () => {
    const contexts = [
      context({ id: "tom-ford", name: "Tom Ford", aliases: ["TOM FORD"] }),
      context({ id: "ombre-leather", name: "Ombre Leather" }),
      context({ id: "erba-pura", name: "Erba Pura" }),
      context({ id: "perfumes", name: "Perfumes" }),
      context({
        id: "archived",
        name: "Archivado",
        archivedAt: "2026-07-01T00:00:00.000Z",
      }),
    ];
    const nodes = [
      node({
        id: "old",
        content: "Tom Ford y Ombre Leather aparecen como referencia inicial.",
        updatedAt: "2026-06-01T10:00:00.000Z",
      }),
      node({
        id: "middle",
        content: "Comparar Tom Ford con Erba Pura para perfumes.",
        updatedAt: "2026-07-15T10:00:00.000Z",
      }),
      node({
        id: "recent",
        content: "Tom Ford vuelve a aparecer junto a Ombre Leather.",
        updatedAt: "2026-07-31T10:00:00.000Z",
      }),
      node({
        id: "archived-node",
        content: "Tom Ford archivado no debe contar.",
        status: "ARCHIVED",
        updatedAt: "2026-07-30T10:00:00.000Z",
      }),
    ];
    const relations = [
      relation({ nodeId: "old", contextId: "tom-ford" }),
      relation({ nodeId: "old", contextId: "ombre-leather" }),
      relation({ nodeId: "middle", contextId: "tom-ford" }),
      relation({ nodeId: "middle", contextId: "erba-pura" }),
      relation({ nodeId: "middle", contextId: "perfumes" }),
      relation({ nodeId: "recent", contextId: "tom-ford" }),
      relation({ nodeId: "recent", contextId: "ombre-leather" }),
      relation({ nodeId: "recent", contextId: "archived" }),
      relation({ nodeId: "archived-node", contextId: "tom-ford" }),
      relation({ nodeId: "archived-node", contextId: "perfumes" }),
    ];

    const profile = deriveConceptProfile({
      currentContextId: "tom-ford",
      contexts,
      nodes,
      relations,
      now,
    });

    expect(profile?.memoryCount).toBe(4);
    expect(profile?.firstSeenAt?.toISOString()).toBe("2026-06-01T10:00:00.000Z");
    expect(profile?.lastSeenAt?.toISOString()).toBe("2026-07-31T10:00:00.000Z");
    expect(profile?.activity).toMatchObject({
      total: 4,
      last7Days: 2,
      last30Days: 3,
      monthlyBuckets: [
        { month: "2026-06", count: 1 },
        { month: "2026-07", count: 3 },
      ],
    });
    expect(profile?.relatedConcepts).toMatchObject([
      {
        conceptId: "ombre-leather",
        label: "Ombre Leather",
        sharedMemoryCount: 2,
      },
      {
        conceptId: "perfumes",
        label: "Perfumes",
        sharedMemoryCount: 2,
      },
      {
        conceptId: "archived",
        label: "Archivado",
        sharedMemoryCount: 1,
      },
      {
        conceptId: "erba-pura",
        label: "Erba Pura",
        sharedMemoryCount: 1,
      },
    ]);
    expect(profile?.representativeMemories.map((memory) => memory.nodeId)).toContain(
      "recent",
    );
    expect(profile?.representativeMemories.map((memory) => memory.nodeId)).toContain(
      "old",
    );
  });

  it("deduplicates very similar representative memories", () => {
    const memories = [
      node({ id: "a", content: "Mitcom seguimiento contrato", updatedAt: "2026-07-01T00:00:00.000Z" }),
      node({ id: "b", content: "Mitcom seguimiento contrato", updatedAt: "2026-07-02T00:00:00.000Z" }),
      node({ id: "c", content: "Mitcom cierre comercial", updatedAt: "2026-07-03T00:00:00.000Z" }),
    ];

    expect(
      deriveRepresentativeMemories({
        currentContextId: "mitcom",
        contexts: [context({ id: "mitcom", name: "Mitcom" })],
        relations: memories.map((memory) =>
          relation({ nodeId: memory.id, contextId: "mitcom" }),
        ),
        memories,
        limit: 5,
      }).map((memory) => memory.excerpt),
    ).toEqual(["Mitcom cierre comercial", "Mitcom seguimiento contrato"]);
  });

  it("handles a large derived dataset without persistent caches", () => {
    const nodes = Array.from({ length: 1000 }, (_, index) =>
      node({
        id: `memory-${index}`,
        content: `Vinema sync memory ${index}`,
        updatedAt: `2026-07-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
      }),
    );
    const relations = nodes.flatMap((memory, index) => [
      relation({ nodeId: memory.id, contextId: "vinema" }),
      relation({
        nodeId: memory.id,
        contextId: index % 2 === 0 ? "sync" : "railway",
      }),
    ]);

    const profile = deriveConceptProfile({
      currentContextId: "vinema",
      contexts: [
        context({ id: "vinema", name: "Vinema" }),
        context({ id: "sync", name: "Sync" }),
        context({ id: "railway", name: "Railway" }),
      ],
      nodes,
      relations,
      now,
    });

    expect(profile?.memoryCount).toBe(1000);
    expect(profile?.representativeMemories).toHaveLength(5);
    expect(profile?.relatedConcepts).toMatchObject([
      { conceptId: "railway", sharedMemoryCount: 500 },
      { conceptId: "sync", sharedMemoryCount: 500 },
    ]);
  });

  it("handles 10,000 simulated relations without persistent profile storage", () => {
    const nodes = Array.from({ length: 5000 }, (_, index) =>
      node({
        id: `memory-${index}`,
        content: `Mina Andes Norte operational memory ${index}`,
        updatedAt: `2026-07-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
      }),
    );
    const relations = nodes.flatMap((memory, index) => [
      relation({ nodeId: memory.id, contextId: "mina-andes-norte" }),
      relation({
        nodeId: memory.id,
        contextId: index % 3 === 0 ? "mitcom" : "operational-core",
      }),
    ]);

    const profile = deriveConceptProfile({
      currentContextId: "mina-andes-norte",
      contexts: [
        context({ id: "mina-andes-norte", name: "Mina Andes Norte" }),
        context({ id: "mitcom", name: "Mitcom" }),
        context({ id: "operational-core", name: "Operational Core" }),
      ],
      nodes,
      relations,
      now,
    });

    expect(profile?.memoryCount).toBe(5000);
    expect(profile?.representativeMemories).toHaveLength(5);
    expect(profile?.relatedConcepts).toMatchObject([
      { conceptId: "mitcom", sharedMemoryCount: 1667 },
      { conceptId: "operational-core", sharedMemoryCount: 3333 },
    ]);
  });

  it("reconstructs after restore and becomes empty after reset because it is derived", () => {
    const contexts = [
      context({ id: "vinema", name: "Vinema", aliases: ["Segundo cerebro"] }),
      context({ id: "sync", name: "Sync" }),
    ];
    const restoredNodes = [
      node({
        id: "restored-1",
        content: "Vinema recupera asociaciones despues de restaurar respaldo.",
        updatedAt: "2026-07-30T10:00:00.000Z",
      }),
    ];
    const restoredRelations = [
      relation({ nodeId: "restored-1", contextId: "vinema" }),
      relation({ nodeId: "restored-1", contextId: "sync" }),
    ];

    const restoredProfile = deriveConceptProfile({
      currentContextId: "vinema",
      contexts,
      nodes: restoredNodes,
      relations: restoredRelations,
      now,
    });
    const resetProfile = deriveConceptProfile({
      currentContextId: "vinema",
      contexts,
      nodes: [],
      relations: [],
      now,
    });

    expect(restoredProfile).toMatchObject({
      memoryCount: 1,
      concept: {
        canonicalLabel: "Vinema",
        aliases: ["Segundo cerebro"],
      },
      relatedConcepts: [{ conceptId: "sync" }],
    });
    expect(resetProfile).toMatchObject({
      memoryCount: 0,
      relatedConcepts: [],
      representativeMemories: [],
      activity: { total: 0, monthlyBuckets: [] },
    });
  });

  it("summarizes recent activity windows", () => {
    expect(
      deriveConceptActivity({
        now,
        memories: [
          node({ id: "a", updatedAt: "2026-07-31T00:00:00.000Z" }),
          node({ id: "b", updatedAt: "2026-07-10T00:00:00.000Z" }),
          node({ id: "c", updatedAt: "2026-06-01T00:00:00.000Z" }),
        ],
      }),
    ).toMatchObject({
      total: 3,
      last7Days: 1,
      last30Days: 2,
      monthlyBuckets: [
        { month: "2026-06", count: 1 },
        { month: "2026-07", count: 2 },
      ],
    });
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
