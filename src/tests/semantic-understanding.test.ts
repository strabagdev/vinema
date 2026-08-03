import { describe, expect, it } from "vitest";
import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import {
  deriveSemanticStatements,
  detectExplicitSemanticStatements,
} from "@/features/cognition/semantic-understanding";
import { detectSemanticContradictions } from "@/features/cognition/semantic-understanding/semantic-statements";

const now = new Date("2026-08-01T12:00:00.000Z");

describe("Semantic Understanding v1", () => {
  it.each([
    ["IS_A", "Vinema es un segundo cerebro.", "vinema", "segundo-cerebro"],
    ["PART_OF", "Project Core forma parte de Operational Core.", "project-core", "operational-core"],
    ["LOCATED_IN", "MITAT se realizará en Barrio Cívico.", "mitat", "barrio-civico"],
    ["USES", "Vinema usa IndexedDB.", "vinema", "indexeddb"],
    ["DEPENDS_ON", "Operational Core depende de PostgreSQL.", "operational-core", "postgresql"],
    ["PRODUCES", "Tom Ford produce Ombre Leather.", "tom-ford", "ombre-leather"],
    ["CREATES", "Vinema implementa Behavioral Engine.", "vinema", "behavioral-engine"],
    ["WORKS_AT", "Danny trabaja en Züblin.", "danny", "zublin"],
    ["WORKS_WITH", "Mitcom trabaja con Codelco.", "mitcom", "codelco"],
    ["RESPONSIBLE_FOR", "José está a cargo de enrolamiento.", "jose", "enrolamiento"],
  ])("detects %s from explicit text", (relation, content, sourceId, targetId) => {
    const setup = statementSetup(content, [sourceId, targetId]);
    const statements = deriveSemanticStatements({ ...setup, now });

    expect(statements).toMatchObject([
      {
        sourceConceptId: sourceId,
        relation,
        targetConceptId: targetId,
        evidenceLevel: "EXPLICIT",
        confidence: "MEDIUM",
      },
    ]);
  });

  it("preserves source and target order", () => {
    const setup = statementSetup("Tom Ford produce Ombre Leather.", [
      "tom-ford",
      "ombre-leather",
    ]);
    const [statement] = deriveSemanticStatements({ ...setup, now });

    expect(statement.sourceLabel).toBe("Tom Ford");
    expect(statement.targetLabel).toBe("Ombre Leather");
  });

  it("consolidates aliases under canonical concepts", () => {
    const contexts = [
      context({
        id: "operational-core",
        name: "Operational Core",
        aliases: ["OC"],
      }),
      context({
        id: "postgresql",
        name: "PostgreSQL",
        aliases: ["Postgres"],
      }),
    ];
    const nodes = [
      node({ id: "a", content: "OC usa PostgreSQL." }),
      node({ id: "b", content: "Operational Core utiliza Postgres." }),
    ];
    const relations = nodes.flatMap((memory) => [
      relation({ nodeId: memory.id, contextId: "operational-core" }),
      relation({ nodeId: memory.id, contextId: "postgresql" }),
    ]);
    const [statement] = deriveSemanticStatements({ contexts, nodes, relations, now });

    expect(statement).toMatchObject({
      sourceConceptId: "operational-core",
      sourceLabel: "Operational Core",
      relation: "USES",
      targetConceptId: "postgresql",
      targetLabel: "PostgreSQL",
      confidence: "HIGH",
      evidenceLevel: "REPEATED_EXPLICIT",
    });
    expect(statement.evidence).toHaveLength(2);
  });

  it("does not convert contextual association into a verb", () => {
    const setup = statementSetup("Estoy pensando en Tom Ford y Ombre Leather.", [
      "tom-ford",
      "ombre-leather",
    ]);
    const statements = deriveSemanticStatements({
      contexts: setup.contexts,
      nodes: [
        node({ id: "a", content: "Estoy pensando en Tom Ford y Ombre Leather." }),
        node({ id: "b", content: "Tom Ford y Ombre Leather en la lista." }),
        node({ id: "c", content: "Revisar Tom Ford con Ombre Leather." }),
      ],
      relations: ["a", "b", "c"].flatMap((nodeId) => [
        relation({ nodeId, contextId: "tom-ford" }),
        relation({ nodeId, contextId: "ombre-leather" }),
      ]),
      now,
    });

    expect(statements.some((statement) => statement.relation === "PRODUCES")).toBe(false);
    expect(statements).toMatchObject([{ relation: "RELATED_TO", confidence: "LOW" }]);
  });

  it("skips negation, questions and uncertainty as positive assertions", () => {
    for (const content of [
      "Tom Ford no produce Erba Pura.",
      "¿Vinema usa PostgreSQL?",
      "Quizás Operational Core depende de Railway.",
      "No sé si Vinema usa PostgreSQL.",
    ]) {
      const concepts = conceptsForText(content);
      const setup = statementSetup(content, concepts);

      expect(deriveSemanticStatements({ ...setup, now })).toEqual([]);
    }
  });

  it("detects direct contradictions without deciding truth", () => {
    const contexts = [
      context({ id: "vinema", name: "Vinema" }),
      context({ id: "indexeddb", name: "IndexedDB" }),
    ];
    const nodes = [
      node({ id: "positive", content: "Vinema usa IndexedDB." }),
      node({ id: "negative", content: "Vinema no usa IndexedDB." }),
    ];
    const relations = nodes.flatMap((memory) => [
      relation({ nodeId: memory.id, contextId: "vinema" }),
      relation({ nodeId: memory.id, contextId: "indexeddb" }),
    ]);
    const candidates = detectExplicitSemanticStatements({ contexts, nodes, relations });
    const [statement] = deriveSemanticStatements({ contexts, nodes, relations, now });

    expect(Array.from(detectSemanticContradictions(candidates))).toEqual([
      "semantic:vinema:uses:indexeddb",
    ]);
    expect(statement.hasContradictoryEvidence).toBe(true);
  });

  it("excludes archived captures, archived concepts and unaccepted associations", () => {
    const contexts = [
      context({ id: "vinema", name: "Vinema" }),
      context({ id: "indexeddb", name: "IndexedDB" }),
      context({ id: "archived", name: "Archivado", archivedAt: "2026-01-01T00:00:00.000Z" }),
    ];
    const nodes = [
      node({ id: "active", content: "Vinema usa IndexedDB." }),
      node({ id: "archived-node", content: "Vinema usa Archivado.", status: "ARCHIVED" }),
    ];
    const relations = [
      relation({ nodeId: "active", contextId: "vinema" }),
      relation({ nodeId: "active", contextId: "indexeddb" }),
      relation({
        nodeId: "active",
        contextId: "archived",
        relationType: "CAPTURE_ASSOCIATION",
      }),
      relation({ nodeId: "archived-node", contextId: "vinema" }),
      relation({ nodeId: "archived-node", contextId: "indexeddb" }),
    ];
    const statements = deriveSemanticStatements({ contexts, nodes, relations, now });

    expect(statements).toHaveLength(1);
    expect(statements[0].targetConceptId).toBe("indexeddb");
  });

  it("keeps stable ids and deterministic order", () => {
    const contexts = [
      context({ id: "vinema", name: "Vinema" }),
      context({ id: "indexeddb", name: "IndexedDB" }),
      context({ id: "railway", name: "Railway" }),
    ];
    const nodes = [
      node({ id: "a", content: "Vinema usa IndexedDB." }),
      node({ id: "b", content: "Vinema usa Railway." }),
    ];
    const relations = nodes.flatMap((memory) => [
      relation({ nodeId: memory.id, contextId: "vinema" }),
      relation({
        nodeId: memory.id,
        contextId: memory.id === "a" ? "indexeddb" : "railway",
      }),
    ]);
    const first = deriveSemanticStatements({ contexts, nodes, relations, now });
    const second = deriveSemanticStatements({
      contexts: [...contexts].reverse(),
      nodes: [...nodes].reverse(),
      relations: [...relations].reverse(),
      now,
    });

    expect(first.map((statement) => statement.id)).toEqual(
      second.map((statement) => statement.id),
    );
    expect(first[0].id).toBe("semantic:vinema:uses:indexeddb");
  });

  it("reconstructs after restore and disappears after reset", () => {
    const restored = statementSetup("Vinema usa IndexedDB.", ["vinema", "indexeddb"]);

    expect(deriveSemanticStatements({ ...restored, now })).not.toEqual([]);
    expect(
      deriveSemanticStatements({
        contexts: restored.contexts,
        relations: [],
        nodes: [],
        now,
      }),
    ).toEqual([]);
  });

  it("handles a reasonable deterministic dataset", () => {
    const contexts = [
      context({ id: "vinema", name: "Vinema" }),
      context({ id: "indexeddb", name: "IndexedDB" }),
    ];
    const nodes = Array.from({ length: 1_000 }, (_, index) =>
      node({ id: `memory-${index}`, content: "Vinema usa IndexedDB." }),
    );
    const relations = nodes.flatMap((memory) => [
      relation({ nodeId: memory.id, contextId: "vinema" }),
      relation({ nodeId: memory.id, contextId: "indexeddb" }),
    ]);
    const startedAt = performance.now();
    const statements = deriveSemanticStatements({ contexts, nodes, relations, now });

    expect(statements[0]).toMatchObject({ confidence: "HIGH" });
    expect(performance.now() - startedAt).toBeLessThan(500);
  });
});

function statementSetup(content: string, conceptIds: string[]) {
  const contexts = conceptIds.map((conceptId) => contextForId(conceptId));
  const nodes = [node({ id: "memory-1", content })];
  const relations = conceptIds.map((conceptId) =>
    relation({ nodeId: "memory-1", contextId: conceptId }),
  );

  return { contexts, nodes, relations };
}

function conceptsForText(content: string) {
  return [
    ["tom-ford", "Tom Ford"],
    ["erba-pura", "Erba Pura"],
    ["vinema", "Vinema"],
    ["postgresql", "PostgreSQL"],
    ["operational-core", "Operational Core"],
    ["railway", "Railway"],
  ]
    .filter(([, label]) => content.includes(label))
    .map(([id]) => id);
}

function contextForId(id: string) {
  const labels: Record<string, string> = {
    "barrio-civico": "Barrio Cívico",
    "behavioral-engine": "Behavioral Engine",
    codelco: "Codelco",
    danny: "Danny",
    enrolamiento: "enrolamiento",
    indexeddb: "IndexedDB",
    jose: "José",
    mitat: "MITAT",
    mitcom: "Mitcom",
    "ombre-leather": "Ombre Leather",
    "operational-core": "Operational Core",
    postgresql: "PostgreSQL",
    "project-core": "Project Core",
    "segundo-cerebro": "segundo cerebro",
    "tom-ford": "Tom Ford",
    vinema: "Vinema",
    zublin: "Züblin",
  };

  return context({ id, name: labels[id] ?? id });
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
