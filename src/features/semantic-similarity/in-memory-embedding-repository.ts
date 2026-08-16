import type {
  EmbeddingRecord,
  EmbeddingRepository,
  EmbeddingSourceIdentity,
  EmbeddingWorkspaceModelIdentity,
} from "@/features/semantic-similarity/embedding-types";

export class InMemoryEmbeddingRepository implements EmbeddingRepository {
  private readonly records = new Map<string, EmbeddingRecord>();

  constructor(records: EmbeddingRecord[] = []) {
    records.forEach((record) => {
      this.records.set(record.id, cloneRecord(record));
    });
  }

  async get(input: { id: string }) {
    const record = this.records.get(input.id);
    return record ? cloneRecord(record) : null;
  }

  async getBySource(input: EmbeddingSourceIdentity) {
    const [record] = Array.from(this.records.values())
      .filter(
        (candidate) =>
          candidate.workspaceId === input.workspaceId &&
          candidate.sourceType === input.sourceType &&
          candidate.sourceId === input.sourceId,
      )
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

    return record ? cloneRecord(record) : null;
  }

  async upsert(record: EmbeddingRecord) {
    this.records.set(record.id, cloneRecord(record));
    return cloneRecord(record);
  }

  async listReadyByWorkspace(
    input: EmbeddingWorkspaceModelIdentity & {
      sourceType?: EmbeddingRecord["sourceType"];
    },
  ) {
    return Array.from(this.records.values())
      .filter(
        (record) =>
          record.workspaceId === input.workspaceId &&
          (!input.sourceType || record.sourceType === input.sourceType) &&
          record.modelId === input.modelId &&
          record.modelVersion === input.modelVersion &&
          record.dimensions === input.dimensions &&
          record.status === "READY" &&
          record.vector !== null,
      )
      .map(cloneRecord);
  }

  async listPendingByWorkspace(
    input: EmbeddingWorkspaceModelIdentity & {
      limit?: number;
      sourceType?: EmbeddingRecord["sourceType"];
    },
  ) {
    return Array.from(this.records.values())
      .filter(
        (record) =>
          record.workspaceId === input.workspaceId &&
          (!input.sourceType || record.sourceType === input.sourceType) &&
          record.modelId === input.modelId &&
          record.modelVersion === input.modelVersion &&
          record.dimensions === input.dimensions &&
          record.status === "PENDING",
      )
      .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))
      .slice(0, input.limit ?? this.records.size)
      .map(cloneRecord);
  }

  async markStatus(input: {
    id: string;
    status: EmbeddingRecord["status"];
    updatedAt: string;
    attempts?: number;
    lastErrorCode?: string;
    lastErrorMessage?: string;
  }) {
    const existing = this.records.get(input.id);

    if (!existing) {
      return;
    }

    this.records.set(input.id, {
      ...existing,
      status: input.status,
      updatedAt: input.updatedAt,
      attempts: input.attempts ?? existing.attempts,
      lastErrorCode: input.lastErrorCode,
      lastErrorMessage: input.lastErrorMessage,
    });
  }

  async deleteBySource(input: EmbeddingSourceIdentity) {
    for (const record of this.records.values()) {
      if (
        record.workspaceId === input.workspaceId &&
        record.sourceType === input.sourceType &&
        record.sourceId === input.sourceId
      ) {
        this.records.delete(record.id);
      }
    }
  }

  async deleteStale(input: EmbeddingWorkspaceModelIdentity) {
    let deleted = 0;

    for (const record of this.records.values()) {
      if (
        record.workspaceId === input.workspaceId &&
        (record.modelId !== input.modelId ||
          record.modelVersion !== input.modelVersion ||
          record.dimensions !== input.dimensions)
      ) {
        this.records.delete(record.id);
        deleted += 1;
      }
    }

    return deleted;
  }

  async garbageCollect(input: {
    workspaceId: string;
    sourceType?: EmbeddingRecord["sourceType"];
    activeSourceIds: Set<string>;
  }) {
    let deleted = 0;

    for (const record of this.records.values()) {
      if (
        record.workspaceId === input.workspaceId &&
        (!input.sourceType || record.sourceType === input.sourceType) &&
        !input.activeSourceIds.has(record.sourceId)
      ) {
        this.records.delete(record.id);
        deleted += 1;
      }
    }

    return deleted;
  }
}

function cloneRecord(record: EmbeddingRecord): EmbeddingRecord {
  return {
    ...record,
    vector: record.vector ? new Float32Array(record.vector) : null,
  };
}
