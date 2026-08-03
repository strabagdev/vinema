import {
  SYNC_ENTITY_ACKS_STORE,
  getVinemaDb,
} from "@/infrastructure/storage/vinema-db";
import type { SyncMutationOutboxRecord } from "@/features/sync/sync-outbox-repository";

export type SyncEntityType = "capture" | "concept" | "captureConcept";

export type SyncEntityAcknowledgementRecord = {
  workspaceId: string;
  entityType: SyncEntityType;
  entityId: string;
  acknowledgedRemoteVersion: number;
  acknowledgedLocalVersion: number | null;
  acknowledgedLocalUpdatedAt: string | null;
  acknowledgedAt: string;
  generation: string | null;
  lastChangeId: string | null;
};

export type SyncEntityAcknowledgementInput = {
  workspaceId: string;
  entityType: SyncEntityType;
  entityId: string;
  acknowledgedRemoteVersion: number;
  acknowledgedLocalVersion?: number | null;
  acknowledgedLocalUpdatedAt?: string | null;
  acknowledgedAt: string;
  generation?: string | null;
  lastChangeId?: string | null;
};

export class IndexedDbSyncEntityAcknowledgementRepository {
  async get(input: {
    workspaceId: string;
    entityType: SyncEntityType;
    entityId: string;
  }): Promise<SyncEntityAcknowledgementRecord | null> {
    const db = await getVinemaDb();
    return (
      await db.get(SYNC_ENTITY_ACKS_STORE, [
        input.workspaceId,
        input.entityType,
        input.entityId,
      ])
    ) ?? null;
  }

  async listByWorkspace(
    workspaceId: string,
  ): Promise<SyncEntityAcknowledgementRecord[]> {
    const db = await getVinemaDb();
    return db.getAllFromIndex(SYNC_ENTITY_ACKS_STORE, "by-workspace", workspaceId);
  }

  async record(input: SyncEntityAcknowledgementInput) {
    const db = await getVinemaDb();
    const record = toAcknowledgementRecord(input);
    await db.put(SYNC_ENTITY_ACKS_STORE, record);
    return record;
  }

  async recordMany(inputs: SyncEntityAcknowledgementInput[]) {
    if (inputs.length === 0) {
      return [];
    }

    const db = await getVinemaDb();
    const transaction = db.transaction(SYNC_ENTITY_ACKS_STORE, "readwrite");
    const records = inputs.map(toAcknowledgementRecord);
    for (const record of records) {
      await transaction.store.put(record);
    }
    await transaction.done;
    return records;
  }

  async clearWorkspace(workspaceId: string) {
    const db = await getVinemaDb();
    const transaction = db.transaction(SYNC_ENTITY_ACKS_STORE, "readwrite");
    const records = await transaction.store.index("by-workspace").getAll(workspaceId);
    for (const record of records) {
      await transaction.store.delete([
        record.workspaceId,
        record.entityType,
        record.entityId,
      ]);
    }
    await transaction.done;
  }
}

export function createAcknowledgementFromAcceptedMutation({
  record,
  remoteVersion,
  acknowledgedAt,
  generation,
}: {
  record: SyncMutationOutboxRecord;
  remoteVersion: number;
  acknowledgedAt: string;
  generation: string | null;
}): SyncEntityAcknowledgementInput {
  return {
    workspaceId: record.workspaceId,
    entityType: record.mutation.entityType,
    entityId: record.mutation.entityId,
    acknowledgedRemoteVersion: remoteVersion,
    acknowledgedLocalVersion: record.localVersion ?? null,
    acknowledgedLocalUpdatedAt: getMutationUpdatedAt(record),
    acknowledgedAt,
    generation,
    lastChangeId: null,
  };
}

function toAcknowledgementRecord(
  input: SyncEntityAcknowledgementInput,
): SyncEntityAcknowledgementRecord {
  return {
    workspaceId: input.workspaceId,
    entityType: input.entityType,
    entityId: input.entityId,
    acknowledgedRemoteVersion: input.acknowledgedRemoteVersion,
    acknowledgedLocalVersion: input.acknowledgedLocalVersion ?? null,
    acknowledgedLocalUpdatedAt: input.acknowledgedLocalUpdatedAt ?? null,
    acknowledgedAt: input.acknowledgedAt,
    generation: input.generation ?? null,
    lastChangeId: input.lastChangeId ?? null,
  };
}

function getMutationUpdatedAt(record: SyncMutationOutboxRecord) {
  if ("updatedAt" in record.mutation.payload) {
    return record.mutation.payload.updatedAt;
  }

  return null;
}
