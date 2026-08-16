"use client";

import type { NodeRepository } from "@/domain/node/node-repository";
import type { MemoryEvidenceModel } from "@/features/cognition/memory-evidence/memory-evidence-model";
import { IndexedDbEmbeddingRepository } from "@/infrastructure/semantic-similarity/indexed-db-embedding-repository";
import { createTransformersEmbeddingRuntime } from "@/features/semantic-similarity/embedding-runtime";
import { EmbeddingJobQueue } from "@/features/semantic-similarity/embedding-job-queue";
import {
  SemanticSimilarityEngine,
  type SemanticSimilarityPolicy,
} from "@/features/semantic-similarity/semantic-similarity-engine";

export type SemanticSimilarityService = {
  backfillWorkspace(workspaceId: string, options?: { limit?: number }): Promise<void>;
  backfillConceptsFromEvidenceModel(
    workspaceId: string,
    evidenceModel: MemoryEvidenceModel,
    options?: { limit?: number },
  ): Promise<void>;
	  findSimilarCaptures(input: {
	    workspaceId: string;
	    text: string;
	    currentNodeId?: string;
	    topK?: number;
	    policy?: SemanticSimilarityPolicy;
	  }): Promise<Awaited<ReturnType<SemanticSimilarityEngine["findSimilarCaptures"]>>>;
  findSimilarConceptsForCapture(
    input: Parameters<SemanticSimilarityEngine["findSimilarConceptsForCapture"]>[0],
  ): Promise<
    Awaited<ReturnType<SemanticSimilarityEngine["findSimilarConceptsForCapture"]>>
  >;
  findSimilarConceptsForConcept(
    input: Parameters<SemanticSimilarityEngine["findSimilarConceptsForConcept"]>[0],
  ): Promise<
    Awaited<ReturnType<SemanticSimilarityEngine["findSimilarConceptsForConcept"]>>
  >;
};

const services = new WeakMap<NodeRepository, SemanticSimilarityService>();
const noopSemanticSimilarityService: SemanticSimilarityService = {
  async backfillWorkspace() {},
  async backfillConceptsFromEvidenceModel() {},
  async findSimilarCaptures() {
    return [];
  },
  async findSimilarConceptsForCapture() {
    return [];
  },
  async findSimilarConceptsForConcept() {
    return [];
  },
};

export function getSemanticSimilarityService(nodeRepository: NodeRepository) {
  if (process.env.NODE_ENV === "test") {
    return noopSemanticSimilarityService;
  }

  const existing = services.get(nodeRepository);

  if (existing) {
    return existing;
  }

  const repository = new IndexedDbEmbeddingRepository();
  const runtime = createTransformersEmbeddingRuntime();
  const queue = new EmbeddingJobQueue({
    repository,
    nodeRepository,
    runtime,
  });
  const engine = new SemanticSimilarityEngine({
    repository,
    nodeRepository,
    runtime,
  });
  const service: SemanticSimilarityService = {
    async backfillWorkspace(workspaceId, options) {
      try {
        await queue.backfillWorkspace(workspaceId, options);
      } catch {
        // Embeddings are local opportunistic evidence; capture writes remain primary.
      }
    },
    async backfillConceptsFromEvidenceModel(workspaceId, evidenceModel, options) {
      try {
        await queue.backfillConceptsFromEvidenceModel(
          workspaceId,
          evidenceModel,
          options,
        );
      } catch {
        // Concept embeddings are derived local evidence and can be rebuilt.
      }
    },
    async findSimilarCaptures(input) {
      try {
        return await engine.findSimilarCaptures(input);
      } catch {
        return [];
      }
    },
    async findSimilarConceptsForCapture(input) {
      try {
        return await engine.findSimilarConceptsForCapture(input);
      } catch {
        return [];
      }
    },
    async findSimilarConceptsForConcept(input) {
      try {
        return await engine.findSimilarConceptsForConcept(input);
      } catch {
        return [];
      }
    },
  };

  services.set(nodeRepository, service);

  return service;
}
