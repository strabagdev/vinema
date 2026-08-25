import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import {
  DEFAULT_BEHAVIORAL_RECENT_WINDOW_DAYS,
  deriveBehavioralPatterns,
} from "@/features/cognition/behavioral-engine/behavioral-engine";
import {
  DEFAULT_DORMANT_DAYS,
  DEFAULT_RECENT_WINDOW_DAYS,
  deriveMemoryEvolutionSignals,
} from "@/features/cognition/memory-evolution";
import { deriveSemanticStatements } from "@/features/cognition/semantic-understanding";
import {
  createMemoryEvidenceModel,
  type MemoryEvidenceModel,
} from "@/features/cognition/memory-evidence/memory-evidence-model";
import type {
  ConceptSuggestionTrace,
} from "@/features/associations/association-types";
import { hasLocalConceptIdentitySupport } from "@/features/associations/local-support";
import type {
  KnowledgeSuggestion,
  KnowledgeSuggestionConfidence,
  KnowledgeSuggestionKind,
} from "@/features/cognition/knowledge-suggestions/knowledge-suggestions";
import { createConceptIdentity, normalizeConceptIdentityLabel } from "@/features/concepts/concept-identity";
import { deriveConceptRelationships } from "@/features/exploration/concept-relationships";

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
}

type SuggestionBucket = {
  kind: KnowledgeSuggestionKind;
  conceptId: string;
  canonicalLabel: string;
  score: number;
  recurrence: number;
  reasons: Set<string>;
  evidenceNodeIds: Set<string>;
};

type ConceptRecord = {
  context: Context;
  identityLabels: Set<string>;
};

const DEFAULT_LIMIT = 8;
const RELATED_NOW_LIMIT_PER_SOURCE = 8;
const CONFIDENCE_HIGH_SCORE = 7;
const CONFIDENCE_MEDIUM_SCORE = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const REVISIT_INACTIVE_DAYS = 90;
type LocalConceptSupport =
  | {
      required: false;
    }
  | {
      required: true;
      supportedConceptIds: Set<string>;
      text?: string;
      model: ReturnType<typeof createKnowledgeModel>;
      identitySupportCache: Map<string, boolean>;
    };

export function deriveKnowledgeSuggestions({
  inputConceptIds,
  contexts,
  relations,
  nodes,
  now = new Date(),
  limit = DEFAULT_LIMIT,
  behavioralEvidenceModel,
  evolutionEvidenceModel,
  semanticRelatedConceptIds = [],
  localText,
  localConceptTraces = [],
}: DeriveKnowledgeSuggestionsOptions): KnowledgeSuggestion[] {
  if (limit <= 0) {
    return [];
  }

  const activeNodes = nodes.filter((node) => node.deletedAt === null && !node.archivedAt);
  const activeNodeIds = new Set(activeNodes.map((node) => node.id));
  const activeRelations = relations.filter((relation) =>
    activeNodeIds.has(relation.nodeId),
  );
  const model = createKnowledgeModel({
    contexts,
    nodes: activeNodes,
    relations: activeRelations,
  });
  const presentConceptIds = resolvePresentConceptIds(inputConceptIds, model);
  const localSupport = createLocalConceptSupport({
    text: localText,
    traces: localConceptTraces,
    semanticRelatedConceptIds,
    model,
  });

  if (presentConceptIds.size === 0) {
    return [];
  }

  const buckets = new Map<string, SuggestionBucket>();
  const relationships = Array.from(presentConceptIds).flatMap((sourceConceptId) =>
      deriveConceptRelationships({
        sourceConceptId,
        contexts,
        relations: activeRelations,
        nodes: activeNodes,
        now,
        limit: RELATED_NOW_LIMIT_PER_SOURCE,
      }),
    );
  const behavioralPatterns = deriveBehavioralPatterns({
    contexts,
    relations: activeRelations,
    nodes: activeNodes,
    now,
    evidenceModel:
      behavioralEvidenceModel ??
      createMemoryEvidenceModel({
        contexts,
        relations: activeRelations,
        nodes: activeNodes,
        now,
        recentWindowDays: DEFAULT_BEHAVIORAL_RECENT_WINDOW_DAYS,
      }),
  });
  const semanticStatements = deriveSemanticStatements({
    contexts,
    relations: activeRelations,
    nodes: activeNodes,
    now,
  });
  const evolutionSignals = deriveMemoryEvolutionSignals({
    contexts,
    relations: activeRelations,
    nodes: activeNodes,
    now,
    evidenceModel:
      evolutionEvidenceModel ??
      createMemoryEvidenceModel({
        contexts,
        relations: activeRelations,
        nodes: activeNodes,
        now,
        recentWindowDays: DEFAULT_RECENT_WINDOW_DAYS,
        dormantDays: DEFAULT_DORMANT_DAYS,
      }),
  });

  for (const relationship of relationships) {
    if (!canSuggestConcept(relationship.targetConceptId, presentConceptIds, model)) {
      continue;
    }

    if (!hasLocalSupport(relationship.targetConceptId, localSupport)) {
      continue;
    }

    addSignal(buckets, {
      kind: "RELATED_NOW",
      conceptId: relationship.targetConceptId,
      canonicalLabel: relationship.targetLabel,
      score: relationship.strength === "STRONG" ? 6 : relationship.strength === "MEDIUM" ? 4 : 1,
      recurrence: relationship.sharedMemoryCount,
      reasons: [
        relationship.strength === "STRONG"
          ? "Relación fuerte observada"
          : "Relación observada",
      ],
      evidenceNodeIds: relationship.evidence.map((item) => item.nodeId),
    });

    if (
      relationship.lastSharedAt &&
      now.getTime() - relationship.lastSharedAt.getTime() >=
        REVISIT_INACTIVE_DAYS * DAY_MS
    ) {
      addSignal(buckets, {
        kind: "REVISIT",
        conceptId: relationship.targetConceptId,
        canonicalLabel: relationship.targetLabel,
        score: relationship.strength === "STRONG" ? 7 : 5,
        recurrence: relationship.sharedMemoryCount,
        reasons: ["Existe memoria previa que podría ser relevante"],
        evidenceNodeIds: relationship.evidence.map((item) => item.nodeId),
      });
    }
  }

  for (const pattern of behavioralPatterns) {
    const presentCount = pattern.conceptIds.filter((conceptId) =>
      presentConceptIds.has(resolveCanonicalConceptId(conceptId, model)),
    ).length;

    if (presentCount === 0) {
      continue;
    }

    for (const conceptId of pattern.conceptIds) {
      const canonicalConceptId = resolveCanonicalConceptId(conceptId, model);

      if (!canSuggestConcept(canonicalConceptId, presentConceptIds, model)) {
        continue;
      }

      if (!hasLocalSupport(canonicalConceptId, localSupport)) {
        continue;
      }

      const context = model.recordsById.get(canonicalConceptId)?.context;

      if (!context) {
        continue;
      }

      addSignal(buckets, {
        kind: pattern.kind === "DECLINING_RELATIONSHIP" ? "REVISIT" : "RELATED_NOW",
        conceptId: canonicalConceptId,
        canonicalLabel: context.name,
        score: pattern.strength === "STRONG" ? 5 : pattern.strength === "MEDIUM" ? 3 : 1,
        recurrence: pattern.metrics.totalOccurrences,
        reasons: [
          pattern.kind === "DECLINING_RELATIONSHIP"
            ? "Relación que podría valer la pena retomar"
            : "Patrón recurrente en tu memoria",
        ],
        evidenceNodeIds: pattern.evidenceNodeIds,
      });

      if (pattern.kind === "RECURRING_CLUSTER" && presentCount >= 2) {
        addSignal(buckets, {
          kind: "MISSING_CONTEXT",
          conceptId: canonicalConceptId,
          canonicalLabel: context.name,
          score: pattern.strength === "STRONG" ? 8 : 6,
          recurrence: pattern.metrics.totalOccurrences,
          reasons: ["Suele formar parte de este mismo contexto"],
          evidenceNodeIds: pattern.evidenceNodeIds,
        });
      }
    }
  }

  for (const statement of semanticStatements) {
    if (
      statement.hasContradictoryEvidence ||
      statement.confidence === "LOW"
    ) {
      continue;
    }

    const pairs = [
      {
        sourceConceptId: statement.sourceConceptId,
        targetConceptId: statement.targetConceptId,
        targetLabel: statement.targetLabel,
      },
      {
        sourceConceptId: statement.targetConceptId,
        targetConceptId: statement.sourceConceptId,
        targetLabel: statement.sourceLabel,
      },
    ];

    for (const pair of pairs) {
      const sourceConceptId = resolveCanonicalConceptId(pair.sourceConceptId, model);
      const targetConceptId = resolveCanonicalConceptId(pair.targetConceptId, model);

      if (
        !presentConceptIds.has(sourceConceptId) ||
        !canSuggestConcept(targetConceptId, presentConceptIds, model) ||
        !hasLocalSupport(targetConceptId, localSupport)
      ) {
        continue;
      }

      addSignal(buckets, {
        kind: "RELATED_NOW",
        conceptId: targetConceptId,
        canonicalLabel:
          model.recordsById.get(targetConceptId)?.context.name ?? pair.targetLabel,
        score: statement.confidence === "HIGH" ? 4 : 2,
        recurrence: statement.evidence.length,
        reasons: ["Significado observado en tus capturas"],
        evidenceNodeIds: statement.evidence.map((item) => item.nodeId),
      });
    }
  }

  for (const signal of evolutionSignals) {
    const conceptId = resolveCanonicalConceptId(signal.conceptId, model);

    if (
      !canSuggestConcept(conceptId, presentConceptIds, model) ||
      !hasLocalSupport(conceptId, localSupport) ||
      (signal.kind !== "DORMANT_CONCEPT" &&
        signal.kind !== "REVIVED_CONCEPT" &&
        signal.kind !== "DECLINING_CONCEPT")
    ) {
      continue;
    }

    const connectedToPresent = signal.metrics.recentTopConnections
      .concat(signal.metrics.historicalTopConnections)
      .some((connectionId) =>
        presentConceptIds.has(resolveCanonicalConceptId(connectionId, model)),
      );

    if (!connectedToPresent) {
      continue;
    }

    addSignal(buckets, {
      kind: "REVISIT",
      conceptId,
      canonicalLabel:
        model.recordsById.get(conceptId)?.context.name ?? signal.canonicalLabel,
      score: signal.strength === "STRONG" ? 5 : signal.strength === "MEDIUM" ? 3 : 1,
      recurrence: signal.metrics.totalMemories,
      reasons: [
        signal.kind === "REVIVED_CONCEPT"
          ? "Volvió a aparecer después de un tiempo"
          : "Existe memoria previa que podría ser relevante",
      ],
      evidenceNodeIds: signal.evidenceNodeIds,
    });
  }

  for (const candidateConceptId of semanticRelatedConceptIds) {
    const conceptId = resolveCanonicalConceptId(candidateConceptId, model);
    const context = model.recordsById.get(conceptId)?.context;

    if (
      !context ||
      !canSuggestConcept(conceptId, presentConceptIds, model) ||
      !hasLocalSupport(conceptId, localSupport)
    ) {
      continue;
    }

    addSignal(buckets, {
      kind: "RELATED_NOW",
      conceptId,
      canonicalLabel: context.name,
      score: 3,
      recurrence: 1,
      reasons: ["Contenido relacionado por significado."],
      evidenceNodeIds: [],
    });
  }

  return mergeSuggestionKinds(buckets)
    .map(toKnowledgeSuggestion)
    .sort(compareKnowledgeSuggestions)
    .slice(0, limit);
}

function addSignal(
  buckets: Map<string, SuggestionBucket>,
  signal: {
    kind: KnowledgeSuggestionKind;
    conceptId: string;
    canonicalLabel: string;
    score: number;
    recurrence: number;
    reasons: string[];
    evidenceNodeIds: string[];
  },
) {
  const key = `${signal.kind}:${signal.conceptId}`;
  const bucket =
    buckets.get(key) ??
    {
      kind: signal.kind,
      conceptId: signal.conceptId,
      canonicalLabel: signal.canonicalLabel,
      score: 0,
      recurrence: 0,
      reasons: new Set<string>(),
      evidenceNodeIds: new Set<string>(),
    };

  bucket.score += signal.score;
  bucket.recurrence += signal.recurrence;

  for (const reason of signal.reasons) {
    bucket.reasons.add(reason);
  }

  for (const nodeId of signal.evidenceNodeIds) {
    bucket.evidenceNodeIds.add(nodeId);
  }

  buckets.set(key, bucket);
}

function mergeSuggestionKinds(buckets: Map<string, SuggestionBucket>) {
  const byConcept = new Map<string, SuggestionBucket>();

  for (const bucket of buckets.values()) {
    const current = byConcept.get(bucket.conceptId);

    if (!current || compareBuckets(bucket, current) < 0) {
      byConcept.set(bucket.conceptId, bucket);
    }
  }

  return Array.from(byConcept.values());
}

function toKnowledgeSuggestion(bucket: SuggestionBucket): KnowledgeSuggestion {
  return {
    id: `knowledge:${bucket.kind.toLocaleLowerCase("en-US")}:${bucket.conceptId}`,
    kind: bucket.kind,
    conceptId: bucket.conceptId,
    canonicalLabel: bucket.canonicalLabel,
    confidence: getConfidence(bucket),
    reasons: Array.from(bucket.reasons).sort(),
    evidenceNodeIds: Array.from(bucket.evidenceNodeIds).sort(),
  };
}

function getConfidence(bucket: SuggestionBucket): KnowledgeSuggestionConfidence {
  const evidenceBoost = Math.min(2, bucket.evidenceNodeIds.size);
  const total = bucket.score + evidenceBoost;

  if (total >= CONFIDENCE_HIGH_SCORE) {
    return "HIGH";
  }

  if (total >= CONFIDENCE_MEDIUM_SCORE) {
    return "MEDIUM";
  }

  return "LOW";
}

function compareKnowledgeSuggestions(first: KnowledgeSuggestion, second: KnowledgeSuggestion) {
  return (
    confidenceRank(second.confidence) - confidenceRank(first.confidence) ||
    second.evidenceNodeIds.length - first.evidenceNodeIds.length ||
    kindRank(first.kind) - kindRank(second.kind) ||
    first.canonicalLabel.localeCompare(second.canonicalLabel) ||
    first.conceptId.localeCompare(second.conceptId)
  );
}

function compareBuckets(first: SuggestionBucket, second: SuggestionBucket) {
  return (
    confidenceRank(getConfidence(second)) - confidenceRank(getConfidence(first)) ||
    second.evidenceNodeIds.size - first.evidenceNodeIds.size ||
    kindRank(first.kind) - kindRank(second.kind) ||
    second.score - first.score ||
    first.canonicalLabel.localeCompare(second.canonicalLabel) ||
    first.conceptId.localeCompare(second.conceptId)
  );
}

function confidenceRank(confidence: KnowledgeSuggestionConfidence) {
  return confidence === "HIGH" ? 3 : confidence === "MEDIUM" ? 2 : 1;
}

function kindRank(kind: KnowledgeSuggestionKind) {
  return kind === "REVISIT" ? 1 : kind === "MISSING_CONTEXT" ? 2 : 3;
}

function canSuggestConcept(
  conceptId: string,
  presentConceptIds: Set<string>,
  model: ReturnType<typeof createKnowledgeModel>,
) {
  return (
    !presentConceptIds.has(conceptId) &&
    model.recordsById.has(conceptId)
  );
}

function createLocalConceptSupport({
  text,
  traces,
  semanticRelatedConceptIds,
  model,
}: {
  text?: string;
  traces: ConceptSuggestionTrace[];
  semanticRelatedConceptIds: string[];
  model: ReturnType<typeof createKnowledgeModel>;
}): LocalConceptSupport {
  if (!text && traces.length === 0 && semanticRelatedConceptIds.length === 0) {
    return { required: false };
  }

  const supportedConceptIds = new Set<string>();

  for (const trace of traces) {
    if (trace.included || trace.directMatches > 0 || trace.matchedAlias) {
      supportedConceptIds.add(resolveCanonicalConceptId(trace.context.id, model));
    }
  }

  if (!text) {
    for (const conceptId of semanticRelatedConceptIds) {
      supportedConceptIds.add(resolveCanonicalConceptId(conceptId, model));
    }
  }

  return {
    required: true,
    supportedConceptIds,
    text,
    model,
    identitySupportCache: new Map(),
  };
}

function hasLocalSupport(conceptId: string, support: LocalConceptSupport) {
  if (!support.required) {
    return true;
  }

  if (support.supportedConceptIds.has(conceptId)) {
    return true;
  }

  if (!support.text) {
    return false;
  }

  const cached = support.identitySupportCache.get(conceptId);
  if (cached !== undefined) {
    return cached;
  }

  const record = support.model.recordsById.get(conceptId);
  const supported = record
    ? hasLocalConceptIdentitySupport({
        localText: support.text,
        labels: [
          record.context.name,
          ...(record.context.aliases ?? []),
          ...(record.context.normalizedAliases ?? []),
        ],
      })
    : false;

  support.identitySupportCache.set(conceptId, supported);

  return supported;
}

function resolvePresentConceptIds(
  inputConceptIds: string[],
  model: ReturnType<typeof createKnowledgeModel>,
) {
  return new Set(
    inputConceptIds
      .map((conceptId) => resolveCanonicalConceptId(conceptId, model))
      .filter((conceptId) => model.recordsById.has(conceptId))
      .sort(),
  );
}

function resolveCanonicalConceptId(
  conceptId: string,
  model: ReturnType<typeof createKnowledgeModel>,
) {
  const record = model.recordsById.get(conceptId);

  if (!record) {
    return conceptId;
  }

  for (const label of record.identityLabels) {
    const canonicalId = model.conceptIdByIdentityLabel.get(label);

    if (canonicalId) {
      return canonicalId;
    }
  }

  return conceptId;
}

function createKnowledgeModel({
  contexts,
  nodes,
  relations,
}: {
  contexts: Context[];
  nodes: Node[];
  relations: NodeContextRelation[];
}) {
  const recordsById = new Map<string, ConceptRecord>();
  const conceptIdByIdentityLabel = new Map<string, string>();
  const activeNodesById = new Map(
    nodes
      .filter((node) => node.deletedAt === null && !node.archivedAt)
      .map((node) => [node.id, node]),
  );
  const relatedContextIds = new Set(
    relations
      .filter(
        (relation) =>
          relation.relationType !== "CAPTURE_ASSOCIATION" &&
          activeNodesById.has(relation.nodeId),
      )
      .map((relation) => relation.contextId),
  );

  for (const context of contexts) {
    if (!relatedContextIds.has(context.id)) {
      continue;
    }

    const identity = createConceptIdentity(context);
    const identityLabels = new Set(
      [
        identity.normalizedCanonicalLabel,
        ...identity.aliases.map(normalizeConceptIdentityLabel),
        ...identity.normalizedAliases,
      ].filter(Boolean),
    );

    recordsById.set(context.id, {
      context,
      identityLabels,
    });

    for (const label of Array.from(identityLabels).sort()) {
      if (!conceptIdByIdentityLabel.has(label)) {
        conceptIdByIdentityLabel.set(label, context.id);
      }
    }
  }

  return {
    recordsById,
    conceptIdByIdentityLabel,
  };
}
