import type {
  CaptureConceptEntity,
  CaptureEntity,
  ConceptEntity,
  PushResponse,
  SyncMutation,
} from "@vinema/sync-contracts";

export type SyncEntityType = "capture" | "concept" | "captureConcept";
export type SyncOperation = "upsert" | "archive";

export type StoredSyncChange = {
  sequence: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
};

export type StoredEntity =
  | { entityType: "capture"; entity: CaptureEntity }
  | { entityType: "concept"; entity: ConceptEntity }
  | { entityType: "captureConcept"; entity: CaptureConceptEntity };

export interface SyncStore {
  health(): Promise<void>;
  workspaceExists(workspaceId: string): Promise<boolean>;
  getLatestCursor(workspaceId: string): Promise<string>;
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
  listChanges(input: {
    workspaceId: string;
    cursor: string;
    limit: number;
  }): Promise<StoredSyncChange[]>;
}
