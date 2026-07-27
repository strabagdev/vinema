import type {
  CaptureConceptEntity,
  CaptureEntity,
  ConceptEntity,
  PushResponse,
  SyncMutation,
} from "@vinema/sync-contracts";
import type {
  StoredEntity,
  StoredSyncChange,
  SyncEntityType,
  SyncOperation,
  SyncStore,
} from "../sync/sync-store";

export class InMemorySyncStore implements SyncStore {
  readonly workspaces = new Set<string>();
  readonly captures = new Map<string, CaptureEntity>();
  readonly concepts = new Map<string, ConceptEntity>();
  readonly captureConcepts = new Map<string, CaptureConceptEntity>();
  readonly processedMutations = new Map<string, PushResponse>();
  readonly changes: StoredSyncChange[] = [];
  failHealth = false;
  private sequence = 0;

  constructor(workspaceIds: string[] = []) {
    workspaceIds.forEach((workspaceId) => this.workspaces.add(workspaceId));
  }

  async health(): Promise<void> {
    if (this.failHealth) {
      throw new Error("database unavailable");
    }
  }

  async workspaceExists(workspaceId: string): Promise<boolean> {
    return this.workspaces.has(workspaceId);
  }

  async getLatestCursor(workspaceId: string): Promise<string> {
    return this.changes
      .filter((change) => this.entityWorkspace(change.entityType, change.entityId) === workspaceId)
      .at(-1)?.sequence ?? "0";
  }

  async getProcessedMutation(
    workspaceId: string,
    mutationId: string,
  ): Promise<PushResponse | null> {
    return this.processedMutations.get(`${workspaceId}:${mutationId}`) ?? null;
  }

  async getEntity(
    workspaceId: string,
    entityType: SyncEntityType,
    entityId: string,
  ): Promise<StoredEntity | null> {
    const entity = this.getMap(entityType).get(entityId);

    if (!entity || entity.workspaceId !== workspaceId) {
      return null;
    }

    return { entityType, entity } as StoredEntity;
  }

  async applyMutation(input: {
    workspaceId: string;
    mutation: SyncMutation;
  }): Promise<{ version: number; operation: SyncOperation; serverCursor: string }> {
    const version = input.mutation.baseVersion === null ? 1 : input.mutation.baseVersion + 1;
    const archived = Boolean(input.mutation.payload.archivedAt);
    const operation: SyncOperation = archived ? "archive" : "upsert";

    if (input.mutation.entityType === "capture") {
      this.captures.set(input.mutation.entityId, {
        id: input.mutation.entityId,
        workspaceId: input.workspaceId,
        ...input.mutation.payload,
        version,
      });
    } else if (input.mutation.entityType === "concept") {
      this.concepts.set(input.mutation.entityId, {
        id: input.mutation.entityId,
        workspaceId: input.workspaceId,
        ...input.mutation.payload,
        version,
      });
    } else {
      const capture = this.captures.get(input.mutation.payload.captureId);
      const concept = this.concepts.get(input.mutation.payload.conceptId);

      if (
        !capture ||
        !concept ||
        capture.workspaceId !== input.workspaceId ||
        concept.workspaceId !== input.workspaceId
      ) {
        throw new Error("La relacion cruza workspaces o entidades inexistentes.");
      }

      const payload = input.mutation.payload;
      const duplicate = Array.from(this.captureConcepts.values()).find(
        (relation) =>
          relation.id !== input.mutation.entityId &&
          relation.captureId === payload.captureId &&
          relation.conceptId === payload.conceptId,
      );

      if (duplicate) {
        throw new Error("La relacion ya existe.");
      }

      this.captureConcepts.set(input.mutation.entityId, {
        id: input.mutation.entityId,
        workspaceId: input.workspaceId,
        ...input.mutation.payload,
        version,
      });
    }

    this.sequence += 1;
    this.changes.push({
      sequence: this.sequence.toString(),
      entityType: input.mutation.entityType,
      entityId: input.mutation.entityId,
      operation,
    });
    const serverCursor = this.sequence.toString();
    this.processedMutations.set(`${input.workspaceId}:${input.mutation.mutationId}`, {
      accepted: [
        {
          mutationId: input.mutation.mutationId,
          entityType: input.mutation.entityType,
          entityId: input.mutation.entityId,
          version,
        },
      ],
      conflicts: [],
      rejected: [],
      serverCursor,
    });

    return { version, operation, serverCursor };
  }

  async listChanges(input: {
    workspaceId: string;
    cursor: string;
    limit: number;
  }): Promise<StoredSyncChange[]> {
    return this.changes
      .filter((change) => BigInt(change.sequence) > BigInt(input.cursor))
      .filter(
        (change) =>
          this.entityWorkspace(change.entityType, change.entityId) === input.workspaceId,
      )
      .slice(0, input.limit);
  }

  private getMap(entityType: SyncEntityType) {
    if (entityType === "capture") {
      return this.captures;
    }

    if (entityType === "concept") {
      return this.concepts;
    }

    return this.captureConcepts;
  }

  private entityWorkspace(entityType: SyncEntityType, entityId: string) {
    return this.getMap(entityType).get(entityId)?.workspaceId ?? null;
  }
}
