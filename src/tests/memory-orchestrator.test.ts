import { describe, expect, it } from "vitest";
import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import { deriveBehavioralPatterns } from "@/features/cognition/behavioral-engine/behavioral-engine";
import { deriveKnowledgeSuggestions } from "@/features/cognition/knowledge-suggestions";
import { deriveMemoryEvolutionSignals } from "@/features/cognition/memory-evolution";
import { deriveMemoryResponse } from "@/features/cognition/orchestrator";
import { deriveSemanticStatements } from "@/features/cognition/semantic-understanding";

const now = new Date("2026-08-01T12:00:00.000Z");

describe("Memory Orchestrator v1", () => {
  it("derives a simple coordinated memory response", () => {
    const setup = setupMemory({
      concepts: ["mitcom", "tracking"],
      dates: [
        "2026-04-01T10:00:00.000Z",
        "2026-06-01T10:00:00.000Z",
        "2026-07-20T10:00:00.000Z",
      ],
    });

    const response = deriveMemoryResponse({
      ...setup,
      query: query({ detectedConceptIds: ["mitcom"] }),
    });

    expect(response.concepts.map((concept) => concept.id)).toEqual(["mitcom"]);
    expect(response.profiles).toHaveLength(1);
    expect(response.relationships).toContainEqual(
      expect.objectContaining({
        sourceConceptId: "mitcom",
        targetConceptId: "tracking",
      }),
    );
    expect(response.suggestions).toContainEqual(
      expect.objectContaining({ conceptId: "tracking" }),
    );
    expect(response.summary).toMatchObject({
      totalConcepts: 1,
      totalRelationships: 1,
      activeSuggestions: 1,
    });
  });

  it("resolves aliases to a single canonical concept", () => {
    const contexts = [
      context({ id: "vinema", name: "Vinema", aliases: ["Segundo cerebro"] }),
      context({ id: "alias", name: "Segundo cerebro" }),
      context({ id: "railway", name: "Railway" }),
    ];
    const nodes = [
      node({ id: "a", updatedAt: "2026-04-01T10:00:00.000Z" }),
      node({ id: "b", updatedAt: "2026-06-01T10:00:00.000Z" }),
      node({ id: "c", updatedAt: "2026-07-20T10:00:00.000Z" }),
    ];
    const relations = nodes.flatMap((memory) =>
      relationsFor(memory.id, ["vinema", "alias", "railway"]),
    );

    const response = deriveMemoryResponse({
      contexts,
      nodes,
      relations,
      query: query({
        detectedConceptIds: ["vinema"],
        selectedConceptIds: ["alias"],
      }),
    });

    expect(response.concepts.map((concept) => concept.id)).toEqual(["vinema"]);
    expect(response.profiles.map((profile) => profile.concept.id)).toEqual([
      "vinema",
    ]);
  });

  it("handles a query without concepts without fabricating suggestions", () => {
    const setup = setupMemory({
      concepts: ["mitcom", "tracking"],
      dates: [
        "2026-04-01T10:00:00.000Z",
        "2026-06-01T10:00:00.000Z",
        "2026-07-20T10:00:00.000Z",
      ],
    });

    const response = deriveMemoryResponse({
      ...setup,
      query: query({ detectedConceptIds: [], selectedConceptIds: [] }),
    });

    expect(response.concepts).toEqual([]);
    expect(response.profiles).toEqual([]);
    expect(response.relationships).toEqual([]);
    expect(response.suggestions).toEqual([]);
    expect(response.behavioralPatterns.length).toBeGreaterThan(0);
  });

  it("coordinates Behavioral, Semantic, Evolution and Suggestions without changing their outputs", () => {
    const contexts = [
      context({ id: "mitcom", name: "Mitcom" }),
      context({ id: "sponsor", name: "Sponsor" }),
    ];
    const nodes = [
      node({
        id: "a",
        content: "Mitcom depende de Sponsor para aprobar presupuesto.",
        updatedAt: "2026-04-01T10:00:00.000Z",
      }),
      node({
        id: "b",
        content: "Mitcom depende de Sponsor para desbloquear contrato.",
        updatedAt: "2026-06-01T10:00:00.000Z",
      }),
      node({
        id: "c",
        content: "Mitcom y Sponsor revisan seguimiento comercial.",
        updatedAt: "2026-07-20T10:00:00.000Z",
      }),
    ];
    const relations = nodes.flatMap((memory) =>
      relationsFor(memory.id, ["mitcom", "sponsor"]),
    );

    const response = deriveMemoryResponse({
      contexts,
      nodes,
      relations,
      query: query({ detectedConceptIds: ["mitcom"] }),
    });

    expect(response.behavioralPatterns.map((pattern) => pattern.id)).toEqual(
      deriveBehavioralPatterns({ contexts, nodes, relations, now }).map(
        (pattern) => pattern.id,
      ),
    );
    expect(response.semanticStatements.map((statement) => statement.id)).toEqual(
      deriveSemanticStatements({ contexts, nodes, relations, now }).map(
        (statement) => statement.id,
      ),
    );
    expect(response.evolutionSignals.map((signal) => signal.id)).toEqual(
      deriveMemoryEvolutionSignals({ contexts, nodes, relations, now }).map(
        (signal) => signal.id,
      ),
    );
    expect(response.suggestions.map((suggestion) => suggestion.id)).toEqual(
      deriveKnowledgeSuggestions({
        contexts,
        nodes,
        relations,
        inputConceptIds: ["mitcom"],
        now,
      }).map((suggestion) => suggestion.id),
    );
  });

  it("deduplicates relationships, patterns, signals, suggestions and evidence", () => {
    const setup = setupMemory({
      concepts: ["mitcom", "tracking"],
      dates: [
        "2026-04-01T10:00:00.000Z",
        "2026-06-01T10:00:00.000Z",
        "2026-07-20T10:00:00.000Z",
      ],
    });

    const response = deriveMemoryResponse({
      ...setup,
      query: query({ detectedConceptIds: ["mitcom", "tracking"] }),
    });

    expect(new Set(response.relationships.map((relationship) =>
      [relationship.sourceConceptId, relationship.targetConceptId].sort().join(":"),
    )).size).toBe(response.relationships.length);
    expect(new Set(response.behavioralPatterns.map((pattern) => pattern.id)).size).toBe(
      response.behavioralPatterns.length,
    );
    expect(new Set(response.evolutionSignals.map((signal) => signal.id)).size).toBe(
      response.evolutionSignals.length,
    );
    expect(new Set(response.suggestions.map((suggestion) => suggestion.id)).size).toBe(
      response.suggestions.length,
    );
    expect(new Set(response.evidence.map((evidence) => evidence.nodeId)).size).toBe(
      response.evidence.length,
    );
  });

  it("returns stable ordering and a correct summary", () => {
    const setup = setupMemory({
      concepts: ["mitcom", "tracking", "sponsor"],
      dates: [
        "2026-03-01T10:00:00.000Z",
        "2026-05-01T10:00:00.000Z",
        "2026-07-20T10:00:00.000Z",
      ],
    });
    const first = deriveMemoryResponse({
      ...setup,
      query: query({ detectedConceptIds: ["mitcom"] }),
    });
    const second = deriveMemoryResponse({
      contexts: [...setup.contexts].reverse(),
      nodes: [...setup.nodes].reverse(),
      relations: [...setup.relations].reverse(),
      query: query({ detectedConceptIds: ["mitcom"] }),
    });

    expect(first.relationships.map((relationship) => relationshipKey(relationship))).toEqual(
      second.relationships.map((relationship) => relationshipKey(relationship)),
    );
    expect(first.evidence.map((evidence) => evidence.nodeId)).toEqual(
      second.evidence.map((evidence) => evidence.nodeId),
    );
    expect(first.summary).toEqual({
      totalConcepts: first.concepts.length,
      totalRelationships: first.relationships.length,
      activeSuggestions: first.suggestions.filter(
        (suggestion) => suggestion.confidence !== "LOW",
      ).length,
      activePatterns: first.behavioralPatterns.filter(
        (pattern) => pattern.strength !== "WEAK",
      ).length,
      evolutionSignals: first.evolutionSignals.length,
      explicitStatements: first.semanticStatements.filter(
        (statement) => statement.evidenceLevel !== "CONTEXTUAL",
      ).length,
      evidenceNodes: first.evidence.length,
    });
  });

  it("does not mutate inputs or persist derived data", () => {
    const setup = setupMemory({
      concepts: ["mitcom", "tracking"],
      dates: [
        "2026-04-01T10:00:00.000Z",
        "2026-06-01T10:00:00.000Z",
        "2026-07-20T10:00:00.000Z",
      ],
    });
    const before = JSON.stringify(setup);

    deriveMemoryResponse({
      ...setup,
      query: query({ detectedConceptIds: ["mitcom"] }),
    });

    expect(JSON.stringify(setup)).toBe(before);
    expect(setup.contexts).not.toContainEqual(
      expect.objectContaining({ memoryResponse: expect.anything() }),
    );
    expect(setup.nodes).not.toContainEqual(
      expect.objectContaining({ memoryResponse: expect.anything() }),
    );
    expect(setup.relations).not.toContainEqual(
      expect.objectContaining({ memoryResponse: expect.anything() }),
    );
  });

  it("rebuilds from restored data and clears after reset", () => {
    const restored = setupMemory({
      concepts: ["mitcom", "tracking"],
      dates: [
        "2026-04-01T10:00:00.000Z",
        "2026-06-01T10:00:00.000Z",
        "2026-07-20T10:00:00.000Z",
      ],
    });

    expect(
      deriveMemoryResponse({
        ...restored,
        query: query({ detectedConceptIds: ["mitcom"] }),
      }).summary.evidenceNodes,
    ).toBeGreaterThan(0);
    expect(
      deriveMemoryResponse({
        contexts: restored.contexts,
        nodes: [],
        relations: [],
        query: query({ detectedConceptIds: ["mitcom"] }),
      }).summary,
    ).toMatchObject({
      totalRelationships: 0,
      activeSuggestions: 0,
      activePatterns: 0,
      evidenceNodes: 0,
    });
  });

  it("handles a large deterministic dataset within a reasonable budget", () => {
    const contexts = [
      context({ id: "mitcom", name: "Mitcom" }),
      context({ id: "tracking", name: "Tracking" }),
      context({ id: "servidor", name: "Servidor" }),
      context({ id: "sponsor", name: "Sponsor" }),
    ];
    const nodes = Array.from({ length: 1_000 }, (_, index) =>
      node({
        id: `memory-${index}`,
        updatedAt: `2026-${String((index % 7) + 1).padStart(2, "0")}-01T10:00:00.000Z`,
      }),
    );
    const relations = nodes.flatMap((memory, index) =>
      relationsFor(
        memory.id,
        index % 2 === 0
          ? ["mitcom", "tracking", "servidor"]
          : ["mitcom", "tracking", "sponsor"],
      ),
    );
    const { result: response, medianMs } = measureStablePerformance(() =>
      deriveMemoryResponse({
        contexts,
        nodes,
        relations,
        query: query({ detectedConceptIds: ["mitcom"] }),
      }),
    );

    expect(response.summary.evidenceNodes).toBeGreaterThan(0);
    expect(medianMs).toBeLessThan(1_200);
  });
});

function measureStablePerformance<T>(
  run: () => T,
  {
    warmupIterations = 2,
    measuredIterations = 7,
  }: { warmupIterations?: number; measuredIterations?: number } = {},
) {
  for (let index = 0; index < warmupIterations; index += 1) {
    run();
  }

  const measurements: number[] = [];
  let result = run();

  for (let index = 0; index < measuredIterations; index += 1) {
    const startedAt = performance.now();
    result = run();
    measurements.push(performance.now() - startedAt);
  }

  return {
    result,
    medianMs: median(measurements),
    p95Ms: percentile(measurements, 0.95),
  };
}

function median(values: number[]) {
  return percentile(values, 0.5);
}

function percentile(values: number[], percentileValue: number) {
  const sorted = [...values].sort((first, second) => first - second);
  return (
    sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileValue) - 1)] ??
    0
  );
}

function query({
  text = "",
  detectedConceptIds = [],
  selectedConceptIds = [],
}: {
  text?: string;
  detectedConceptIds?: string[];
  selectedConceptIds?: string[];
}) {
  return {
    text,
    detectedConceptIds,
    selectedConceptIds,
    now,
  };
}

function setupMemory({
  concepts,
  dates,
}: {
  concepts: string[];
  dates: string[];
}) {
  const contexts = concepts.map((conceptId) =>
    context({
      id: conceptId,
      name: conceptId
        .split("-")
        .map((part) => part[0]?.toLocaleUpperCase("es") + part.slice(1))
        .join(" "),
    }),
  );
  const nodes = dates.map((date, index) =>
    node({
      id: `memory-${index}`,
      updatedAt: date,
    }),
  );
  const relations = nodes.flatMap((memory) => relationsFor(memory.id, concepts));

  return {
    contexts,
    nodes,
    relations,
  };
}

function context({
  id,
  name,
  aliases = [],
  normalizedAliases = aliases.map((alias) => alias.toLocaleLowerCase("es")),
  archivedAt = null,
}: {
  id: string;
  name: string;
  aliases?: string[];
  normalizedAliases?: string[];
  archivedAt?: string | null;
}): Context {
  return {
    id,
    workspaceId: "workspace-1",
    type: "AREA",
    name,
    description: null,
    aliases,
    normalizedAliases,
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    archivedAt,
  };
}

function node({
  id,
  content = "Captura de conocimiento relacionada.",
  status = "ACTIVE",
  updatedAt,
  deletedAt = null,
}: {
  id: string;
  content?: string;
  status?: Node["status"];
  updatedAt: string;
  deletedAt?: string | null;
}): Node {
  return {
    id,
    workspaceId: "workspace-1",
    type: "NOTE",
    content,
    status,
    organizationStatus: "ORGANIZED",
    metadata: {},
    version: 1,
    createdAt: updatedAt,
    contentUpdatedAt: updatedAt,
    updatedAt,
    deletedAt,
    createdByDeviceId: "device-1",
    lastModifiedByDeviceId: "device-1",
  };
}

function relationsFor(nodeId: string, contextIds: string[]): NodeContextRelation[] {
  return contextIds.map((contextId) => ({
    id: `${nodeId}-${contextId}`,
    workspaceId: "workspace-1",
    nodeId,
    contextId,
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
  }));
}

function relationshipKey({
  sourceConceptId,
  targetConceptId,
}: {
  sourceConceptId: string;
  targetConceptId: string;
}) {
  return [sourceConceptId, targetConceptId].sort().join(":");
}
