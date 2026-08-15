import { describe, expect, it } from "vitest";
import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import {
  deriveBehavioralPatterns,
  type BehavioralPatternKind,
} from "@/features/cognition/behavioral-engine/behavioral-engine";

const now = new Date("2026-08-01T12:00:00.000Z");

describe("Behavioral Engine v1", () => {
  it("detects recurrent pairs from repeated accepted co-occurrence", () => {
    const setup = setupMemory({
      concepts: ["mitcom", "tracking"],
      dates: [
        "2026-04-01T10:00:00.000Z",
        "2026-06-01T10:00:00.000Z",
        "2026-07-20T10:00:00.000Z",
      ],
    });

    expect(kindIds(deriveBehavioralPatterns({ ...setup, now }))).toContain(
      "RECURRENT_PAIR:mitcom+tracking",
    );
  });

  it("detects emerging relationships with recent growth", () => {
    const setup = setupMemory({
      concepts: ["railway", "vinema"],
      dates: [
        "2026-04-01T10:00:00.000Z",
        "2026-07-10T10:00:00.000Z",
        "2026-07-20T10:00:00.000Z",
      ],
    });

    expect(kindIds(deriveBehavioralPatterns({ ...setup, now }))).toContain(
      "EMERGING_RELATIONSHIP:railway+vinema",
    );
  });

  it("detects declining relationships with previous activity and recent silence", () => {
    const setup = setupMemory({
      concepts: ["mineria", "operational-core"],
      dates: [
        "2026-04-01T10:00:00.000Z",
        "2026-04-20T10:00:00.000Z",
        "2026-05-15T10:00:00.000Z",
      ],
    });

    expect(kindIds(deriveBehavioralPatterns({ ...setup, now }))).toContain(
      "DECLINING_RELATIONSHIP:mineria+operational-core",
    );
  });

  it("detects stable relationships distributed across time", () => {
    const setup = setupMemory({
      concepts: ["mitcom", "tracking"],
      dates: [
        "2026-03-01T10:00:00.000Z",
        "2026-04-10T10:00:00.000Z",
        "2026-06-20T10:00:00.000Z",
        "2026-07-20T10:00:00.000Z",
      ],
    });

    expect(kindIds(deriveBehavioralPatterns({ ...setup, now }))).toContain(
      "STABLE_RELATIONSHIP:mitcom+tracking",
    );
  });

  it("detects recurring clusters without graph clustering", () => {
    const setup = setupMemory({
      concepts: ["barrio-civico", "mitcom", "servidor", "tracking"],
      dates: ["2026-07-01T10:00:00.000Z", "2026-07-20T10:00:00.000Z"],
    });
    const patterns = deriveBehavioralPatterns({ ...setup, now });

    expect(kindIds(patterns)).toContain(
      "RECURRING_CLUSTER:barrio-civico+mitcom+servidor+tracking",
    );
    expect(
      patterns.find(
        (pattern) =>
          pattern.kind === "RECURRING_CLUSTER" &&
          pattern.conceptIds.includes("barrio-civico"),
      )?.conceptIds.length,
    ).toBeLessThanOrEqual(5);
  });

  it("does not create patterns from a single appearance", () => {
    const setup = setupMemory({
      concepts: ["mitcom", "tracking"],
      dates: ["2026-07-20T10:00:00.000Z"],
    });

    expect(deriveBehavioralPatterns({ ...setup, now })).toEqual([]);
  });

  it("does not duplicate aliases as independent concepts", () => {
    const contexts = [
      context({ id: "vinema", name: "Vinema", aliases: ["Segundo cerebro"] }),
      context({ id: "alias", name: "Segundo cerebro" }),
      context({ id: "railway", name: "Railway" }),
    ];
    const nodes = dates([
      "2026-04-01T10:00:00.000Z",
      "2026-07-10T10:00:00.000Z",
      "2026-07-20T10:00:00.000Z",
    ]);
    const relations = nodes.flatMap((memory) => [
      relation({ nodeId: memory.id, contextId: "vinema" }),
      relation({ nodeId: memory.id, contextId: "alias" }),
      relation({ nodeId: memory.id, contextId: "railway" }),
    ]);

    const patterns = deriveBehavioralPatterns({ contexts, nodes, relations, now });

    expect(kindIds(patterns)).toContain("RECURRENT_PAIR:railway+vinema");
    expect(patterns.some((pattern) => pattern.conceptIds.includes("alias"))).toBe(false);
  });

  it("excludes forgotten capture tombstones and discarded associations while retaining legacy archived concepts", () => {
    const contexts = [
      context({ id: "mitcom", name: "Mitcom" }),
      context({ id: "tracking", name: "Tracking" }),
      context({ id: "archived", name: "Archivado", archivedAt: "2026-01-01T00:00:00.000Z" }),
    ];
    const nodes = [
      ...dates([
        "2026-04-01T10:00:00.000Z",
        "2026-06-01T10:00:00.000Z",
        "2026-07-20T10:00:00.000Z",
      ]),
      node({
        id: "legacy-status-node",
        status: "ARCHIVED",
        updatedAt: "2026-07-21T10:00:00.000Z",
      }),
      node({
        id: "forgotten-node",
        archivedAt: "2026-07-22T10:00:00.000Z",
        updatedAt: "2026-07-22T10:00:00.000Z",
      }),
    ];
    const relations = [
      ...nodes.flatMap((memory) => [
        relation({ nodeId: memory.id, contextId: "mitcom" }),
        relation({ nodeId: memory.id, contextId: "tracking" }),
        relation({ nodeId: memory.id, contextId: "archived" }),
      ]),
      relation({
        nodeId: "memory-0",
        contextId: "discarded",
        relationType: "CAPTURE_ASSOCIATION",
      }),
    ];

    const patterns = deriveBehavioralPatterns({ contexts, nodes, relations, now });

    expect(kindIds(patterns)).toContain("RECURRENT_PAIR:mitcom+tracking");
    expect(patterns.some((pattern) => pattern.conceptIds.includes("archived"))).toBe(true);
    expect(
      patterns.some((pattern) => pattern.evidenceNodeIds.includes("forgotten-node")),
    ).toBe(false);
    expect(patterns.some((pattern) => pattern.conceptIds.includes("discarded"))).toBe(false);
  });

  it("uses injected now for deterministic temporal windows", () => {
    const setup = setupMemory({
      concepts: ["railway", "vinema"],
      dates: [
        "2026-04-01T10:00:00.000Z",
        "2026-07-10T10:00:00.000Z",
        "2026-07-20T10:00:00.000Z",
      ],
    });

    expect(
      kindIds(
        deriveBehavioralPatterns({
          ...setup,
          now: new Date("2026-08-01T12:00:00.000Z"),
        }),
      ),
    ).toContain("EMERGING_RELATIONSHIP:railway+vinema");
    expect(
      kindIds(
        deriveBehavioralPatterns({
          ...setup,
          now: new Date("2027-01-01T12:00:00.000Z"),
        }),
      ),
    ).not.toContain("EMERGING_RELATIONSHIP:railway+vinema");
  });

  it("returns stable ids and deterministic order", () => {
    const setup = setupMemory({
      concepts: ["mitcom", "tracking"],
      dates: [
        "2026-03-01T10:00:00.000Z",
        "2026-04-10T10:00:00.000Z",
        "2026-06-20T10:00:00.000Z",
        "2026-07-20T10:00:00.000Z",
      ],
    });
    const first = deriveBehavioralPatterns({ ...setup, now });
    const second = deriveBehavioralPatterns({
      contexts: [...setup.contexts].reverse(),
      nodes: [...setup.nodes].reverse(),
      relations: [...setup.relations].reverse(),
      now,
    });

    expect(first.map((pattern) => pattern.id)).toEqual(second.map((pattern) => pattern.id));
    expect(first[0].id).toBe("behavior:recurrent_pair:mitcom+tracking");
  });

  it("reconstructs from restored data and disappears after reset", () => {
    const restored = setupMemory({
      concepts: ["mitcom", "tracking"],
      dates: [
        "2026-04-01T10:00:00.000Z",
        "2026-06-01T10:00:00.000Z",
        "2026-07-20T10:00:00.000Z",
      ],
    });

    expect(deriveBehavioralPatterns({ ...restored, now })).not.toEqual([]);
    expect(
      deriveBehavioralPatterns({
        contexts: restored.contexts,
        relations: [],
        nodes: [],
        now,
      }),
    ).toEqual([]);
  });

  it("handles a large deterministic dataset within a reasonable budget", () => {
    const contexts = [
      context({ id: "mitcom", name: "Mitcom" }),
      context({ id: "tracking", name: "Tracking" }),
      context({ id: "servidor", name: "Servidor" }),
    ];
    const nodes = Array.from({ length: 2_000 }, (_, index) =>
      node({
        id: `memory-${index}`,
        updatedAt: `2026-${String((index % 7) + 1).padStart(2, "0")}-01T10:00:00.000Z`,
      }),
    );
    const relations = nodes.flatMap((memory) => [
      relation({ nodeId: memory.id, contextId: "mitcom" }),
      relation({ nodeId: memory.id, contextId: "tracking" }),
      relation({ nodeId: memory.id, contextId: "servidor" }),
    ]);
    const startedAt = performance.now();
    const patterns = deriveBehavioralPatterns({ contexts, nodes, relations, now });

    expect(patterns.length).toBeGreaterThan(0);
    expect(performance.now() - startedAt).toBeLessThan(350);
  });
});

function setupMemory({
  concepts,
  dates: memoryDates,
}: {
  concepts: string[];
  dates: string[];
}) {
  const contexts = concepts.map((conceptId) =>
    context({ id: conceptId, name: titleize(conceptId) }),
  );
  const nodes = dates(memoryDates);
  const relations = nodes.flatMap((memory) =>
    concepts.map((conceptId) => relation({ nodeId: memory.id, contextId: conceptId })),
  );

  return { contexts, nodes, relations };
}

function kindIds(patterns: Array<{ kind: BehavioralPatternKind; conceptIds: string[] }>) {
  return patterns.map((pattern) => `${pattern.kind}:${pattern.conceptIds.join("+")}`);
}

function dates(values: string[]) {
  return values.map((date, index) =>
    node({
      id: `memory-${index}`,
      updatedAt: date,
      content: `Memoria ${index}`,
    }),
  );
}

function titleize(value: string) {
  return value
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
