import type { Context } from "@/domain/context/context";
import type { Node } from "@/domain/node/node";
import {
  DEFAULT_BEHAVIORAL_RECENT_WINDOW_DAYS,
  type BehavioralPattern,
} from "@/features/cognition/behavioral-engine/behavioral-engine";
import { deriveKnowledgeSuggestions, type KnowledgeSuggestion } from "@/features/cognition/knowledge-suggestions";
import {
  type MemoryEvolutionSignal,
} from "@/features/cognition/memory-evolution";
import { createPersonalEvidence } from "@/features/cognition/personal-evidence";
import { createPersonalLearning } from "@/features/cognition/personal-learning";
import type { SemanticStatement } from "@/features/cognition/semantic-understanding";
import { createConceptIdentity } from "@/features/concepts/concept-identity";
import { deriveConceptProfile, type ConceptProfile } from "@/features/exploration/concept-profile";
import { deriveConceptRelationships, type DerivedConceptRelationship } from "@/features/exploration/concept-relationships";
import { getCapturePreview } from "@/features/node/node-display";
import type { DeriveMemoryResponseOptions } from "@/features/cognition/orchestrator/memory-query";
import type { MemoryEvidence, MemoryResponse } from "@/features/cognition/orchestrator/memory-response";

const DEFAULT_RELATIONSHIP_LIMIT = 8;

export function deriveMemoryResponse({
  query,
  contexts,
  relations,
  nodes,
}: DeriveMemoryResponseOptions): MemoryResponse {
  const conceptsById = createConceptModel(contexts);
  const personalEvidence = createPersonalEvidence({
    concepts: contexts,
    relations,
    captures: nodes,
    now: query.now,
    recentWindowDays: DEFAULT_BEHAVIORAL_RECENT_WINDOW_DAYS,
  });
  const queryConceptIds = resolveQueryConceptIds({
    detectedConceptIds: query.detectedConceptIds,
    selectedConceptIds: query.selectedConceptIds,
    conceptsById,
  });
  const concepts = queryConceptIds
    .map((conceptId) => conceptsById.get(conceptId) ?? null)
    .filter((concept): concept is Context => concept !== null)
    .sort(compareConcepts);
  const profiles = dedupeProfiles(
    queryConceptIds
      .map((conceptId) =>
        deriveConceptProfile({
          currentContextId: conceptId,
          contexts,
          relations,
          nodes,
          now: query.now,
          personalEvidence,
        }),
      )
      .filter((profile): profile is ConceptProfile => profile !== null),
  );
  const relationships = dedupeRelationships(
    queryConceptIds.flatMap((conceptId) =>
      deriveConceptRelationships({
        sourceConceptId: conceptId,
        contexts,
        relations,
        nodes,
        now: query.now,
        limit: DEFAULT_RELATIONSHIP_LIMIT,
        personalEvidence,
      }),
    ),
  );
  const activeSuggestionNodes = nodes.filter(
    (node) => node.deletedAt === null && !node.archivedAt,
  );
  const activeSuggestionNodeIds = new Set(activeSuggestionNodes.map((node) => node.id));
  const activeSuggestionRelations = relations.filter((relation) =>
    activeSuggestionNodeIds.has(relation.nodeId),
  );
  const suggestionRelationships = queryConceptIds.flatMap((conceptId) =>
    deriveConceptRelationships({
      sourceConceptId: conceptId,
      contexts,
      relations: activeSuggestionRelations,
      nodes: activeSuggestionNodes,
      now: query.now,
      limit: DEFAULT_RELATIONSHIP_LIMIT,
    }),
  );
  const personalLearning = createPersonalLearning({ evidence: personalEvidence });
  const behavioralPatterns = dedupeBehavioralPatterns(
    personalLearning.observedPatterns,
  );
  const semanticStatements = dedupeSemanticStatements(
    personalLearning.observedRelations,
  );
  const evolutionSignals = dedupeEvolutionSignals(
    personalLearning.temporalSignals,
  );
  const suggestions = dedupeSuggestions(
    deriveKnowledgeSuggestions({
      inputConceptIds: queryConceptIds,
      contexts,
      relations,
      nodes,
      now: query.now,
      behavioralEvidenceModel: personalEvidence,
      evolutionEvidenceModel: personalEvidence,
      precomputedEvidence: {
        relationships: suggestionRelationships,
        behavioralPatterns,
        semanticStatements,
        evolutionSignals,
      },
    }),
  );
  const evidence = collectEvidence({
    nodes,
    profiles,
    relationships,
    behavioralPatterns,
    semanticStatements,
    evolutionSignals,
    suggestions,
  });

  return {
    concepts,
    profiles,
    relationships,
    behavioralPatterns,
    semanticStatements,
    evolutionSignals,
    suggestions,
    evidence,
    summary: {
      totalConcepts: concepts.length,
      totalRelationships: relationships.length,
      activeSuggestions: suggestions.filter(
        (suggestion) => suggestion.confidence !== "LOW",
      ).length,
      activePatterns: behavioralPatterns.filter(
        (pattern) => pattern.strength !== "WEAK",
      ).length,
      evolutionSignals: evolutionSignals.length,
      explicitStatements: semanticStatements.filter(
        (statement) => statement.evidenceLevel !== "CONTEXTUAL",
      ).length,
      evidenceNodes: evidence.length,
    },
  };
}

function createConceptModel(contexts: Context[]) {
  const byId = new Map<string, Context>();
  const canonicalIdByIdentityLabel = new Map<string, string>();

  for (const context of contexts) {
    byId.set(context.id, context);
  }

  for (const context of Array.from(byId.values()).sort(compareConcepts)) {
    const identity = createConceptIdentity(context);

    if (identity.normalizedCanonicalLabel) {
      canonicalIdByIdentityLabel.set(identity.normalizedCanonicalLabel, context.id);
    }
  }

  for (const context of Array.from(byId.values()).sort(compareConcepts)) {
    const identity = createConceptIdentity(context);

    for (const label of identity.normalizedAliases.filter(Boolean)) {
      canonicalIdByIdentityLabel.set(label, context.id);
    }
  }

  return {
    get(conceptId: string) {
      const context = byId.get(conceptId);

      if (!context) {
        return null;
      }

      const identity = createConceptIdentity(context);
      const canonicalId =
        canonicalIdByIdentityLabel.get(identity.normalizedCanonicalLabel) ??
        context.id;

      return byId.get(canonicalId) ?? context;
    },
  };
}

function resolveQueryConceptIds({
  detectedConceptIds,
  selectedConceptIds,
  conceptsById,
}: {
  detectedConceptIds: string[];
  selectedConceptIds: string[];
  conceptsById: ReturnType<typeof createConceptModel>;
}) {
  const conceptIds = new Set<string>();

  for (const conceptId of [...detectedConceptIds, ...selectedConceptIds]) {
    const concept = conceptsById.get(conceptId);

    if (concept) {
      conceptIds.add(concept.id);
    }
  }

  return Array.from(conceptIds).sort();
}

function dedupeProfiles(profiles: ConceptProfile[]) {
  return Array.from(
    new Map(profiles.map((profile) => [profile.concept.id, profile])).values(),
  ).sort((first, second) =>
    first.concept.canonicalLabel.localeCompare(second.concept.canonicalLabel) ||
    first.concept.id.localeCompare(second.concept.id),
  );
}

function dedupeRelationships(relationships: DerivedConceptRelationship[]) {
  const byPair = new Map<string, DerivedConceptRelationship>();

  for (const relationship of relationships) {
    const key = relationshipKey(relationship);
    const current = byPair.get(key);

    if (!current || relationship.score > current.score) {
      byPair.set(key, relationship);
    }
  }

  return Array.from(byPair.values()).sort(compareRelationships);
}

function relationshipKey(relationship: DerivedConceptRelationship) {
  return [relationship.sourceConceptId, relationship.targetConceptId].sort().join(":");
}

function dedupeBehavioralPatterns(patterns: BehavioralPattern[]) {
  return Array.from(new Map(patterns.map((pattern) => [pattern.id, pattern])).values())
    .sort(compareBehavioralPatterns);
}

function dedupeSemanticStatements(statements: SemanticStatement[]) {
  return Array.from(
    new Map(statements.map((statement) => [statement.id, statement])).values(),
  ).sort(compareSemanticStatements);
}

function dedupeEvolutionSignals(signals: MemoryEvolutionSignal[]) {
  return Array.from(new Map(signals.map((signal) => [signal.id, signal])).values())
    .sort(compareEvolutionSignals);
}

function dedupeSuggestions(suggestions: KnowledgeSuggestion[]) {
  return Array.from(
    new Map(suggestions.map((suggestion) => [suggestion.id, suggestion])).values(),
  ).sort(compareSuggestions);
}

function collectEvidence({
  nodes,
  profiles,
  relationships,
  behavioralPatterns,
  semanticStatements,
  evolutionSignals,
  suggestions,
}: {
  nodes: Node[];
  profiles: ConceptProfile[];
  relationships: DerivedConceptRelationship[];
  behavioralPatterns: BehavioralPattern[];
  semanticStatements: SemanticStatement[];
  evolutionSignals: MemoryEvolutionSignal[];
  suggestions: KnowledgeSuggestion[];
}) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const evidenceByNodeId = new Map<string, MemoryEvidence>();

  for (const profile of profiles) {
    for (const memory of profile.representativeMemories) {
      addEvidence(evidenceByNodeId, {
        nodeId: memory.nodeId,
        excerpt: memory.excerpt,
        createdAt: memory.createdAt,
        identityLabels: memory.identityLabels,
        sources: ["PROFILE"],
      });
    }
  }

  for (const relationship of relationships) {
    for (const evidence of relationship.evidence) {
      addEvidence(evidenceByNodeId, {
        ...evidence,
        sources: ["RELATIONSHIP"],
      });
    }
  }

  for (const pattern of behavioralPatterns) {
    addNodeEvidence({
      evidenceByNodeId,
      nodesById,
      nodeIds: pattern.evidenceNodeIds,
      source: "BEHAVIORAL",
    });
  }

  for (const statement of semanticStatements) {
    for (const evidence of statement.evidence) {
      addEvidence(evidenceByNodeId, {
        nodeId: evidence.nodeId,
        excerpt: evidence.excerpt,
        createdAt: evidence.createdAt,
        identityLabels: [statement.sourceLabel, statement.targetLabel],
        sources: ["SEMANTIC"],
      });
    }
  }

  for (const signal of evolutionSignals) {
    addNodeEvidence({
      evidenceByNodeId,
      nodesById,
      nodeIds: signal.evidenceNodeIds,
      source: "EVOLUTION",
    });
  }

  for (const suggestion of suggestions) {
    addNodeEvidence({
      evidenceByNodeId,
      nodesById,
      nodeIds: suggestion.evidenceNodeIds,
      source: "SUGGESTION",
      identityLabels: [suggestion.canonicalLabel],
    });
  }

  return Array.from(evidenceByNodeId.values()).sort(compareEvidence);
}

function addNodeEvidence({
  evidenceByNodeId,
  nodesById,
  nodeIds,
  source,
  identityLabels = [],
}: {
  evidenceByNodeId: Map<string, MemoryEvidence>;
  nodesById: Map<string, Node>;
  nodeIds: string[];
  source: MemoryEvidence["sources"][number];
  identityLabels?: string[];
}) {
  for (const nodeId of nodeIds) {
    const node = nodesById.get(nodeId);

    if (!node) {
      continue;
    }

    addEvidence(evidenceByNodeId, {
      nodeId,
      excerpt: getCapturePreview(node.content, { maxLength: 190 }),
      createdAt: new Date(node.contentUpdatedAt ?? node.updatedAt),
      identityLabels,
      sources: [source],
    });
  }
}

function addEvidence(
  evidenceByNodeId: Map<string, MemoryEvidence>,
  evidence: MemoryEvidence,
) {
  const current = evidenceByNodeId.get(evidence.nodeId);

  if (!current) {
    evidenceByNodeId.set(evidence.nodeId, {
      ...evidence,
      identityLabels: uniqueStrings(evidence.identityLabels),
      sources: uniqueSources(evidence.sources),
    });
    return;
  }

  evidenceByNodeId.set(evidence.nodeId, {
    nodeId: current.nodeId,
    excerpt: current.excerpt || evidence.excerpt,
    createdAt:
      current.createdAt.getTime() >= evidence.createdAt.getTime()
        ? current.createdAt
        : evidence.createdAt,
    identityLabels: uniqueStrings([
      ...current.identityLabels,
      ...evidence.identityLabels,
    ]),
    sources: uniqueSources([...current.sources, ...evidence.sources]),
  });
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function uniqueSources(values: MemoryEvidence["sources"]) {
  const order: MemoryEvidence["sources"] = [
    "PROFILE",
    "RELATIONSHIP",
    "BEHAVIORAL",
    "SEMANTIC",
    "EVOLUTION",
    "SUGGESTION",
  ];
  const set = new Set(values);

  return order.filter((value) => set.has(value));
}

function compareConcepts(first: Context, second: Context) {
  return first.name.localeCompare(second.name) || first.id.localeCompare(second.id);
}

function compareRelationships(
  first: DerivedConceptRelationship,
  second: DerivedConceptRelationship,
) {
  return (
    second.score - first.score ||
    second.evidence.length - first.evidence.length ||
    relationshipKey(first).localeCompare(relationshipKey(second))
  );
}

function compareBehavioralPatterns(first: BehavioralPattern, second: BehavioralPattern) {
  return (
    strengthRank(second.strength) - strengthRank(first.strength) ||
    second.evidenceNodeIds.length - first.evidenceNodeIds.length ||
    first.id.localeCompare(second.id)
  );
}

function compareSemanticStatements(first: SemanticStatement, second: SemanticStatement) {
  return (
    confidenceRank(second.confidence) - confidenceRank(first.confidence) ||
    second.evidence.length - first.evidence.length ||
    first.id.localeCompare(second.id)
  );
}

function compareEvolutionSignals(
  first: MemoryEvolutionSignal,
  second: MemoryEvolutionSignal,
) {
  return (
    strengthRank(second.strength) - strengthRank(first.strength) ||
    second.evidenceNodeIds.length - first.evidenceNodeIds.length ||
    first.id.localeCompare(second.id)
  );
}

function compareSuggestions(first: KnowledgeSuggestion, second: KnowledgeSuggestion) {
  return (
    confidenceRank(second.confidence) - confidenceRank(first.confidence) ||
    second.evidenceNodeIds.length - first.evidenceNodeIds.length ||
    first.id.localeCompare(second.id)
  );
}

function compareEvidence(first: MemoryEvidence, second: MemoryEvidence) {
  return (
    second.sources.length - first.sources.length ||
    second.createdAt.getTime() - first.createdAt.getTime() ||
    first.nodeId.localeCompare(second.nodeId)
  );
}

function strengthRank(strength: "WEAK" | "MEDIUM" | "STRONG") {
  return strength === "STRONG" ? 3 : strength === "MEDIUM" ? 2 : 1;
}

function confidenceRank(confidence: "LOW" | "MEDIUM" | "HIGH") {
  return confidence === "HIGH" ? 3 : confidence === "MEDIUM" ? 2 : 1;
}
