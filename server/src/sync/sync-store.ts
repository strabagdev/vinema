import type {
  CaptureConceptEntity,
  CaptureEntity,
  ConceptEntity,
  PushResponse,
  SyncInventoryResponse,
  SyncMutation,
} from "@vinema/sync-contracts";

export type SyncEntityType = "capture" | "concept" | "captureConcept";
export type SyncOperation = "upsert" | "archive";
export type ResetSyncOperation = "reset";

export type StoredSyncChange = {
  sequence: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
} | {
  sequence: string;
  entityType: "workspaceKnowledgeReset";
  entityId: string;
  operation: ResetSyncOperation;
  occurredAt: string;
};

export type StoredEntity =
  | { entityType: "capture"; entity: CaptureEntity }
  | { entityType: "concept"; entity: ConceptEntity }
  | { entityType: "captureConcept"; entity: CaptureConceptEntity };

export interface SyncStore {
  health(): Promise<void>;
  workspaceExists(workspaceId: string): Promise<boolean>;
  getLatestCursor(workspaceId: string): Promise<string>;
  getLatestKnowledgeReset(
    workspaceId: string,
  ): Promise<{ resetVersion: string; occurredAt: string } | null>;
  getProcessedMutation(
    workspaceId: string,
    mutationId: string,
  ): Promise<PushResponse | null>;
  getEntity(
    workspaceId: string,
    entityType: SyncEntityType,
    entityId: string,
  ): Promise<StoredEntity | null>;
  applyMutation(input: {
    workspaceId: string;
    mutation: SyncMutation;
  }): Promise<{
    version: number;
    operation: SyncOperation;
    serverCursor: string;
  }>;
  resetKnowledge(input: {
    workspaceId: string;
    occurredAt?: Date;
  }): Promise<{
    workspaceId: string;
    resetVersion: string;
    occurredAt: string;
    deleted: {
      captures: number;
      concepts: number;
      relations: number;
    };
  }>;
  listChanges(input: {
    workspaceId: string;
    cursor: string;
    limit: number;
  }): Promise<StoredSyncChange[]>;
  listInventory(input: {
    workspaceId: string;
    cursor: string;
    limit: number;
  }): Promise<SyncInventoryResponse>;
}
