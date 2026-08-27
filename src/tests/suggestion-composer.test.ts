import { describe, expect, it } from "vitest";
import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import type { ConceptSuggestionTrace } from "@/features/associations/association-types";
import { DEFAULT_BEHAVIORAL_RECENT_WINDOW_DAYS } from "@/features/cognition/behavioral-engine/behavioral-engine";
import { deriveKnowledgeSuggestions } from "@/features/cognition/knowledge-suggestions";
import { createPersonalEvidence } from "@/features/cognition/personal-evidence";
import { createPersonalLearning } from "@/features/cognition/personal-learning";
import {
  composeSuggestions,
  createSuggestionConceptModel,
  resolveSuggestionPresentConceptIds,
} from "@/features/cognition/suggestion-composer";
import { deriveConceptRelationships } from "@/features/exploration/concept-relationships";

const now = new Date("2026-08-01T12:00:00.000Z");

describe("SuggestionComposer", () => {
  it("matches the legacy Knowledge Suggestions wrapper exactly", () => {
    const dataset = datasetFor(["alfa", "beta", "gamma"], [
      ["memory-1", "alfa beta gamma", "2026-06-01T10:00:00.000Z"],
      ["memory-2", "alfa beta gamma", "2026-07-01T10:00:00.000Z"],
      ["memory-3", "alfa beta gamma", "2026-07-20T10:00:00.000Z"],
    ]);

    expect(composeFor(dataset, ["alfa", "beta"])).toEqual(
      deriveKnowledgeSuggestions({
        ...dataset,
        inputConceptIds: ["alfa", "beta"],
        now,
      }),
    );
  });

  it("preserves empty memory and single-capture legacy behavior", () => {
    const empty = {
      contexts: [context("alfa"), context("beta")],
      nodes: [],
      relations: [],
    };
    const single = datasetFor(["alfa", "beta"], [
      ["memory-1", "alfa beta", "2026-07-20T10:00:00.000Z"],
    ]);

    expect(composeFor(empty, ["alfa"])).toEqual([]);
    expect(composeFor(single, ["alfa"])).toEqual(
      deriveKnowledgeSuggestions({
        ...single,
        inputConceptIds: ["alfa"],
        now,
      }),
    );
  });

  it("preserves language-neutral recurrent words and archived capture semantics", () => {
    for (const concepts of [
      ["descanso", "energia"],
      ["sleep", "energy"],
      ["sono", "energia"],
      ["zorplax", "umbralia"],
    ]) {
      const dataset = datasetFor(concepts, [
        ["memory-1", concepts.join(" "), "2026-07-01T10:00:00.000Z"],
        ["memory-2", concepts.join(" "), "2026-07-10T10:00:00.000Z"],
        ["memory-3", concepts.join(" "), "2026-07-20T10:00:00.000Z"],
        ["archived", concepts.join(" "), "2026-07-21T10:00:00.000Z", "2026-07-22T10:00:00.000Z"],
      ]);

      expect(composeFor(dataset, [concepts[0] ?? ""])).toEqual(
        deriveKnowledgeSuggestions({
          ...dataset,
          inputConceptIds: [concepts[0] ?? ""],
          now,
        }),
      );
    }
  });

  it("requires local support for semantic vector candidates", () => {
    const dataset = datasetFor(["actual-a", "actual-b", "vector-target"], [
      ["memory-1", "actual-a actual-b vector-target", "2026-07-20T10:00:00.000Z"],
      ["memory-2", "actual-a actual-b vector-target", "2026-07-21T10:00:00.000Z"],
    ]);
    const supported = composeFor(dataset, ["actual-a", "actual-b"], {
      semanticRelatedConceptIds: ["vector-target"],
      localText: "vector target aparece en la captura",
      localConceptTraces: [
        conceptTrace(dataset.contexts[0], { directMatches: 1 }),
        conceptTrace(dataset.contexts[1], { directMatches: 1 }),
      ],
    });
    const unsupported = composeFor(dataset, ["actual-a", "actual-b"], {
      semanticRelatedConceptIds: ["vector-target"],
      localText: "sin identidad local suficiente",
      localConceptTraces: [
        conceptTrace(dataset.contexts[0], { directMatches: 1 }),
        conceptTrace(dataset.contexts[1], { directMatches: 1 }),
      ],
    });

    expect(supported.map((suggestion) => suggestion.conceptId)).toContain(
      "vector-target",
    );
    expect(unsupported.map((suggestion) => suggestion.conceptId)).not.toContain(
      "vector-target",
    );
  });

  it("deduplicates, limits and does not mutate its precomputed bundle", () => {
    const dataset = datasetFor(["alfa", "beta", "gamma", "delta"], [
      ["memory-1", "alfa beta gamma delta", "2026-06-01T10:00:00.000Z"],
      ["memory-2", "alfa beta gamma delta", "2026-07-01T10:00:00.000Z"],
      ["memory-3", "alfa beta gamma delta", "2026-07-20T10:00:00.000Z"],
    ]);
    const prepared = prepare(dataset, ["alfa", "beta"]);
    const before = JSON.stringify(prepared.bundle);
    const suggestions = composeSuggestions({
      inputConceptIds: ["alfa", "beta"],
      conceptModel: prepared.conceptModel,
      personalEvidence: prepared.personalEvidence,
      bundle: prepared.bundle,
      now,
      limit: 1,
    });

    expect(suggestions).toHaveLength(1);
    expect(new Set(suggestions.map((suggestion) => suggestion.conceptId)).size).toBe(
      suggestions.length,
    );
    expect(JSON.stringify(prepared.bundle)).toBe(before);
  });
});

function composeFor(
  dataset: { contexts: Context[]; nodes: Node[]; relations: NodeContextRelation[] },
  inputConceptIds: string[],
  options: {
    semanticRelatedConceptIds?: string[];
    localText?: string;
    localConceptTraces?: ConceptSuggestionTrace[];
  } = {},
) {
  const prepared = prepare(dataset, inputConceptIds, options.semanticRelatedConceptIds);

  return composeSuggestions({
    inputConceptIds,
    conceptModel: prepared.conceptModel,
    personalEvidence: prepared.personalEvidence,
    bundle: prepared.bundle,
    now,
    localText: options.localText,
    localConceptTraces: options.localConceptTraces,
  });
}

function prepare(
  dataset: { contexts: Context[]; nodes: Node[]; relations: NodeContextRelation[] },
  inputConceptIds: string[],
  semanticRelatedConceptIds: string[] = [],
) {
  const activeNodes = dataset.nodes.filter(
    (node) => node.deletedAt === null && !node.archivedAt,
  );
  const activeNodeIds = new Set(activeNodes.map((node) => node.id));
  const activeRelations = dataset.relations.filter((relation) =>
    activeNodeIds.has(relation.nodeId),
  );
  const conceptModel = createSuggestionConceptModel({
    contexts: dataset.contexts,
    availableConceptIds: new Set(
      activeRelations
        .filter((relation) => relation.relationType !== "CAPTURE_ASSOCIATION")
        .map((relation) => relation.contextId),
    ),
  });
  const presentConceptIds = resolveSuggestionPresentConceptIds({
    inputConceptIds,
    conceptModel,
  });
  const personalEvidence = createPersonalEvidence({
    concepts: dataset.contexts,
    captures: activeNodes,
    relations: activeRelations,
    now,
    recentWindowDays: DEFAULT_BEHAVIORAL_RECENT_WINDOW_DAYS,
  });
  const personalLearning = createPersonalLearning({ evidence: personalEvidence });
  const relationships = Array.from(presentConceptIds).flatMap((sourceConceptId) =>
    deriveConceptRelationships({
      sourceConceptId,
      contexts: dataset.contexts,
      nodes: activeNodes,
      relations: activeRelations,
      now,
      limit: 8,
    }),
  );

  return {
    conceptModel,
    personalEvidence,
    bundle: {
      relationships,
      personalLearning,
      semanticRelatedConceptIds,
    },
  };
}

function datasetFor(
  conceptIds: string[],
  captures: Array<[string, string, string, string?]>,
) {
  const contexts = conceptIds.map(context);
  const nodes = captures.map(([id, content, updatedAt, archivedAt]) =>
    node({ id, content, updatedAt, archivedAt: archivedAt ?? null }),
  );
  const relations = nodes.flatMap((memory) => relationsFor(memory.id, conceptIds));

  return { contexts, nodes, relations };
}

function context(id: string): Context {
  return {
    id,
    workspaceId: "workspace-1",
    type: "AREA",
    name: id
      .split("-")
      .map((part) => part[0]?.toLocaleUpperCase("es") + part.slice(1))
      .join(" "),
    description: null,
    aliases: [],
    normalizedAliases: [],
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
  };
}

function node({
  id,
  content,
  updatedAt,
  archivedAt,
}: {
  id: string;
  content: string;
  updatedAt: string;
  archivedAt?: string | null;
}): Node {
  return {
    id,
    workspaceId: "workspace-1",
    type: "NOTE",
    content,
    status: "ACTIVE",
    organizationStatus: "ORGANIZED",
    metadata: {},
    version: 1,
    createdAt: updatedAt,
    contentUpdatedAt: updatedAt,
    archivedAt: archivedAt ?? null,
    updatedAt,
    deletedAt: null,
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

function conceptTrace(
  traceContext: Context,
  overrides: Partial<ConceptSuggestionTrace> = {},
): ConceptSuggestionTrace {
  return {
    context: traceContext,
    queryTokens: [],
    contextTokens: [],
    relatedContentTokens: [],
    relatedCaptureIds: [],
    directMatches: 0,
    relatedMatches: 0,
    selectedBoost: 0,
    score: 0,
    threshold: 0.18,
    included: false,
    ...overrides,
  };
}
