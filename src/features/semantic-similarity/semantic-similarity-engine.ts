import type { Node } from "@/domain/node/node";
import type { NodeRepository } from "@/domain/node/node-repository";
import type { Context } from "@/domain/context/context";
import type { MemoryEvidenceModel } from "@/features/cognition/memory-evidence/memory-evidence-model";
import {
  buildConceptSemanticRepresentations,
} from "@/features/semantic-similarity/concept-representation";
import type {
  EmbeddingRepository,
  EmbeddingRuntime,
  EmbeddingSourceType,
} from "@/features/semantic-similarity/embedding-types";
import { captureMarkdownToEmbeddingText } from "@/features/semantic-similarity/embedding-text";
import { SemanticVectorIndex } from "@/features/semantic-similarity/semantic-vector-index";
import { normalizeConceptIdentityLabel } from "@/features/concepts/concept-identity";

const DEFAULT_TOP_K = 5;
const MIN_INTERNAL_SIMILARITY = 0.18;
const MIN_SEARCH_SEMANTIC_SIMILARITY = 0.76;
const CONCEPT_IDENTITY_SIMILARITY_WEIGHT = 0.78;
const CONCEPT_EVIDENCE_SIMILARITY_WEIGHT = 0.22;
const EVIDENCE_DOMINANCE_PENALTY_WEIGHT = 0.35;
const EVIDENCE_DOMINANCE_MARGIN = 0.05;
const MAX_EVIDENCE_DOMINATED_MATCHES_PER_SOURCE = 2;
const CONTEXTUAL_EVIDENCE_DRAG_PENALTY = 0.65;
const CLEAR_LOCAL_IDENTITY_MARGIN = 0.025;
const HUMAN_ENTITY_TERMS = new Set([
  "persona",
  "personas",
  "peaton",
  "peatones",
  "trabajador",
  "trabajadores",
  "usuario",
  "usuarios",
]);
const LOCAL_SUPPORT_STOPWORDS = new Set([
  "de",
  "del",
  "la",
  "las",
  "el",
  "los",
  "un",
  "una",
  "unos",
  "unas",
  "a",
  "en",
  "por",
  "para",
  "con",
  "sin",
  "y",
  "o",
]);

export type SemanticSimilarityPolicy = "search" | "discovery";

export type SemanticSimilarityEvidence = {
  source: "LOCAL_EMBEDDING";
  sourceType: EmbeddingSourceType;
  targetType: EmbeddingSourceType;
  modelId: string;
  modelVersion: string;
  dimensions: number;
  similarity: number;
  rank: number;
  marginToNext: number | null;
};

export type SemanticSimilarityMatch = {
  node: Node;
  evidence: SemanticSimilarityEvidence;
};

export type SemanticConceptSimilarityMatch = {
  concept: Context;
  representationText: string;
  identityText: string;
  evidenceText: string;
  evidenceNodeIds: string[];
  conceptSimilarity: number;
  evidenceSimilarity: number | null;
  evidence: SemanticSimilarityEvidence;
};

export class SemanticSimilarityEngine {
  constructor(
    private readonly options: {
      repository: EmbeddingRepository;
      nodeRepository: NodeRepository;
      runtime: EmbeddingRuntime;
    },
  ) {}

  async findSimilarCaptures(input: {
    workspaceId: string;
    text: string;
    currentNodeId?: string;
    topK?: number;
    policy?: SemanticSimilarityPolicy;
  }): Promise<SemanticSimilarityMatch[]> {
    const normalizedText = captureMarkdownToEmbeddingText(input.text);

    if (!normalizedText) {
      return [];
    }

    const queryVector = await this.options.runtime.embed(normalizedText, "query");
    const readyRecords = await this.options.repository.listReadyByWorkspace({
      workspaceId: input.workspaceId,
      modelId: this.options.runtime.metadata.modelId,
      modelVersion: this.options.runtime.metadata.modelVersion,
      dimensions: this.options.runtime.metadata.dimensions,
      sourceType: "capture",
    });
    const activeNodes = await this.options.nodeRepository.listByWorkspace(input.workspaceId);
    const nodesById = new Map(
      activeNodes
        .filter(
          (node) =>
            node.deletedAt === null &&
            !node.archivedAt &&
            node.organizationStatus === "ORGANIZED",
        )
        .map((node) => [node.id, node]),
    );
    const index = new SemanticVectorIndex(
      readyRecords
        .filter((record) => record.vector !== null && nodesById.has(record.sourceId))
        .map((record) => ({
          id: record.sourceId,
          vector: record.vector as Float32Array,
        })),
    );
    const matches = index.search({
      vector: queryVector,
      topK: input.topK ?? DEFAULT_TOP_K,
      excludeIds: input.currentNodeId ? new Set([input.currentNodeId]) : undefined,
    });

    return matches
      .filter((match) => match.score >= getMinimumSimilarity(input.policy))
      .flatMap((match): SemanticSimilarityMatch[] => {
        const node = nodesById.get(match.id);

        if (!node) {
          return [];
        }

        return [
          {
            node,
            evidence: {
              source: "LOCAL_EMBEDDING",
              sourceType: "capture",
              targetType: "capture",
              modelId: this.options.runtime.metadata.modelId,
              modelVersion: this.options.runtime.metadata.modelVersion,
              dimensions: this.options.runtime.metadata.dimensions,
              similarity: match.score,
              rank: match.rank,
              marginToNext: match.marginToNext,
            },
          },
        ];
      });
  }

  async findSimilarConceptsForCapture(input: {
    workspaceId: string;
    text: string;
    evidenceModel: MemoryEvidenceModel;
    excludeConceptIds?: Set<string>;
    topK?: number;
  }): Promise<SemanticConceptSimilarityMatch[]> {
    const normalizedText = captureMarkdownToEmbeddingText(input.text);

    if (!normalizedText) {
      return [];
    }

    const queryVector = await this.options.runtime.embed(normalizedText, "query");

    return this.searchConcepts({
      workspaceId: input.workspaceId,
      evidenceModel: input.evidenceModel,
      vector: queryVector,
      localText: normalizedText,
      sourceType: "capture",
      excludeConceptIds: input.excludeConceptIds,
      topK: input.topK,
    });
  }

  async findSimilarConceptsForConcept(input: {
    workspaceId: string;
    conceptId: string;
    evidenceModel: MemoryEvidenceModel;
    topK?: number;
  }): Promise<SemanticConceptSimilarityMatch[]> {
    const representation = buildConceptSemanticRepresentations(
      input.evidenceModel,
    ).find((item) => item.conceptId === input.conceptId);

    if (!representation) {
      return [];
    }

    const sourceRecord = await this.options.repository.getBySource({
      workspaceId: input.workspaceId,
      sourceType: "concept",
      sourceId: input.conceptId,
    });
    const sourceVector =
      sourceRecord?.status === "READY" && sourceRecord.vector
        ? sourceRecord.vector
        : await this.options.runtime.embed(representation.text, "query");

    return this.searchConcepts({
      workspaceId: input.workspaceId,
      evidenceModel: input.evidenceModel,
      vector: sourceVector,
      sourceType: "concept",
      excludeConceptIds: new Set([input.conceptId]),
      topK: input.topK,
    });
  }

  private async searchConcepts(input: {
    workspaceId: string;
    evidenceModel: MemoryEvidenceModel;
    vector: Float32Array;
    localText?: string;
    sourceType: "capture" | "concept";
    excludeConceptIds?: Set<string>;
    topK?: number;
  }): Promise<SemanticConceptSimilarityMatch[]> {
    const representations = buildConceptSemanticRepresentations(input.evidenceModel);
    const representationByConceptId = new Map(
      representations.map((representation) => [
        representation.conceptId,
        representation,
      ]),
    );
    const readyRecords = await this.options.repository.listReadyByWorkspace({
      workspaceId: input.workspaceId,
      modelId: this.options.runtime.metadata.modelId,
      modelVersion: this.options.runtime.metadata.modelVersion,
      dimensions: this.options.runtime.metadata.dimensions,
      sourceType: "concept",
    });
    const index = new SemanticVectorIndex(
      readyRecords
        .filter(
          (record) =>
            record.vector !== null &&
            representationByConceptId.has(record.sourceId),
        )
        .map((record) => ({
          id: record.sourceId,
          sourceType: "concept" as const,
          vector: record.vector as Float32Array,
        })),
    );
    const matches = index.search({
      vector: input.vector,
      topK: Math.max(input.topK ?? DEFAULT_TOP_K, DEFAULT_TOP_K) * 3,
      excludeIds: input.excludeConceptIds,
      sourceType: "concept",
    });
    const resolvedMatches = await Promise.all(
      matches.flatMap((match): Promise<SemanticConceptSimilarityMatch | null>[] => {
        const concept = input.evidenceModel.conceptsById.get(match.id)?.context;
        const representation = representationByConceptId.get(match.id);

        if (!concept || !representation) {
          return [];
        }

        return [
          this.createConceptSimilarityMatch({
            concept,
            representation,
            queryVector: input.vector,
            conceptSimilarity: match.score,
            sourceType: input.sourceType,
          }),
        ];
      }),
    );

    const contextualMatches = applyContextualEvidenceDragPenalty({
      matches: resolvedMatches.filter(
        (match): match is SemanticConceptSimilarityMatch => match !== null,
      ),
      representations: representationByConceptId,
      readyRecords,
      queryVector: input.vector,
      localText: input.localText,
      excludeConceptIds: input.excludeConceptIds,
    });

    return limitEvidenceDominatedMatches(
      contextualMatches
        .filter((match) => match.evidence.similarity >= MIN_INTERNAL_SIMILARITY)
        .sort(compareSemanticConceptMatches),
      input.topK ?? DEFAULT_TOP_K,
    ).map((match, index, matches) => ({
      ...match,
      evidence: {
        ...match.evidence,
        rank: index + 1,
        marginToNext:
          index < matches.length - 1
            ? match.evidence.similarity - matches[index + 1].evidence.similarity
            : null,
      },
    }));
  }

  private async createConceptSimilarityMatch(input: {
    concept: Context;
    representation: ReturnType<typeof buildConceptSemanticRepresentations>[number];
    queryVector: Float32Array;
    conceptSimilarity: number;
    sourceType: "capture" | "concept";
  }): Promise<SemanticConceptSimilarityMatch> {
    const evidenceSimilarity = input.representation.evidenceText
      ? dotVectors(
          input.queryVector,
          await this.options.runtime.embed(input.representation.evidenceText, "passage"),
        )
      : null;
    const similarity = composeConceptSimilarity({
      conceptSimilarity: input.conceptSimilarity,
      evidenceSimilarity,
    });

    return {
      concept: input.concept,
      representationText: input.representation.text,
      identityText: input.representation.identityText,
      evidenceText: input.representation.evidenceText,
      evidenceNodeIds: input.representation.evidenceNodeIds,
      conceptSimilarity: input.conceptSimilarity,
      evidenceSimilarity,
      evidence: {
        source: "LOCAL_EMBEDDING",
        sourceType: input.sourceType,
        targetType: "concept",
        modelId: this.options.runtime.metadata.modelId,
        modelVersion: this.options.runtime.metadata.modelVersion,
        dimensions: this.options.runtime.metadata.dimensions,
        similarity,
        rank: 0,
        marginToNext: null,
      },
    };
  }
}

function getMinimumSimilarity(policy: SemanticSimilarityPolicy = "discovery") {
  return policy === "search"
    ? MIN_SEARCH_SEMANTIC_SIMILARITY
    : MIN_INTERNAL_SIMILARITY;
}

function composeConceptSimilarity({
  conceptSimilarity,
  evidenceSimilarity,
}: {
  conceptSimilarity: number;
  evidenceSimilarity: number | null;
}) {
  if (evidenceSimilarity === null) {
    return conceptSimilarity;
  }

  const weighted =
    conceptSimilarity * CONCEPT_IDENTITY_SIMILARITY_WEIGHT +
    evidenceSimilarity * CONCEPT_EVIDENCE_SIMILARITY_WEIGHT;
  const evidenceDominancePenalty =
    Math.max(0, evidenceSimilarity - conceptSimilarity) *
    EVIDENCE_DOMINANCE_PENALTY_WEIGHT;

  return Math.max(0, weighted - evidenceDominancePenalty);
}

function compareSemanticConceptMatches(
  first: SemanticConceptSimilarityMatch,
  second: SemanticConceptSimilarityMatch,
) {
  return (
    second.evidence.similarity - first.evidence.similarity ||
    second.conceptSimilarity - first.conceptSimilarity ||
    first.concept.id.localeCompare(second.concept.id)
  );
}

function limitEvidenceDominatedMatches(
  matches: SemanticConceptSimilarityMatch[],
  limit: number,
) {
  const kept: SemanticConceptSimilarityMatch[] = [];
  const dominatedCountsByEvidence = new Map<string, number>();

  for (const match of matches) {
    const evidenceKey = getEvidenceKey(match);
    const evidenceDominated =
      evidenceKey !== null &&
      match.evidenceSimilarity !== null &&
      match.evidenceSimilarity - match.conceptSimilarity >= EVIDENCE_DOMINANCE_MARGIN;

    if (evidenceDominated) {
      const currentCount = dominatedCountsByEvidence.get(evidenceKey) ?? 0;

      if (currentCount >= MAX_EVIDENCE_DOMINATED_MATCHES_PER_SOURCE) {
        continue;
      }

      dominatedCountsByEvidence.set(evidenceKey, currentCount + 1);
    }

    kept.push(match);

    if (kept.length >= limit) {
      break;
    }
  }

  return kept;
}

function applyContextualEvidenceDragPenalty(input: {
  matches: SemanticConceptSimilarityMatch[];
  representations: Map<
    string,
    ReturnType<typeof buildConceptSemanticRepresentations>[number]
  >;
  readyRecords: Awaited<ReturnType<EmbeddingRepository["listReadyByWorkspace"]>>;
  queryVector: Float32Array;
  localText?: string;
  excludeConceptIds?: Set<string>;
}) {
  if (
    !input.localText ||
    !input.excludeConceptIds ||
    input.excludeConceptIds.size === 0
  ) {
    return input.matches;
  }

  const localTokens = new Set(tokenizeLocalSupportText(input.localText));
  const vectorByConceptId = new Map(
    input.readyRecords
      .filter((record) => record.vector !== null)
      .map((record) => [record.sourceId, record.vector as Float32Array]),
  );
  const candidateLocalSupport = new Map(
    input.matches.map((match) => [
      match.concept.id,
      hasLocalIdentitySupport(match.concept, localTokens),
    ]),
  );
  const anchorConceptIds = new Set([
    ...input.excludeConceptIds,
    ...Array.from(candidateLocalSupport.entries())
      .filter(([, supported]) => supported)
      .map(([conceptId]) => conceptId),
  ]);
  const anchors = Array.from(anchorConceptIds)
    .flatMap((conceptId) => {
      const representation = input.representations.get(conceptId);
      const vector = vectorByConceptId.get(conceptId);

      if (!representation || !vector) {
        return [];
      }

      return [
        {
          conceptId,
          evidenceNodeIds: representation.evidenceNodeIds,
          conceptSimilarity: dotVectors(input.queryVector, vector),
        },
      ];
    })
    .filter((anchor) => anchor.evidenceNodeIds.length > 0);

  if (anchors.length === 0) {
    return input.matches;
  }

  return input.matches.map((match) => {
    if (candidateLocalSupport.get(match.concept.id)) {
      return match;
    }

    const strongestSharedAnchor = anchors
      .filter((anchor) =>
        hasSharedEvidence(anchor.evidenceNodeIds, match.evidenceNodeIds),
      )
      .reduce(
        (strongest, anchor) =>
          Math.max(strongest, anchor.conceptSimilarity),
        Number.NEGATIVE_INFINITY,
      );

    if (
      strongestSharedAnchor === Number.NEGATIVE_INFINITY ||
      match.conceptSimilarity >=
        strongestSharedAnchor + CLEAR_LOCAL_IDENTITY_MARGIN
    ) {
      return match;
    }

    return {
      ...match,
      evidence: {
        ...match.evidence,
        similarity: Math.max(
          0,
          match.evidence.similarity - CONTEXTUAL_EVIDENCE_DRAG_PENALTY,
        ),
      },
    };
  });
}

function getEvidenceKey(match: SemanticConceptSimilarityMatch) {
  return getEvidenceKeyFromNodeIds(match.evidenceNodeIds);
}

function getEvidenceKeyFromNodeIds(nodeIds: string[]) {
  if (nodeIds.length === 0) {
    return null;
  }

  return [...nodeIds].sort().join("\u0001");
}

function hasSharedEvidence(first: string[], second: string[]) {
  const secondIds = new Set(second);

  return first.some((nodeId) => secondIds.has(nodeId));
}

function hasLocalIdentitySupport(concept: Context, localTokens: Set<string>) {
  const labels = [
    concept.name,
    ...(concept.aliases ?? []),
    ...(concept.normalizedAliases ?? []),
  ];

  return labels.some((label) => hasLocalLabelSupport(label, localTokens));
}

function hasLocalLabelSupport(label: string, localTokens: Set<string>) {
  const identityTokens = tokenizeLocalSupportText(label)
    .filter((token) => !LOCAL_SUPPORT_STOPWORDS.has(token));

  if (identityTokens.length === 0) {
    return false;
  }

  if (identityTokens.every((token) => localTokens.has(token))) {
    return true;
  }

  return (
    identityTokens.some((token) => HUMAN_ENTITY_TERMS.has(token)) &&
    Array.from(localTokens).some((token) => HUMAN_ENTITY_TERMS.has(token))
  );
}

function tokenizeLocalSupportText(text: string) {
  return normalizeConceptIdentityLabel(text)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function dotVectors(first: Float32Array, second: Float32Array) {
  const length = Math.min(first.length, second.length);
  let score = 0;

  for (let index = 0; index < length; index += 1) {
    score += first[index] * second[index];
  }

  return score;
}
