import { describe, expect, it } from "vitest";
import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import {
  deriveMemoryEvolutionSignals,
  detectContextShift,
  type MemoryEvolutionKind,
} from "@/features/cognition/memory-evolution";

const now = new Date("2026-08-01T12:00:00.000Z");

describe("Memory Evolution v1", () => {
  it("detects a new concept from recent first appearance", () => {
    const setup = setupConcept({
      conceptId: "vinema",
      dates: ["2026-07-20T10:00:00.000Z"],
    });

    expect(kindIds(deriveMemoryEvolutionSignals({ ...setup, now }))).toContain(
      "NEW_CONCEPT:vinema",
    );
  });

  it("detects a growing concept from recent increase", () => {
    const setup = setupConcept({
      conceptId: "vinema",
      dates: [
        "2026-06-15T10:00:00.000Z",
        "2026-07-10T10:00:00.000Z",
        "2026-07-20T10:00:00.000Z",
      ],
    });

    expect(kindIds(deriveMemoryEvolutionSignals({ ...setup, now }))).toContain(
      "GROWING_CONCEPT:vinema",
    );
  });

  it("detects a stable concept distributed through time", () => {
    const setup = setupConcept({
      conceptId: "operational-core",
      dates: [
        "2026-04-10T10:00:00.000Z",
        "2026-05-10T10:00:00.000Z",
        "2026-06-20T10:00:00.000Z",
        "2026-07-20T10:00:00.000Z",
      ],
    });

    expect(kindIds(deriveMemoryEvolutionSignals({ ...setup, now }))).toContain(
      "STABLE_CONCEPT:operational-core",
    );
  });

  it("detects a declining concept before dormancy", () => {
    const setup = setupConcept({
      conceptId: "mineria",
      dates: [
        "2026-05-20T10:00:00.000Z",
        "2026-06-10T10:00:00.000Z",
        "2026-06-20T10:00:00.000Z",
      ],
    });

    expect(kindIds(deriveMemoryEvolutionSignals({ ...setup, now }))).toContain(
      "DECLINING_CONCEPT:mineria",
    );
  });

  it("detects a dormant concept with sustained old activity", () => {
    const setup = setupConcept({
      conceptId: "contratos",
      dates: [
        "2026-02-10T10:00:00.000Z",
        "2026-03-10T10:00:00.000Z",
        "2026-04-10T10:00:00.000Z",
      ],
    });

    expect(kindIds(deriveMemoryEvolutionSignals({ ...setup, now }))).toContain(
      "DORMANT_CONCEPT:contratos",
    );
  });

  it("detects a revived concept after a long inactive period", () => {
    const setup = setupConcept({
      conceptId: "tracking",
      dates: [
        "2026-02-10T10:00:00.000Z",
        "2026-03-10T10:00:00.000Z",
        "2026-07-20T10:00:00.000Z",
      ],
    });

    expect(kindIds(deriveMemoryEvolutionSignals({ ...setup, now }))).toContain(
      "REVIVED_CONCEPT:tracking",
    );
  });

  it("detects context shift from changed top connections", () => {
    const contexts = [
      context({ id: "operational-core", name: "Operational Core" }),
      context({ id: "mineria", name: "Minería MVP" }),
      context({ id: "contratos", name: "Contratos" }),
      context({ id: "vinema", name: "Vinema" }),
      context({ id: "motor-cognitivo", name: "Motor Cognitivo" }),
    ];
    const nodes = [
      node({ id: "old-a", updatedAt: "2026-04-10T10:00:00.000Z" }),
      node({ id: "old-b", updatedAt: "2026-05-10T10:00:00.000Z" }),
      node({ id: "recent-a", updatedAt: "2026-07-15T10:00:00.000Z" }),
      node({ id: "recent-b", updatedAt: "2026-07-20T10:00:00.000Z" }),
    ];
    const relations = [
      ...relationsFor("old-a", ["operational-core", "mineria", "contratos"]),
      ...relationsFor("old-b", ["operational-core", "mineria", "contratos"]),
      ...relationsFor("recent-a", ["operational-core", "vinema", "motor-cognitivo"]),
      ...relationsFor("recent-b", ["operational-core", "vinema", "motor-cognitivo"]),
    ];

    const signals = deriveMemoryEvolutionSignals({ contexts, nodes, relations, now });

    expect(kindIds(signals)).toContain("SHIFTING_CONTEXT:operational-core");
    expect(
      signals.find((signal) => signal.kind === "SHIFTING_CONTEXT")?.metrics,
    ).toMatchObject({
      recentTopConnections: ["motor-cognitivo", "vinema"],
      historicalTopConnections: ["contratos", "mineria"],
    });
  });

  it("does not mark one capture as stable or a new concept as dormant", () => {
    const setup = setupConcept({
      conceptId: "vinema",
      dates: ["2026-07-20T10:00:00.000Z"],
    });
    const ids = kindIds(deriveMemoryEvolutionSignals({ ...setup, now }));

    expect(ids).toContain("NEW_CONCEPT:vinema");
    expect(ids).not.toContain("STABLE_CONCEPT:vinema");
    expect(ids).not.toContain("DORMANT_CONCEPT:vinema");
  });

  it("does not duplicate aliases as separate concepts", () => {
    const contexts = [
      context({ id: "vinema", name: "Vinema", aliases: ["Segundo cerebro"] }),
      context({ id: "alias", name: "Segundo cerebro" }),
    ];
    const nodes = [
      node({ id: "a", updatedAt: "2026-07-10T10:00:00.000Z" }),
      node({ id: "b", updatedAt: "2026-07-20T10:00:00.000Z" }),
    ];
    const relations = nodes.flatMap((memory) => [
      relation({ nodeId: memory.id, contextId: "vinema" }),
      relation({ nodeId: memory.id, contextId: "alias" }),
    ]);
    const signals = deriveMemoryEvolutionSignals({ contexts, nodes, relations, now });

    expect(signals.some((signal) => signal.conceptId === "vinema")).toBe(true);
    expect(signals.some((signal) => signal.conceptId === "alias")).toBe(false);
  });

  it("excludes archived captures, deleted captures, archived concepts and unaccepted associations", () => {
    const contexts = [
      context({ id: "vinema", name: "Vinema" }),
      context({ id: "archived", name: "Archivado", archivedAt: "2026-01-01T00:00:00.000Z" }),
    ];
    const nodes = [
      node({ id: "active", updatedAt: "2026-07-20T10:00:00.000Z" }),
      node({ id: "archived-node", status: "ARCHIVED", updatedAt: "2026-07-20T10:00:00.000Z" }),
      node({ id: "deleted-node", deletedAt: "2026-07-20T10:00:00.000Z" }),
    ];
    const relations = [
      relation({ nodeId: "active", contextId: "vinema" }),
      relation({ nodeId: "archived-node", contextId: "vinema" }),
      relation({ nodeId: "deleted-node", contextId: "vinema" }),
      relation({ nodeId: "active", contextId: "archived" }),
      relation({
        nodeId: "active",
        contextId: "discarded",
        relationType: "CAPTURE_ASSOCIATION",
      }),
    ];
    const signals = deriveMemoryEvolutionSignals({ contexts, nodes, relations, now });

    expect(signals).toHaveLength(2);
    expect(signals[0].conceptId).toBe("vinema");
  });

  it("rebuilds from restored timestamps and disappears after reset", () => {
    const restored = setupConcept({
      conceptId: "tracking",
      dates: [
        "2026-02-10T10:00:00.000Z",
        "2026-03-10T10:00:00.000Z",
        "2026-07-20T10:00:00.000Z",
      ],
    });

    expect(deriveMemoryEvolutionSignals({ ...restored, now })).not.toEqual([]);
    expect(
      deriveMemoryEvolutionSignals({
        contexts: restored.contexts,
        relations: [],
        nodes: [],
        now,
      }),
    ).toEqual([]);
  });

  it("uses injected now for deterministic windows", () => {
    const setup = setupConcept({
      conceptId: "vinema",
      dates: [
        "2026-06-15T10:00:00.000Z",
        "2026-07-10T10:00:00.000Z",
        "2026-07-20T10:00:00.000Z",
      ],
    });

    expect(
      kindIds(deriveMemoryEvolutionSignals({ ...setup, now })),
    ).toContain("GROWING_CONCEPT:vinema");
    expect(
      kindIds(
        deriveMemoryEvolutionSignals({
          ...setup,
          now: new Date("2026-10-01T12:00:00.000Z"),
        }),
      ),
    ).not.toContain("GROWING_CONCEPT:vinema");
  });

  it("returns stable ids and deterministic ordering", () => {
    const setup = setupConcept({
      conceptId: "vinema",
      dates: [
        "2026-06-15T10:00:00.000Z",
        "2026-07-10T10:00:00.000Z",
        "2026-07-20T10:00:00.000Z",
      ],
    });
    const first = deriveMemoryEvolutionSignals({ ...setup, now });
    const second = deriveMemoryEvolutionSignals({
      contexts: [...setup.contexts].reverse(),
      nodes: [...setup.nodes].reverse(),
      relations: [...setup.relations].reverse(),
      now,
    });

    expect(first.map((signal) => signal.id)).toEqual(second.map((signal) => signal.id));
    expect(first.map((signal) => signal.id)).toContain(
      "evolution:growing_concept:vinema",
    );
  });

  it("detects context shift only with enough changed connections", () => {
    expect(detectContextShift(["a", "b"], ["c", "d"])).toBe(true);
    expect(detectContextShift(["a", "b"], ["a", "d"])).toBe(false);
    expect(detectContextShift(["a"], ["c", "d"])).toBe(false);
  });

  it("handles a large deterministic dataset", () => {
    const contexts = [
      context({ id: "vinema", name: "Vinema" }),
      context({ id: "sync", name: "Sync" }),
    ];
    const nodes = Array.from({ length: 2_000 }, (_, index) =>
      node({
        id: `memory-${index}`,
        updatedAt: `2026-${String((index % 7) + 1).padStart(2, "0")}-10T10:00:00.000Z`,
      }),
    );
    const relations = nodes.flatMap((memory) => [
      relation({ nodeId: memory.id, contextId: "vinema" }),
      relation({ nodeId: memory.id, contextId: "sync" }),
    ]);
    const startedAt = performance.now();
    const signals = deriveMemoryEvolutionSignals({ contexts, nodes, relations, now });

    expect(signals.length).toBeGreaterThan(0);
    expect(performance.now() - startedAt).toBeLessThan(400);
  });
});

function setupConcept({
  conceptId,
  dates,
}: {
  conceptId: string;
  dates: string[];
}) {
  const contexts = [context({ id: conceptId, name: labelFor(conceptId) })];
  const nodes = dates.map((date, index) =>
    node({ id: `memory-${index}`, updatedAt: date }),
  );
  const relations = nodes.map((memory) =>
    relation({ nodeId: memory.id, contextId: conceptId }),
  );

  return { contexts, nodes, relations };
}

function kindIds(signals: Array<{ kind: MemoryEvolutionKind; conceptId: string }>) {
  return signals.map((signal) => `${signal.kind}:${signal.conceptId}`);
}

function relationsFor(nodeId: string, conceptIds: string[]) {
  return conceptIds.map((contextId) => relation({ nodeId, contextId }));
}

function labelFor(id: string) {
  return id
    .split("-")
    .map((part) => part.charAt(0).toLocaleUpperCase("es") + part.slice(1))
    .join(" ");
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
    contentUpdatedAt: overrides.updatedAt ?? "2026-07-31T10:00:00.000Z",
    archivedAt: null,
    restoredAt: null,
    updatedAt: "2026-07-31T10:00:00.000Z",
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
