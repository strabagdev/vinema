import { describe, expect, it, vi } from "vitest";
import type { Concept } from "@/domain/concept/concept";
import type { CaptureConceptRelation } from "@/domain/concept/capture-concept-relation";
import type { Capture } from "@/domain/capture/capture";
import {
  createMemoryEvidenceModel,
} from "@/features/cognition/memory-evidence/memory-evidence-model";
import {
  createPersonalEvidence,
  type PersonalEvidence,
} from "@/features/cognition/personal-evidence";
import { deriveBehavioralPatterns } from "@/features/cognition/behavioral-engine/behavioral-engine";
import { deriveMemoryEvolutionSignals } from "@/features/cognition/memory-evolution";
import { deriveSemanticStatements } from "@/features/cognition/semantic-understanding";
import { deriveKnowledgeSuggestions } from "@/features/cognition/knowledge-suggestions";

const now = new Date("2026-08-01T00:00:00.000Z");

describe("PersonalEvidence", () => {
  it("matches the legacy memory evidence wrapper exactly", () => {
    const dataset = makeDataset();
    const personalEvidence = createPersonalEvidence({
      concepts: dataset.concepts,
      relations: dataset.relations,
      captures: dataset.captures,
      now,
      recentWindowDays: 60,
    });
    const legacyEvidence = createMemoryEvidenceModel({
      contexts: dataset.concepts,
      relations: dataset.relations,
      nodes: dataset.captures,
      now,
      recentWindowDays: 60,
    });

    expect(signature(personalEvidence)).toEqual(signature(legacyEvidence));
  });

  it("keeps temporal windows cached in the same PersonalEvidence instance", () => {
    const dataset = makeDataset();
    const evidence = createPersonalEvidence({
      concepts: dataset.concepts,
      relations: dataset.relations,
      captures: dataset.captures,
      now,
      recentWindowDays: 60,
    });

    expect(evidence.getTemporalEvidence({ recentWindowDays: 30 })).toBe(
      evidence.getTemporalEvidence({ recentWindowDays: 30 }),
    );
    expect(evidence.getTemporalEvidence({ recentWindowDays: 60 }).conceptSeriesById)
      .toBe(evidence.conceptSeriesById);
    expect(evidence.getTemporalEvidence({ recentWindowDays: 30 })).not.toBe(
      evidence.getTemporalEvidence({ recentWindowDays: 60 }),
    );
    expect(evidence.getTemporalEvidence({ recentWindowDays: 30 }).windows.recentStart)
      .not.toBe(evidence.getTemporalEvidence({ recentWindowDays: 60 }).windows.recentStart);
  });

  it("handles empty and archived memory with existing semantics", () => {
    expect(
      createPersonalEvidence({
        concepts: [],
        relations: [],
        captures: [],
        now,
        recentWindowDays: 60,
      }).evidenceCaptures,
    ).toEqual([]);

    const dataset = makeDataset({
      captures: [capture({ id: "capture-archived", archivedAt: now.toISOString() })],
      concepts: [concept({ id: "concept-a" })],
      relations: [relation("capture-archived", "concept-a")],
    });

    expect(
      createPersonalEvidence({
        concepts: dataset.concepts,
        relations: dataset.relations,
        captures: dataset.captures,
        now,
        recentWindowDays: 60,
      }).evidenceCaptures,
    ).toEqual([]);
    expect(
      deriveBehavioralPatterns({
        contexts: dataset.concepts,
        relations: dataset.relations,
        nodes: dataset.captures,
        now,
      }),
    ).toEqual(
      deriveBehavioralPatterns({
        contexts: dataset.concepts,
        relations: dataset.relations,
        nodes: dataset.captures,
        now,
        evidenceModel: createPersonalEvidence({
          concepts: dataset.concepts,
          relations: dataset.relations,
          captures: dataset.captures,
          now,
          recentWindowDays: 60,
        }),
      }),
    );
  });

  it("lets consumers reuse PersonalEvidence without mutating it", () => {
    const dataset = makeDataset();
    const evidence = createPersonalEvidence({
      concepts: dataset.concepts,
      relations: dataset.relations,
      captures: dataset.captures,
      now,
      recentWindowDays: 60,
    });
    const before = signature(evidence);

    deriveBehavioralPatterns({
      contexts: dataset.concepts,
      relations: dataset.relations,
      nodes: dataset.captures,
      now,
      evidenceModel: evidence,
    });
    deriveSemanticStatements({
      contexts: dataset.concepts,
      relations: dataset.relations,
      nodes: dataset.captures,
      now,
      evidenceModel: evidence,
    });
    deriveMemoryEvolutionSignals({
      contexts: dataset.concepts,
      relations: dataset.relations,
      nodes: dataset.captures,
      now,
      evidenceModel: evidence,
    });
    deriveKnowledgeSuggestions({
      inputConceptIds: ["concept-a"],
      contexts: dataset.concepts,
      relations: dataset.relations,
      nodes: dataset.captures,
      now,
      behavioralEvidenceModel: evidence,
      evolutionEvidenceModel: evidence,
      precomputedEvidence: {
        relationships: [],
        behavioralPatterns: [],
        semanticStatements: [],
        evolutionSignals: [],
      },
    });

    expect(signature(evidence)).toEqual(before);
  });

  it("builds one PersonalEvidence instance and passes it consistently through the orchestrator", async () => {
    vi.resetModules();
    const createdEvidence: unknown[] = [];
    const behavioralEvidence: unknown[] = [];
    const semanticEvidence: unknown[] = [];
    const evolutionEvidence: unknown[] = [];
    const suggestionCalls: Array<{
      behavioralEvidenceModel?: unknown;
      evolutionEvidenceModel?: unknown;
      precomputedEvidence?: unknown;
    }> = [];

    vi.doMock("@/features/cognition/personal-evidence", async () => {
      const actual = await vi.importActual<
        typeof import("@/features/cognition/personal-evidence")
      >("@/features/cognition/personal-evidence");
      return {
        ...actual,
        createPersonalEvidence: vi.fn((options) => {
          const evidence = actual.createPersonalEvidence(options);
          createdEvidence.push(evidence);
          return evidence;
        }),
      };
    });

    vi.doMock("@/features/cognition/behavioral-engine/behavioral-engine", async () => {
      const actual = await vi.importActual<
        typeof import("@/features/cognition/behavioral-engine/behavioral-engine")
      >("@/features/cognition/behavioral-engine/behavioral-engine");
      return {
        ...actual,
        deriveBehavioralPatterns: vi.fn((options) => {
          behavioralEvidence.push(options.evidenceModel);
          return [];
        }),
      };
    });

    vi.doMock("@/features/cognition/semantic-understanding", async () => {
      const actual = await vi.importActual<
        typeof import("@/features/cognition/semantic-understanding")
      >("@/features/cognition/semantic-understanding");
      return {
        ...actual,
        deriveSemanticStatements: vi.fn((options) => {
          semanticEvidence.push(options.evidenceModel);
          return [];
        }),
      };
    });

    vi.doMock("@/features/cognition/memory-evolution", async () => {
      const actual = await vi.importActual<
        typeof import("@/features/cognition/memory-evolution")
      >("@/features/cognition/memory-evolution");
      return {
        ...actual,
        deriveMemoryEvolutionSignals: vi.fn((options) => {
          evolutionEvidence.push(options.evidenceModel);
          return [];
        }),
      };
    });

    vi.doMock("@/features/cognition/knowledge-suggestions", async () => {
      const actual = await vi.importActual<
        typeof import("@/features/cognition/knowledge-suggestions")
      >("@/features/cognition/knowledge-suggestions");
      return {
        ...actual,
        deriveKnowledgeSuggestions: vi.fn((options) => {
          suggestionCalls.push(options);
          return [];
        }),
      };
    });

    const { deriveMemoryResponse } = await import(
      "@/features/cognition/orchestrator"
    );
    const dataset = makeDataset();

    deriveMemoryResponse({
      contexts: dataset.concepts,
      relations: dataset.relations,
      nodes: dataset.captures,
      query: {
        text: "descanso",
        detectedConceptIds: ["concept-a"],
        selectedConceptIds: [],
        now,
      },
    });

    const [evidence] = createdEvidence;
    expect(createdEvidence).toHaveLength(1);
    expect(behavioralEvidence).toEqual([evidence]);
    expect(semanticEvidence).toEqual([evidence]);
    expect(evolutionEvidence).toEqual([evidence]);
    expect(suggestionCalls).toHaveLength(1);
    expect(suggestionCalls[0].behavioralEvidenceModel).toBe(evidence);
    expect(suggestionCalls[0].evolutionEvidenceModel).toBe(evidence);
    expect(suggestionCalls[0].precomputedEvidence).toMatchObject({
      relationships: expect.any(Array),
      behavioralPatterns: expect.any(Array),
      semanticStatements: expect.any(Array),
      evolutionSignals: expect.any(Array),
    });
  });
});

function signature(evidence: PersonalEvidence) {
  return {
    captures: evidence.evidenceCaptures.map((item) => ({
      captureId: item.captureId,
      conceptIds: item.conceptIds,
      timestamp: item.timestamp,
    })),
    concepts: Array.from(evidence.conceptSeriesById.values()).map((item) => ({
      conceptId: item.conceptId,
      evidenceCaptureIds: item.evidenceCaptureIds,
      recentEvidenceCaptureIds: item.recentEvidenceCaptureIds,
      previousEvidenceCaptureIds: item.previousEvidenceCaptureIds,
      historicalEvidenceCaptureIds: item.historicalEvidenceCaptureIds,
      recentTopConnections: item.recentTopConnections,
      historicalTopConnections: item.historicalTopConnections,
    })),
    relationships: Array.from(evidence.relationshipSeriesByKey.values()).map(
      (item) => ({
        conceptIds: item.conceptIds,
        sharedEvidenceCaptureIds: item.sharedEvidenceCaptureIds,
        recentCount: item.recentCount,
        previousCount: item.previousCount,
        historicalCount: item.historicalCount,
      }),
    ),
  };
}

function makeDataset(
  overrides: Partial<{
    concepts: Concept[];
    captures: Capture[];
    relations: CaptureConceptRelation[];
  }> = {},
) {
  const concepts = overrides.concepts ?? [
    concept({ id: "concept-a", name: "Descanso" }),
    concept({ id: "concept-b", name: "Telefono" }),
    concept({ id: "concept-c", name: "Horario" }),
  ];
  const captures = overrides.captures ?? [
    capture({ id: "capture-a", content: "Descanso y telefono" }),
    capture({ id: "capture-b", content: "Descanso y horario" }),
    capture({ id: "capture-c", content: "Descanso telefono horario" }),
  ];
  const relations = overrides.relations ?? [
    relation("capture-a", "concept-a"),
    relation("capture-a", "concept-b"),
    relation("capture-b", "concept-a"),
    relation("capture-b", "concept-c"),
    relation("capture-c", "concept-a"),
    relation("capture-c", "concept-b"),
    relation("capture-c", "concept-c"),
  ];

  return { concepts, captures, relations };
}

function concept(overrides: Partial<Concept>): Concept {
  return {
    id: overrides.id ?? "concept",
    workspaceId: "workspace",
    type: "AREA",
    name: overrides.name ?? "Concept",
    description: null,
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
    workspaceId: "workspace",
    type: "NOTE",
    content: overrides.content ?? "Contenido",
    status: "ACTIVE",
    organizationStatus: "ORGANIZED",
    metadata: {},
    version: 1,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    deletedAt: null,
    createdByDeviceId: "device",
    lastModifiedByDeviceId: "device",
    ...overrides,
  };
}

function relation(
  captureId: string,
  conceptId: string,
): CaptureConceptRelation {
  return {
    id: `${captureId}:${conceptId}`,
    workspaceId: "workspace",
    nodeId: captureId,
    contextId: conceptId,
    relationType: "CONTEXT",
    version: 1,
    createdAt: "2026-07-01T00:00:00.000Z",
  };
}
