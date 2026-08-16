export const SEMANTIC_EMBEDDING_MODEL_ID = "intfloat/multilingual-e5-small";
export const SEMANTIC_EMBEDDING_RUNTIME_MODEL_ID =
  "Xenova/multilingual-e5-small";
export const SEMANTIC_EMBEDDING_MODEL_VERSION = "transformers-js-onnx-q8-v1";
export const SEMANTIC_EMBEDDING_DIMENSIONS = 384;

export type EmbeddingSourceType = "capture" | "concept";

export type EmbeddingStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED";

export type EmbeddingRuntimeMetadata = {
  modelId: string;
  modelVersion: string;
  dimensions: number;
};

export type EmbeddingUsage = "query" | "passage";

export type EmbeddingRecord = {
  id: string;
  workspaceId: string;
  sourceType: EmbeddingSourceType;
  sourceId: string;
  sourceHash: string;
  modelId: string;
  modelVersion: string;
  dimensions: number;
  status: EmbeddingStatus;
  vector: Float32Array | null;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  lastErrorCode?: string;
  lastErrorMessage?: string;
};

export type StoredEmbeddingRecord = Omit<EmbeddingRecord, "vector"> & {
  vector: ArrayBuffer | null;
};

export type EmbeddingRuntime = {
  readonly metadata: EmbeddingRuntimeMetadata;
  embed(text: string, usage: EmbeddingUsage): Promise<Float32Array>;
};

export type EmbeddingRepository = {
  get(input: EmbeddingIdentity): Promise<EmbeddingRecord | null>;
  getBySource(input: EmbeddingSourceIdentity): Promise<EmbeddingRecord | null>;
  upsert(record: EmbeddingRecord): Promise<EmbeddingRecord>;
  listReadyByWorkspace(input: EmbeddingWorkspaceModelIdentity & {
    sourceType?: EmbeddingSourceType;
  }): Promise<EmbeddingRecord[]>;
  listPendingByWorkspace(input: EmbeddingWorkspaceModelIdentity & {
    limit?: number;
    sourceType?: EmbeddingSourceType;
  }): Promise<EmbeddingRecord[]>;
  markStatus(
    input: EmbeddingIdentity & {
      status: EmbeddingStatus;
      updatedAt: string;
      attempts?: number;
      lastErrorCode?: string;
      lastErrorMessage?: string;
    },
  ): Promise<void>;
  deleteBySource(input: EmbeddingSourceIdentity): Promise<void>;
  deleteStale(input: EmbeddingWorkspaceModelIdentity): Promise<number>;
  garbageCollect(input: {
    workspaceId: string;
    sourceType?: EmbeddingSourceType;
    activeSourceIds: Set<string>;
  }): Promise<number>;
};

export type EmbeddingIdentity = {
  id: string;
};

export type EmbeddingSourceIdentity = {
  workspaceId: string;
  sourceType: EmbeddingSourceType;
  sourceId: string;
};

export type EmbeddingWorkspaceModelIdentity = {
  workspaceId: string;
  modelId: string;
  modelVersion: string;
  dimensions: number;
};

export function createEmbeddingRecordId(input: {
  workspaceId: string;
  sourceType: EmbeddingSourceType;
  sourceId: string;
  modelId: string;
  modelVersion: string;
  dimensions: number;
}) {
  return [
    input.workspaceId,
    input.sourceType,
    input.sourceId,
    input.modelId,
    input.modelVersion,
    String(input.dimensions),
  ].join("::");
}
