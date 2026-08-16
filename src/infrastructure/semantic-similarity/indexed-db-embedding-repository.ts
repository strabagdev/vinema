import {
  EMBEDDINGS_STORE,
  getVinemaDb,
} from "@/infrastructure/storage/vinema-db";
import type {
  EmbeddingRecord,
  EmbeddingRepository,
  EmbeddingSourceIdentity,
  EmbeddingWorkspaceModelIdentity,
  StoredEmbeddingRecord,
} from "@/features/semantic-similarity/embedding-types";

export class IndexedDbEmbeddingRepository implements EmbeddingRepository {
  async get(input: { id: string }): Promise<EmbeddingRecord | null> {
    const db = await getVinemaDb();
    const record = await db.get(EMBEDDINGS_STORE, input.id);

    return record ? toEmbeddingRecord(record) : null;
  }

  async getBySource(input: EmbeddingSourceIdentity): Promise<EmbeddingRecord | null> {
    const db = await getVinemaDb();
    const records = await db.getAllFromIndex(EMBEDDINGS_STORE, "by-source", [
      input.workspaceId,
      input.sourceType,
      input.sourceId,
    ]);
    const [newest] = records
      .map(toEmbeddingRecord)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

    return newest ?? null;
  }

  async upsert(record: EmbeddingRecord): Promise<EmbeddingRecord> {
    const db = await getVinemaDb();
    await db.put(EMBEDDINGS_STORE, toStoredEmbeddingRecord(record));
    return record;
  }

  async listReadyByWorkspace(
    input: EmbeddingWorkspaceModelIdentity & {
      sourceType?: EmbeddingRecord["sourceType"];
    },
  ): Promise<EmbeddingRecord[]> {
    const db = await getVinemaDb();
    const records = await db.getAllFromIndex(
      EMBEDDINGS_STORE,
      "by-workspace-and-model",
      [input.workspaceId, input.modelId, input.modelVersion, input.dimensions],
    );

    return records
      .map(toEmbeddingRecord)
      .filter(
        (record) =>
          record.status === "READY" &&
          record.vector !== null &&
          (!input.sourceType || record.sourceType === input.sourceType),
      );
  }

  async listPendingByWorkspace(
    input: EmbeddingWorkspaceModelIdentity & {
      limit?: number;
      sourceType?: EmbeddingRecord["sourceType"];
    },
  ): Promise<EmbeddingRecord[]> {
    const db = await getVinemaDb();
    const records = await db.getAllFromIndex(EMBEDDINGS_STORE, "by-status", [
      input.workspaceId,
      "PENDING",
    ]);

    return records
      .map(toEmbeddingRecord)
      .filter(
        (record) =>
          record.modelId === input.modelId &&
          record.modelVersion === input.modelVersion &&
          record.dimensions === input.dimensions &&
          (!input.sourceType || record.sourceType === input.sourceType),
      )
      .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))
      .slice(0, input.limit ?? records.length);
  }

  async markStatus(
    input: {
      id: string;
      status: EmbeddingRecord["status"];
      updatedAt: string;
      attempts?: number;
      lastErrorCode?: string;
      lastErrorMessage?: string;
    },
  ): Promise<void> {
    const existing = await this.get({ id: input.id });

    if (!existing) {
      return;
    }

    await this.upsert({
      ...existing,
      status: input.status,
      updatedAt: input.updatedAt,
      attempts: input.attempts ?? existing.attempts,
      lastErrorCode: input.lastErrorCode,
      lastErrorMessage: input.lastErrorMessage,
    });
  }

  async deleteBySource(input: EmbeddingSourceIdentity): Promise<void> {
    const db = await getVinemaDb();
    const records = await db.getAllFromIndex(EMBEDDINGS_STORE, "by-source", [
      input.workspaceId,
      input.sourceType,
      input.sourceId,
    ]);
    const tx = db.transaction(EMBEDDINGS_STORE, "readwrite");

    await Promise.all(records.map((record) => tx.store.delete(record.id)));
    await tx.done;
  }

  async deleteStale(input: EmbeddingWorkspaceModelIdentity): Promise<number> {
    const db = await getVinemaDb();
    const records = await db.getAll(EMBEDDINGS_STORE);
    const staleRecords = records.filter(
      (record) =>
        record.workspaceId === input.workspaceId &&
        (record.modelId !== input.modelId ||
          record.modelVersion !== input.modelVersion ||
          record.dimensions !== input.dimensions),
    );
    const tx = db.transaction(EMBEDDINGS_STORE, "readwrite");

    await Promise.all(staleRecords.map((record) => tx.store.delete(record.id)));
    await tx.done;

    return staleRecords.length;
  }

  async garbageCollect(input: {
    workspaceId: string;
    sourceType?: EmbeddingRecord["sourceType"];
    activeSourceIds: Set<string>;
  }): Promise<number> {
    const db = await getVinemaDb();
    const records = await db.getAll(EMBEDDINGS_STORE);
    const staleRecords = records.filter(
      (record) =>
        record.workspaceId === input.workspaceId &&
        (!input.sourceType || record.sourceType === input.sourceType) &&
        !input.activeSourceIds.has(record.sourceId),
    );
    const tx = db.transaction(EMBEDDINGS_STORE, "readwrite");

    await Promise.all(staleRecords.map((record) => tx.store.delete(record.id)));
    await tx.done;

    return staleRecords.length;
  }
}

export function toStoredEmbeddingRecord(
  record: EmbeddingRecord,
): StoredEmbeddingRecord {
  return {
    ...record,
    vector: record.vector ? copyVectorToArrayBuffer(record.vector) : null,
  };
}

export function toEmbeddingRecord(record: StoredEmbeddingRecord): EmbeddingRecord {
  return {
    ...record,
    vector: record.vector ? new Float32Array(record.vector) : null,
  };
}

function copyVectorToArrayBuffer(vector: Float32Array) {
  const copy = new Float32Array(vector.length);
  copy.set(vector);
  return copy.buffer;
}
