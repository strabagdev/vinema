import type { Node } from "@/domain/node/node";
import type { NodeRepository } from "@/domain/node/node-repository";
import type { MemoryEvidenceModel } from "@/features/cognition/memory-evidence/memory-evidence-model";
import {
  buildConceptSemanticRepresentations,
  type ConceptSemanticRepresentation,
} from "@/features/semantic-similarity/concept-representation";
import {
  SEMANTIC_EMBEDDING_DIMENSIONS,
  SEMANTIC_EMBEDDING_MODEL_ID,
  SEMANTIC_EMBEDDING_MODEL_VERSION,
  createEmbeddingRecordId,
  type EmbeddingRecord,
  type EmbeddingRepository,
  type EmbeddingRuntime,
} from "@/features/semantic-similarity/embedding-types";
import {
  captureMarkdownToEmbeddingText,
  createEmbeddingSourceHash,
} from "@/features/semantic-similarity/embedding-text";

const DEFAULT_BATCH_LIMIT = 4;
const MAX_ATTEMPTS = 3;

export type EmbeddingJobQueueOptions = {
  repository: EmbeddingRepository;
  nodeRepository: NodeRepository;
  runtime: EmbeddingRuntime;
  now?: () => Date;
};

export class EmbeddingJobQueue {
  private readonly repository: EmbeddingRepository;
  private readonly nodeRepository: NodeRepository;
  private readonly runtime: EmbeddingRuntime;
  private readonly now: () => Date;
  private processingPromise: Promise<void> | null = null;

  constructor(options: EmbeddingJobQueueOptions) {
    this.repository = options.repository;
    this.nodeRepository = options.nodeRepository;
    this.runtime = options.runtime;
    this.now = options.now ?? (() => new Date());
  }

  async enqueueCapture(node: Node) {
    if (!isEmbeddableCapture(node)) {
      await this.repository.deleteBySource({
        workspaceId: node.workspaceId,
        sourceType: "capture",
        sourceId: node.id,
      });
      return null;
    }

    const text = captureMarkdownToEmbeddingText(node.content);

    if (!text) {
      await this.repository.deleteBySource({
        workspaceId: node.workspaceId,
        sourceType: "capture",
        sourceId: node.id,
      });
      return null;
    }

    const sourceHash = createEmbeddingSourceHash(text);
    const existing = await this.repository.getBySource({
      workspaceId: node.workspaceId,
      sourceType: "capture",
      sourceId: node.id,
    });

    if (
      existing &&
      existing.sourceHash === sourceHash &&
      existing.modelId === this.runtime.metadata.modelId &&
      existing.modelVersion === this.runtime.metadata.modelVersion &&
      existing.dimensions === this.runtime.metadata.dimensions &&
      existing.status === "READY"
    ) {
      return existing;
    }

    const timestamp = this.now().toISOString();
    const record: EmbeddingRecord = {
      id: createEmbeddingRecordId({
        workspaceId: node.workspaceId,
        sourceType: "capture",
        sourceId: node.id,
        modelId: this.runtime.metadata.modelId,
        modelVersion: this.runtime.metadata.modelVersion,
        dimensions: this.runtime.metadata.dimensions,
      }),
      workspaceId: node.workspaceId,
      sourceType: "capture",
      sourceId: node.id,
      sourceHash,
      modelId: this.runtime.metadata.modelId,
      modelVersion: this.runtime.metadata.modelVersion,
      dimensions: this.runtime.metadata.dimensions,
      status: "PENDING",
      vector: null,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      attempts: existing?.attempts ?? 0,
    };

    return this.repository.upsert(record);
  }

  async backfillWorkspace(workspaceId: string, options: { limit?: number } = {}) {
    const nodes = await this.nodeRepository.listByWorkspace(workspaceId);
    const activeNodes = nodes.filter(isEmbeddableCapture).slice(0, options.limit ?? 24);
    const activeSourceIds = new Set(activeNodes.map((node) => node.id));

    await this.repository.deleteStale({
      workspaceId,
      ...this.runtime.metadata,
    });
    await this.repository.garbageCollect({
      workspaceId,
      sourceType: "capture",
      activeSourceIds,
    });
    await Promise.all(activeNodes.map((node) => this.enqueueCapture(node)));
    await this.processPending(workspaceId, { limit: options.limit ?? DEFAULT_BATCH_LIMIT });
  }

  async enqueueConceptRepresentation(
    workspaceId: string,
    representation: ConceptSemanticRepresentation,
  ) {
    const existing = await this.repository.getBySource({
      workspaceId,
      sourceType: "concept",
      sourceId: representation.conceptId,
    });

    if (
      existing &&
      existing.sourceHash === representation.sourceHash &&
      existing.modelId === this.runtime.metadata.modelId &&
      existing.modelVersion === this.runtime.metadata.modelVersion &&
      existing.dimensions === this.runtime.metadata.dimensions &&
      existing.status === "READY"
    ) {
      return existing;
    }

    const timestamp = this.now().toISOString();
    const record: EmbeddingRecord = {
      id: createEmbeddingRecordId({
        workspaceId,
        sourceType: "concept",
        sourceId: representation.conceptId,
        modelId: this.runtime.metadata.modelId,
        modelVersion: this.runtime.metadata.modelVersion,
        dimensions: this.runtime.metadata.dimensions,
      }),
      workspaceId,
      sourceType: "concept",
      sourceId: representation.conceptId,
      sourceHash: representation.sourceHash,
      modelId: this.runtime.metadata.modelId,
      modelVersion: this.runtime.metadata.modelVersion,
      dimensions: this.runtime.metadata.dimensions,
      status: "PENDING",
      vector: null,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      attempts: existing?.attempts ?? 0,
    };

    return this.repository.upsert(record);
  }

  async backfillConceptsFromEvidenceModel(
    workspaceId: string,
    model: MemoryEvidenceModel,
    options: { limit?: number } = {},
  ) {
    const representations = buildConceptSemanticRepresentations(model);
    const activeSourceIds = new Set(
      representations.map((representation) => representation.conceptId),
    );

    await this.repository.garbageCollect({
      workspaceId,
      sourceType: "concept",
      activeSourceIds,
    });
    await Promise.all(
      representations
        .slice(0, options.limit ?? 24)
        .map((representation) =>
          this.enqueueConceptRepresentation(workspaceId, representation),
        ),
    );
    await this.processPending(workspaceId, {
      limit: options.limit ?? DEFAULT_BATCH_LIMIT,
      sourceType: "concept",
      conceptRepresentations: new Map(
        representations.map((representation) => [
          representation.conceptId,
          representation,
        ]),
      ),
    });
  }

  processPending(
    workspaceId: string,
    options: {
      limit?: number;
      sourceType?: EmbeddingRecord["sourceType"];
      conceptRepresentations?: Map<string, ConceptSemanticRepresentation>;
    } = {},
  ) {
    this.processingPromise ??= this.processPendingNow(workspaceId, options).finally(() => {
      this.processingPromise = null;
    });

    return this.processingPromise;
  }

  private async processPendingNow(
    workspaceId: string,
    options: {
      limit?: number;
      sourceType?: EmbeddingRecord["sourceType"];
      conceptRepresentations?: Map<string, ConceptSemanticRepresentation>;
    },
  ) {
    const pendingRecords = await this.repository.listPendingByWorkspace({
      workspaceId,
      modelId: this.runtime.metadata.modelId,
      modelVersion: this.runtime.metadata.modelVersion,
      dimensions: this.runtime.metadata.dimensions,
      limit: options.limit ?? DEFAULT_BATCH_LIMIT,
      sourceType: options.sourceType,
    });

    for (const record of pendingRecords) {
      if (record.sourceType === "concept") {
        await this.processConceptRecord(record, options.conceptRepresentations);
      } else {
        await this.processCaptureRecord(record);
      }
    }
  }

  private async processCaptureRecord(record: EmbeddingRecord) {
    const startedAt = this.now().toISOString();

    await this.repository.markStatus({
      id: record.id,
      status: "PROCESSING",
      updatedAt: startedAt,
      attempts: record.attempts + 1,
    });

    try {
      const node = await this.nodeRepository.findById(record.sourceId);

      if (!node || node.workspaceId !== record.workspaceId || !isEmbeddableCapture(node)) {
        await this.repository.deleteBySource({
          workspaceId: record.workspaceId,
          sourceType: record.sourceType,
          sourceId: record.sourceId,
        });
        return;
      }

      const text = captureMarkdownToEmbeddingText(node.content);
      const sourceHash = createEmbeddingSourceHash(text);

      if (sourceHash !== record.sourceHash) {
        await this.enqueueCapture(node);
        return;
      }

      const vector = await this.runtime.embed(text, "passage");
      const latest = await this.nodeRepository.findById(record.sourceId);
      const latestText = latest ? captureMarkdownToEmbeddingText(latest.content) : "";
      const latestHash = latest ? createEmbeddingSourceHash(latestText) : "";

      if (
        !latest ||
        !isEmbeddableCapture(latest) ||
        latest.workspaceId !== record.workspaceId ||
        latestHash !== record.sourceHash
      ) {
        if (latest && isEmbeddableCapture(latest)) {
          await this.enqueueCapture(latest);
        }
        return;
      }

      await this.repository.upsert({
        ...record,
        status: "READY",
        vector,
        updatedAt: this.now().toISOString(),
        attempts: record.attempts + 1,
        lastErrorCode: undefined,
        lastErrorMessage: undefined,
      });
    } catch (error) {
      const attempts = record.attempts + 1;
      await this.repository.markStatus({
        id: record.id,
        status: attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
        updatedAt: this.now().toISOString(),
        attempts,
        lastErrorCode:
          error instanceof Error ? error.name : "EmbeddingProcessingError",
        lastErrorMessage:
          error instanceof Error
            ? error.message.slice(0, 180)
            : "No se pudo procesar el embedding.",
      });
    }
  }

  private async processConceptRecord(
    record: EmbeddingRecord,
    representations: Map<string, ConceptSemanticRepresentation> | undefined,
  ) {
    const representationMap = representations;
    const representation = representationMap?.get(record.sourceId);

    if (!representationMap || !representation) {
      return;
    }

    const startedAt = this.now().toISOString();

    await this.repository.markStatus({
      id: record.id,
      status: "PROCESSING",
      updatedAt: startedAt,
      attempts: record.attempts + 1,
    });

    try {
      if (representation.sourceHash !== record.sourceHash) {
        await this.enqueueConceptRepresentation(record.workspaceId, representation);
        return;
      }

      const vector = await this.runtime.embed(representation.text, "passage");
      const latest = representationMap.get(record.sourceId);

      if (!latest || latest.sourceHash !== record.sourceHash) {
        if (latest) {
          await this.enqueueConceptRepresentation(record.workspaceId, latest);
        }
        return;
      }

      await this.repository.upsert({
        ...record,
        status: "READY",
        vector,
        updatedAt: this.now().toISOString(),
        attempts: record.attempts + 1,
        lastErrorCode: undefined,
        lastErrorMessage: undefined,
      });
    } catch (error) {
      const attempts = record.attempts + 1;
      await this.repository.markStatus({
        id: record.id,
        status: attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
        updatedAt: this.now().toISOString(),
        attempts,
        lastErrorCode:
          error instanceof Error ? error.name : "EmbeddingProcessingError",
        lastErrorMessage:
          error instanceof Error
            ? error.message.slice(0, 180)
            : "No se pudo procesar el embedding conceptual.",
      });
    }
  }
}

export function isEmbeddableCapture(node: Node) {
  return (
    node.deletedAt === null &&
    !node.archivedAt &&
    node.organizationStatus === "ORGANIZED" &&
    typeof node.content === "string" &&
    node.content.trim().length > 0
  );
}

export const DEFAULT_SEMANTIC_MODEL = {
  modelId: SEMANTIC_EMBEDDING_MODEL_ID,
  modelVersion: SEMANTIC_EMBEDDING_MODEL_VERSION,
  dimensions: SEMANTIC_EMBEDDING_DIMENSIONS,
};
