import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import {
  DEFAULT_BEHAVIORAL_RECENT_WINDOW_DAYS,
  type BehavioralPattern,
} from "@/features/cognition/behavioral-engine/behavioral-engine";
import {
  createMemoryEvidenceModel,
  type MemoryEvidenceModel,
} from "@/features/cognition/memory-evidence/memory-evidence-model";
import { createPersonalLearning } from "@/features/cognition/personal-learning";
import type { ConceptSuggestionTrace } from "@/features/associations/association-types";
import type { KnowledgeSuggestion } from "@/features/cognition/knowledge-suggestions/knowledge-suggestions";
import type { MemoryEvolutionSignal } from "@/features/cognition/memory-evolution";
import type { SemanticStatement } from "@/features/cognition/semantic-understanding";
import {
  composeSuggestions,
  createSuggestionConceptModel,
  resolveSuggestionPresentConceptIds,
} from "@/features/cognition/suggestion-composer";
import {
  deriveConceptRelationships,
  type DerivedConceptRelationship,
} from "@/features/exploration/concept-relationships";

export interface DeriveKnowledgeSuggestionsOptions {
  inputConceptIds: string[];
  contexts: Context[];
  relations: NodeContextRelation[];
  nodes: Node[];
  now?: Date;
  limit?: number;
  behavioralEvidenceModel?: MemoryEvidenceModel;
  evolutionEvidenceModel?: MemoryEvidenceModel;
  semanticRelatedConceptIds?: string[];
  localText?: string;
  localConceptTraces?: ConceptSuggestionTrace[];
  precomputedEvidence?: KnowledgeSuggestionPrecomputedEvidence;
}

export interface KnowledgeSuggestionPrecomputedEvidence {
  relationships: DerivedConceptRelationship[];
  behavioralPatterns: BehavioralPattern[];
  semanticStatements: SemanticStatement[];
  evolutionSignals: MemoryEvolutionSignal[];
}

const RELATED_NOW_LIMIT_PER_SOURCE = 8;

/**
 * @deprecated Use SuggestionComposer with a complete precomputed bundle.
 */
export function deriveKnowledgeSuggestions({
  inputConceptIds,
  contexts,
  relations,
  nodes,
  now = new Date(),
  limit,
  behavioralEvidenceModel,
  evolutionEvidenceModel,
  semanticRelatedConceptIds = [],
  localText,
  localConceptTraces = [],
  precomputedEvidence,
}: DeriveKnowledgeSuggestionsOptions): KnowledgeSuggestion[] {
  const activeNodes = nodes.filter((node) => node.deletedAt === null && !node.archivedAt);
  const activeNodeIds = new Set(activeNodes.map((node) => node.id));
  const activeRelations = relations.filter((relation) =>
    activeNodeIds.has(relation.nodeId),
  );
  const conceptModel = createSuggestionConceptModel({
    contexts,
    availableConceptIds: getAvailableConceptIds(activeRelations),
  });
  const presentConceptIds = resolveSuggestionPresentConceptIds({
    inputConceptIds,
    conceptModel,
  });
  let fallbackEvidenceModel: MemoryEvidenceModel | null = null;
  let fallbackLearning: ReturnType<typeof createPersonalLearning> | null = null;
  const getFallbackEvidenceModel = () => {
    fallbackEvidenceModel ??= createMemoryEvidenceModel({
      contexts,
      relations: activeRelations,
      nodes: activeNodes,
      now,
      recentWindowDays: DEFAULT_BEHAVIORAL_RECENT_WINDOW_DAYS,
    });
    return fallbackEvidenceModel;
  };
  const personalEvidence =
    behavioralEvidenceModel ?? evolutionEvidenceModel ?? getFallbackEvidenceModel();
  const getFallbackLearning = () => {
    fallbackLearning ??= createPersonalLearning({
      evidence: behavioralEvidenceModel ?? evolutionEvidenceModel ?? getFallbackEvidenceModel(),
    });
    return fallbackLearning;
  };
  const relationships =
    precomputedEvidence?.relationships ??
    Array.from(presentConceptIds).flatMap((sourceConceptId) =>
      deriveConceptRelationships({
        sourceConceptId,
        contexts,
        relations: activeRelations,
        nodes: activeNodes,
        now,
        limit: RELATED_NOW_LIMIT_PER_SOURCE,
      }),
    );
  const personalLearning = precomputedEvidence
    ? {
        observedPatterns: precomputedEvidence.behavioralPatterns,
        observedRelations: precomputedEvidence.semanticStatements,
        temporalSignals: precomputedEvidence.evolutionSignals,
      }
    : getFallbackLearning();

  return composeSuggestions({
    inputConceptIds,
    conceptModel,
    personalEvidence,
    bundle: {
      relationships,
      personalLearning,
      semanticRelatedConceptIds,
    },
    now,
    limit,
    localText,
    localConceptTraces,
  });
}

function getAvailableConceptIds(relations: NodeContextRelation[]) {
  return new Set(
    relations
      .filter((relation) => relation.relationType !== "CAPTURE_ASSOCIATION")
      .map((relation) => relation.contextId),
  );
}
