import type {
  PullResponse,
  PushRequest,
  PushResponse,
  SyncMutation,
} from "@vinema/sync-contracts";
import type { StoredEntity, SyncStore } from "./sync-store";

export type SyncRejectedCode =
  | "WORKSPACE_NOT_FOUND"
  | "ENTITY_NOT_FOUND"
  | "INVALID_REQUEST";

export async function processPush(
  store: SyncStore,
  request: PushRequest,
): Promise<PushResponse> {
  if (!(await store.workspaceExists(request.workspaceId))) {
    return {
      accepted: [],
      conflicts: [],
      rejected: [
        {
          code: "WORKSPACE_NOT_FOUND",
          message: "El workspace no existe.",
        },
      ],
      serverCursor: "0",
    };
  }

  const response: PushResponse = {
    accepted: [],
    conflicts: [],
    rejected: [],
    serverCursor: await store.getLatestCursor(request.workspaceId),
  };

  for (const mutation of request.mutations) {
    const processed = await store.getProcessedMutation(
      request.workspaceId,
      mutation.mutationId,
    );

    if (processed) {
      response.accepted.push(...processed.accepted);
      response.conflicts.push(...processed.conflicts);
      response.rejected.push(...processed.rejected);
      response.serverCursor = processed.serverCursor;
      continue;
    }

    const currentEntity = await store.getEntity(
      request.workspaceId,
      mutation.entityType,
      mutation.entityId,
    );
    const currentVersion = getStoredVersion(currentEntity);

    if (currentVersion !== null && mutation.baseVersion !== currentVersion) {
      response.conflicts.push({
        mutationId: mutation.mutationId,
        entityType: mutation.entityType,
        entityId: mutation.entityId,
        reason: "VERSION_CONFLICT",
        serverEntity: currentEntity?.entity ?? null,
      });
      continue;
    }

    if (currentVersion === null && mutation.baseVersion !== null) {
      response.rejected.push({
        mutationId: mutation.mutationId,
        entityType: mutation.entityType,
        entityId: mutation.entityId,
        code: "ENTITY_NOT_FOUND",
        message: "La entidad no existe en el servidor.",
      });
      continue;
    }

    try {
      await validateCrossWorkspaceReferences(store, request.workspaceId, mutation);
      const result = await store.applyMutation({
        workspaceId: request.workspaceId,
        mutation,
      });
      const mutationResponse: PushResponse = {
        accepted: [
          {
            mutationId: mutation.mutationId,
            entityType: mutation.entityType,
            entityId: mutation.entityId,
            version: result.version,
          },
        ],
        conflicts: [],
        rejected: [],
        serverCursor: result.serverCursor,
      };
      response.accepted.push(...mutationResponse.accepted);
      response.serverCursor = mutationResponse.serverCursor;
    } catch (error) {
      response.rejected.push({
        mutationId: mutation.mutationId,
        entityType: mutation.entityType,
        entityId: mutation.entityId,
        code: "INVALID_REQUEST",
        message:
          error instanceof Error
            ? error.message
            : "La mutacion no pudo procesarse.",
      });
    }
  }

  response.serverCursor = await store.getLatestCursor(request.workspaceId);
  return response;
}

export async function processPull(
  store: SyncStore,
  input: { workspaceId: string; cursor: string; limit: number },
): Promise<PullResponse> {
  const changes = await store.listChanges(input);
  const hydrated = await Promise.all(
    changes.map(async (change) => {
      const stored = await store.getEntity(
        input.workspaceId,
        change.entityType,
        change.entityId,
      );

      if (!stored) {
        return null;
      }

      return {
        sequence: change.sequence,
        entityType: change.entityType,
        operation: change.operation,
        entity: stored.entity,
      };
    }),
  );
  const visibleChanges = hydrated.filter((change): change is NonNullable<typeof change> =>
    Boolean(change),
  );
  const nextCursor =
    changes.at(-1)?.sequence ?? (await store.getLatestCursor(input.workspaceId));

  return {
    changes: visibleChanges,
    nextCursor,
    hasMore: changes.length === input.limit,
  };
}

function getStoredVersion(entity: StoredEntity | null) {
  return entity?.entity.version ?? null;
}

async function validateCrossWorkspaceReferences(
  store: SyncStore,
  workspaceId: string,
  mutation: SyncMutation,
) {
  if (mutation.entityType !== "captureConcept") {
    return;
  }

  const [capture, concept] = await Promise.all([
    store.getEntity(workspaceId, "capture", mutation.payload.captureId),
    store.getEntity(workspaceId, "concept", mutation.payload.conceptId),
  ]);

  if (!capture || !concept) {
    throw new Error("La relacion necesita captura y concepto existentes.");
  }
}
