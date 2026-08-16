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

const DEFAULT_TOP_K = 5;
const MIN_INTERNAL_SIMILARITY = 0.18;
const MIN_SEARCH_SEMANTIC_SIMILARITY = 0.76;

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
  evidenceNodeIds: string[];
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
      topK: input.topK ?? DEFAULT_TOP_K,
      excludeIds: input.excludeConceptIds,
      sourceType: "concept",
    });

    return matches
      .filter((match) => match.score >= MIN_INTERNAL_SIMILARITY)
      .flatMap((match): SemanticConceptSimilarityMatch[] => {
        const concept = input.evidenceModel.conceptsById.get(match.id)?.context;
        const representation = representationByConceptId.get(match.id);

        if (!concept || !representation) {
          return [];
        }

        return [
          {
            concept,
            representationText: representation.text,
            evidenceNodeIds: representation.evidenceNodeIds,
            evidence: {
              source: "LOCAL_EMBEDDING",
              sourceType: input.sourceType,
              targetType: "concept",
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
}

function getMinimumSimilarity(policy: SemanticSimilarityPolicy = "discovery") {
  return policy === "search"
    ? MIN_SEARCH_SEMANTIC_SIMILARITY
    : MIN_INTERNAL_SIMILARITY;
}
