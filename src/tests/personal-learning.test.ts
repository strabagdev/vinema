import { describe, expect, it } from "vitest";
import type { Concept } from "@/domain/concept/concept";
import type { Capture } from "@/domain/capture/capture";
import type { CaptureConceptRelation } from "@/domain/concept/capture-concept-relation";
import { createPersonalEvidence } from "@/features/cognition/personal-evidence";
import { createPersonalLearning } from "@/features/cognition/personal-learning";
import { deriveBehavioralPatterns } from "@/features/cognition/behavioral-engine/behavioral-engine";
import { deriveMemoryEvolutionSignals } from "@/features/cognition/memory-evolution";
import { deriveSemanticStatements } from "@/features/cognition/semantic-understanding";
import { deriveKnowledgeSuggestions } from "@/features/cognition/knowledge-suggestions";
import { deriveMemoryResponse } from "@/features/cognition/orchestrator";

const now = new Date("2026-08-01T12:00:00.000Z");

describe("PersonalLearning", () => {
  it("returns empty outputs for empty personal memory", () => {
    const learning = createPersonalLearning({
      evidence: createPersonalEvidence({
        concepts: [],
        captures: [],
        relations: [],
        now,
        recentWindowDays: 60,
      }),
    });

    expect(learning).toEqual({
      observedPatterns: [],
      temporalSignals: [],
      observedRelations: [],
    });
  });

  it("matches legacy wrappers exactly for observed patterns, temporal signals and contextual relations", () => {
    const dataset = datasetFor(["alfa", "beta", "gamma"], [
      ["memory-1", "alfa beta gamma", "2026-04-01T10:00:00.000Z"],
      ["memory-2", "alfa beta gamma", "2026-07-10T10:00:00.000Z"],
      ["memory-3", "alfa beta gamma", "2026-07-20T10:00:00.000Z"],
    ]);
    const learning = createPersonalLearning({
      evidence: createPersonalEvidence({
        concepts: dataset.concepts,
        captures: dataset.captures,
        relations: dataset.relations,
        now,
        recentWindowDays: 60,
      }),
    });

    expect(learning.observedPatterns).toEqual(
      deriveBehavioralPatterns({
        contexts: dataset.concepts,
        nodes: dataset.captures,
        relations: dataset.relations,
        now,
      }),
    );
    expect(learning.temporalSignals).toEqual(
      deriveMemoryEvolutionSignals({
        contexts: dataset.concepts,
        nodes: dataset.captures,
        relations: dataset.relations,
        now,
      }),
    );
    expect(learning.observedRelations).toEqual(
      deriveSemanticStatements({
        contexts: dataset.concepts,
        nodes: dataset.captures,
        relations: dataset.relations,
        now,
      }),
    );
  });

  it("freezes recurrent pairs, clusters and missing-context suggestions", () => {
    const dataset = datasetFor(["alfa", "beta", "gamma"], [
      ["memory-1", "alfa beta gamma", "2026-06-01T10:00:00.000Z"],
      ["memory-2", "alfa beta gamma", "2026-07-01T10:00:00.000Z"],
      ["memory-3", "alfa beta gamma", "2026-07-20T10:00:00.000Z"],
    ]);
    const learning = learningFor(dataset);
    const suggestions = deriveKnowledgeSuggestions({
      inputConceptIds: ["alfa", "beta"],
      contexts: dataset.concepts,
      nodes: dataset.captures,
      relations: dataset.relations,
      now,
      precomputedEvidence: {
        relationships: [],
        behavioralPatterns: learning.observedPatterns,
        semanticStatements: learning.observedRelations,
        evolutionSignals: learning.temporalSignals,
      },
    });

    expect(learning.observedPatterns.map((pattern) => pattern.kind)).toContain(
      "RECURRING_CLUSTER",
    );
    expect(suggestions).toEqual([
      {
        id: "knowledge:missing_context:gamma",
        kind: "MISSING_CONTEXT",
        conceptId: "gamma",
        canonicalLabel: "Gamma",
        confidence: "HIGH",
        reasons: ["Suele formar parte de este mismo contexto"],
        evidenceNodeIds: ["memory-1", "memory-2", "memory-3"],
      },
    ]);
  });

  it("freezes temporal NEW, GROWING, STABLE, DECLINING, DORMANT and REVIVED signals", () => {
    const cases = [
      ["NEW_CONCEPT", ["2026-07-20T10:00:00.000Z"]],
      [
        "GROWING_CONCEPT",
        [
          "2026-06-15T10:00:00.000Z",
          "2026-07-10T10:00:00.000Z",
          "2026-07-20T10:00:00.000Z",
        ],
      ],
      [
        "STABLE_CONCEPT",
        [
          "2026-04-10T10:00:00.000Z",
          "2026-05-10T10:00:00.000Z",
          "2026-06-20T10:00:00.000Z",
          "2026-07-20T10:00:00.000Z",
        ],
      ],
      [
        "DECLINING_CONCEPT",
        [
          "2026-05-20T10:00:00.000Z",
          "2026-06-10T10:00:00.000Z",
          "2026-06-20T10:00:00.000Z",
        ],
      ],
      [
        "DORMANT_CONCEPT",
        [
          "2026-02-10T10:00:00.000Z",
          "2026-03-10T10:00:00.000Z",
          "2026-04-10T10:00:00.000Z",
        ],
      ],
      [
        "REVIVED_CONCEPT",
        [
          "2026-02-10T10:00:00.000Z",
          "2026-03-10T10:00:00.000Z",
          "2026-07-20T10:00:00.000Z",
        ],
      ],
    ] as const;

    for (const [kind, dates] of cases) {
      const dataset = datasetFor(["zorplax"], dates.map((date, index) => [
        `memory-${index}`,
        "zorplax",
        date,
      ]));

      expect(
        learningFor(dataset).temporalSignals.map((signal) => signal.kind),
      ).toContain(kind);
    }
  });

  it.each([
    ["es", ["descanso", "energia"]],
    ["en", ["sleep", "energy"]],
    ["pt", ["sono", "energia"]],
  ])("keeps language-neutral co-occurrence behavior for %s", (_language, concepts) => {
    const dataset = datasetFor(concepts, [
      ["memory-1", concepts.join(" "), "2026-07-01T10:00:00.000Z"],
      ["memory-2", concepts.join(" "), "2026-07-10T10:00:00.000Z"],
      ["memory-3", concepts.join(" "), "2026-07-20T10:00:00.000Z"],
    ]);

    expect(learningFor(dataset).observedPatterns[0]).toMatchObject({
      kind: "RECURRENT_PAIR",
      strength: "MEDIUM",
      metrics: {
        totalOccurrences: 3,
      },
    });
  });

  it("preserves archived capture semantics and does not mutate PersonalEvidence", () => {
    const dataset = datasetFor(["alfa", "beta"], [
      ["active", "alfa beta", "2026-07-20T10:00:00.000Z"],
      ["archived", "alfa beta", "2026-07-21T10:00:00.000Z", "2026-07-22T10:00:00.000Z"],
    ]);
    const evidence = createPersonalEvidence({
      concepts: dataset.concepts,
      captures: dataset.captures,
      relations: dataset.relations,
      now,
      recentWindowDays: 60,
    });
    const before = evidenceSignature(evidence);

    expect(createPersonalLearning({ evidence }).observedPatterns).toEqual([]);
    expect(evidenceSignature(evidence)).toEqual(before);
  });

  it("keeps the full orchestrator response equal to current public composition", () => {
    const dataset = datasetFor(["alfa", "beta", "gamma"], [
      ["memory-1", "alfa beta gamma", "2026-06-01T10:00:00.000Z"],
      ["memory-2", "alfa beta gamma", "2026-07-01T10:00:00.000Z"],
      ["memory-3", "alfa beta gamma", "2026-07-20T10:00:00.000Z"],
    ]);
    const response = deriveMemoryResponse({
      contexts: dataset.concepts,
      nodes: dataset.captures,
      relations: dataset.relations,
      query: {
        text: "alfa beta",
        detectedConceptIds: ["alfa", "beta"],
        selectedConceptIds: [],
        now,
      },
    });

    expect(response.summary).toMatchObject({
      totalConcepts: 2,
      activeSuggestions: 1,
      activePatterns: 7,
      explicitStatements: 0,
    });
    expect(response.suggestions[0]).toMatchObject({
      conceptId: "gamma",
      kind: "MISSING_CONTEXT",
      confidence: "HIGH",
    });
  });
});

function learningFor(dataset: ReturnType<typeof datasetFor>) {
  return createPersonalLearning({
    evidence: createPersonalEvidence({
      concepts: dataset.concepts,
      captures: dataset.captures,
      relations: dataset.relations,
      now,
      recentWindowDays: 60,
    }),
  });
}

function datasetFor(
  conceptIds: string[],
  captures: Array<[string, string, string, string?]>,
) {
  const concepts = conceptIds.map((id) => concept({ id, name: titleize(id) }));
  const nodes = captures.map(([id, content, updatedAt, archivedAt]) =>
    capture({ id, content, updatedAt, archivedAt: archivedAt ?? null }),
  );
  const relations = nodes.flatMap((node) =>
    conceptIds.map((conceptId) => relation(node.id, conceptId)),
  );

  return {
    concepts,
    captures: nodes,
    relations,
  };
}

function titleize(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toLocaleUpperCase("es") + part.slice(1))
    .join(" ");
}

function evidenceSignature(evidence: ReturnType<typeof createPersonalEvidence>) {
  return {
    captures: evidence.evidenceCaptures.map((item) => item.captureId),
    relationships: Array.from(evidence.relationshipSeriesByKey.values()).map((item) => ({
      conceptIds: item.conceptIds,
      sharedEvidenceNodeIds: item.sharedEvidenceNodeIds,
    })),
    concepts: Array.from(evidence.conceptSeriesById.values()).map((item) => ({
      conceptId: item.conceptId,
      evidenceNodeIds: item.evidenceNodeIds,
    })),
  };
}

function concept(overrides: Partial<Concept>): Concept {
  return {
    id: overrides.id ?? "concept",
    workspaceId: "workspace-1",
    type: "AREA",
    name: overrides.name ?? "Concept",
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

function capture(overrides: Partial<Capture>): Capture {
  return {
    id: overrides.id ?? "capture",
    workspaceId: "workspace-1",
    type: "NOTE",
    content: overrides.content ?? "Contenido",
    status: "ACTIVE",
    organizationStatus: "ORGANIZED",
    metadata: {},
    version: 1,
    createdAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
    contentUpdatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
    archivedAt: null,
    restoredAt: null,
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    createdByDeviceId: "device-1",
    lastModifiedByDeviceId: "device-1",
    ...overrides,
  };
}

function relation(nodeId: string, contextId: string): CaptureConceptRelation {
  return {
    id: `relation-${nodeId}-${contextId}`,
    workspaceId: "workspace-1",
    nodeId,
    contextId,
    relationType: "CONTEXT",
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}
