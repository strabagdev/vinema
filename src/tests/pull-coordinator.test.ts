import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteDB } from "idb";
import type {
  PullResponse,
  SyncEntityResponse,
  SyncMutation,
} from "@vinema/sync-contracts";
import { SyncClientError, type SyncClient } from "@/features/sync/sync-client";
import {
  createPullCoordinator,
  createPullCoordinatorRunRegistry,
  PullCoordinatorConfigError,
} from "@/features/sync/pull-coordinator";
import { subscribeToSyncDataChanged } from "@/features/sync/sync-data-events";
import { IndexedDbSyncOutboxRepository } from "@/features/sync/sync-outbox-repository";
import {
  CONTEXTS_STORE,
  NODE_CONTEXT_RELATIONS_STORE,
  NODES_STORE,
  SYNC_METADATA_STORE,
  VINEMA_DB_NAME,
  getVinemaDb,
  resetVinemaDbConnectionForTests,
} from "@/infrastructure/storage/vinema-db";
import { IndexedDbNodeRepository } from "@/infrastructure/node/indexed-db-node-repository";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const deviceId = "22222222-2222-4222-8222-222222222222";
const now = "2026-07-30T12:00:00.000Z";
const captureId = "33333333-3333-4333-8333-333333333333";
const conceptId = "44444444-4444-4444-8444-444444444444";
const relationId = "55555555-5555-4555-8555-555555555555";

describe("pull coordinator", () => {
  beforeEach(async () => {
    await resetVinemaDbConnectionForTests();
    await deleteDB(VINEMA_DB_NAME);
  });

  afterEach(async () => {
    await resetVinemaDbConnectionForTests();
    await deleteDB(VINEMA_DB_NAME);
  });

  it("uses the initial cursor, applies an empty batch and stores the new cursor", async () => {
    const setup = createSetup({
      responses: [pullResponse({ nextCursor: "7" })],
    });

    const result = await setup.coordinator.run();
    const metadata = await getMetadata();

    expect(result).toMatchObject({
      status: "SUCCESS",
      previousCursor: "0",
      nextCursor: "7",
      batches: 1,
      pulled: 0,
    });
    expect(setup.pull).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId, cursor: "0", limit: 100 }),
    );
    expect(metadata).toMatchObject({
      pullCursor: "7",
      lastPullAttemptAt: now,
      lastSuccessfulPullAt: now,
    });
  });

  it("processes multiple pull batches and advances the cursor after each applied batch", async () => {
    const events: unknown[] = [];
    const unsubscribe = subscribeToSyncDataChanged((detail) => {
      events.push(detail);
    });
    const setup = createSetup({
      config: { pullBatchSize: 1, maxPullBatchesPerRun: 5 },
      responses: [
        pullResponse({
          changes: [captureChange({ sequence: "1", version: 1 })],
          nextCursor: "1",
          hasMore: true,
        }),
        pullResponse({
          changes: [conceptChange({ sequence: "2", version: 1 })],
          nextCursor: "2",
          hasMore: false,
        }),
      ],
    });

    const result = await setup.coordinator.run();
    const db = await getVinemaDb();

    expect(result).toMatchObject({
      status: "SUCCESS",
      pulled: 2,
      applied: 2,
      batches: 2,
      nextCursor: "2",
    });
    await expect(db.get(NODES_STORE, captureId)).resolves.toMatchObject({
      id: captureId,
      version: 1,
    });
    await expect(db.get(CONTEXTS_STORE, conceptId)).resolves.toMatchObject({
      id: conceptId,
      version: 1,
    });
    expect(events).toEqual([
      {
        workspaceId,
        entityTypes: ["capture"],
        changedAt: now,
      },
      {
        workspaceId,
        entityTypes: ["concept"],
        changedAt: now,
      },
    ]);
    unsubscribe();
  });

  it("rolls back domain changes and cursor when a relation dependency is truly missing", async () => {
    const setup = createSetup({
      responses: [
        pullResponse({
          changes: [
            relationChange({
              sequence: "1",
              captureId,
              conceptId,
              version: 1,
            }),
          ],
          nextCursor: "9",
        }),
      ],
    });

    const result = await setup.coordinator.run();
    const db = await getVinemaDb();

    expect(result.status).toBe("FAILED");
    expect(result.errors[0]).toMatchObject({
      code: "MISSING_RELATION_DEPENDENCY",
    });
    await expect(db.get(NODE_CONTEXT_RELATIONS_STORE, relationId)).resolves.toBeUndefined();
    await expect(getMetadata()).resolves.toMatchObject({
      pullCursor: "0",
      lastSyncErrorCode: "MISSING_RELATION_DEPENDENCY",
    });
  });

  it("recovers a relation dependency that was created before the local cursor but is missing locally", async () => {
    await seedCapture({ version: 1 });
    const setup = createSetup({
      remoteEntities: [
        conceptEntityResponse({
          id: conceptId,
          label: "Recovered Concept",
          version: 1,
        }),
      ],
      responses: [
        pullResponse({
          changes: [
            relationChange({
              sequence: "984",
              captureId,
              conceptId,
              version: 1,
            }),
          ],
          nextCursor: "984",
        }),
      ],
    });

    const result = await setup.coordinator.run();
    const db = await getVinemaDb();

    expect(result).toMatchObject({
      status: "SUCCESS",
      nextCursor: "984",
    });
    await expect(db.get(CONTEXTS_STORE, conceptId)).resolves.toMatchObject({
      id: conceptId,
      name: "Recovered Concept",
    });
    await expect(
      db.get(NODE_CONTEXT_RELATIONS_STORE, relationId),
    ).resolves.toMatchObject({
      id: relationId,
      nodeId: captureId,
      contextId: conceptId,
    });
    expect(setup.getEntity).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "concept", entityId: conceptId }),
    );
  });

  it("deduplicates repeated dependency recovery requests in the same batch", async () => {
    const secondCaptureId = "77777777-7777-4777-8777-777777777777";
    await seedCapture({ version: 1 });
    const setup = createSetup({
      remoteEntities: [
        conceptEntityResponse({
          id: conceptId,
          label: "Recovered Concept",
          version: 1,
        }),
      ],
      responses: [
        pullResponse({
          changes: [
            captureChange({
              sequence: "1",
              captureId: secondCaptureId,
              version: 1,
            }),
            relationChange({
              sequence: "2",
              relationId,
              captureId,
              conceptId,
              version: 1,
            }),
            relationChange({
              sequence: "3",
              relationId: "66666666-6666-4666-8666-666666666666",
              captureId: secondCaptureId,
              conceptId,
              version: 1,
            }),
          ],
          nextCursor: "3",
        }),
      ],
    });

    const result = await setup.coordinator.run();

    expect(result.status).toBe("SUCCESS");
    expect(setup.getEntity).toHaveBeenCalledTimes(1);
    expect(setup.getEntity).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "concept", entityId: conceptId }),
    );
  });

  it("preserves archived recovered concepts instead of rehydrating them as active", async () => {
    await seedCapture({ version: 1 });
    const archivedAt = "2026-07-30T13:00:00.000Z";
    const setup = createSetup({
      remoteEntities: [
        conceptEntityResponse({
          id: conceptId,
          label: "Archived Concept",
          version: 2,
          archivedAt,
        }),
      ],
      responses: [
        pullResponse({
          changes: [relationChange({ sequence: "1", version: 1 })],
          nextCursor: "1",
        }),
      ],
    });

    const result = await setup.coordinator.run();

    expect(result.status).toBe("SUCCESS");
    await expect((await getVinemaDb()).get(CONTEXTS_STORE, conceptId)).resolves.toMatchObject({
      id: conceptId,
      archivedAt,
    });
  });

  it("aborts without advancing the cursor when recovered dependency workspace is wrong", async () => {
    await seedCapture({ version: 1 });
    const setup = createSetup({
      getEntity: async () =>
        conceptEntityResponse({
          id: conceptId,
          label: "Wrong Workspace Concept",
          workspaceId: "99999999-9999-4999-8999-999999999999",
        }),
      responses: [
        pullResponse({
          changes: [relationChange({ sequence: "1", version: 1 })],
          nextCursor: "1",
        }),
      ],
    });

    const result = await setup.coordinator.run();

    expect(result).toMatchObject({
      status: "FAILED",
      nextCursor: "0",
    });
    expect(result.errors[0]).toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(getMetadata()).resolves.toMatchObject({
      pullCursor: "0",
      lastSyncErrorCode: "INVALID_RESPONSE",
    });
  });

  it("aborts without advancing the cursor when recovered dependency type is wrong", async () => {
    await seedCapture({ version: 1 });
    const setup = createSetup({
      getEntity: async () => captureEntityResponse({ id: conceptId }),
      responses: [
        pullResponse({
          changes: [relationChange({ sequence: "1", version: 1 })],
          nextCursor: "1",
        }),
      ],
    });

    const result = await setup.coordinator.run();

    expect(result.status).toBe("FAILED");
    expect(result.errors[0]).toMatchObject({ code: "INVALID_RESPONSE" });
    await expect((await getVinemaDb()).get(NODE_CONTEXT_RELATIONS_STORE, relationId))
      .resolves.toBeUndefined();
    await expect(getMetadata()).resolves.toMatchObject({ pullCursor: "0" });
  });

  it("aborts without advancing the cursor when recovered dependency id is wrong", async () => {
    await seedCapture({ version: 1 });
    const setup = createSetup({
      getEntity: async () =>
        conceptEntityResponse({
          id: "77777777-7777-4777-8777-777777777777",
          label: "Wrong Concept",
        }),
      responses: [
        pullResponse({
          changes: [relationChange({ sequence: "1", version: 1 })],
          nextCursor: "1",
        }),
      ],
    });

    const result = await setup.coordinator.run();

    expect(result.status).toBe("FAILED");
    expect(result.errors[0]).toMatchObject({ code: "INVALID_RESPONSE" });
    await expect((await getVinemaDb()).get(NODE_CONTEXT_RELATIONS_STORE, relationId))
      .resolves.toBeUndefined();
    await expect(getMetadata()).resolves.toMatchObject({ pullCursor: "0" });
  });

  it("applies relations after their entities in the same batch", async () => {
    const setup = createSetup({
      responses: [
        pullResponse({
          changes: [
            relationChange({ sequence: "3", version: 1 }),
            conceptChange({ sequence: "2", version: 1 }),
            captureChange({ sequence: "1", version: 1 }),
          ],
          nextCursor: "3",
        }),
      ],
    });

    const result = await setup.coordinator.run();
    const db = await getVinemaDb();

    expect(result).toMatchObject({ status: "SUCCESS", applied: 3 });
    await expect(
      db.get(NODE_CONTEXT_RELATIONS_STORE, relationId),
    ).resolves.toMatchObject({
      id: relationId,
      nodeId: captureId,
      contextId: conceptId,
      version: 1,
    });
  });

  it("recovers dependencies even when their own change arrives in a later batch", async () => {
    const setup = createSetup({
      config: { pullBatchSize: 1, maxPullBatchesPerRun: 3 },
      remoteEntities: [
        captureEntityResponse({ id: captureId, version: 1 }),
        conceptEntityResponse({
          id: conceptId,
          label: "Remote Concept",
          version: 1,
        }),
      ],
      responses: [
        pullResponse({
          changes: [
            relationChange({
              sequence: "1",
              captureId,
              conceptId,
              version: 1,
            }),
          ],
          nextCursor: "1",
          hasMore: true,
        }),
        pullResponse({
          changes: [captureChange({ sequence: "2", version: 1 })],
          nextCursor: "2",
          hasMore: true,
        }),
        pullResponse({
          changes: [conceptChange({ sequence: "3", version: 1 })],
          nextCursor: "3",
          hasMore: false,
        }),
      ],
    });

    const result = await setup.coordinator.run();
    const db = await getVinemaDb();

    expect(result).toMatchObject({
      status: "SUCCESS",
      nextCursor: "3",
    });
    await expect(
      db.get(NODE_CONTEXT_RELATIONS_STORE, relationId),
    ).resolves.toMatchObject({ id: relationId });
    expect(result.idempotent).toBeGreaterThanOrEqual(2);
  });

  it("retries recovered dependencies idempotently without duplicating relations", async () => {
    await seedCapture({ version: 1 });
    const setup = createSetup({
      remoteEntities: [
        conceptEntityResponse({
          id: conceptId,
          label: "Recovered Concept",
          version: 1,
        }),
      ],
      responses: [
        pullResponse({
          changes: [relationChange({ sequence: "1", version: 1 })],
          nextCursor: "1",
        }),
        pullResponse({
          changes: [relationChange({ sequence: "1", version: 1 })],
          nextCursor: "1",
        }),
      ],
    });

    const first = await setup.coordinator.run();
    const second = await setup.coordinator.run();
    const db = await getVinemaDb();
    const relations = await db.getAll(NODE_CONTEXT_RELATIONS_STORE);

    expect(first.status).toBe("SUCCESS");
    expect(second.status).toBe("SUCCESS");
    expect(second.idempotent).toBeGreaterThanOrEqual(1);
    expect(relations.filter((relation) => relation.id === relationId)).toHaveLength(1);
  });

  it("recovers the cursor 980 poison batch and applies captures that follow the bad relation", async () => {
    const oldConceptId = "7399aa14-942e-497e-a2df-e02af27ccab4";
    const blockedRelationId = "f44ee3d6-a5b6-46e1-93f6-7e216d8839ca";
    const sourceCaptureId = "57bb44c8-5707-4597-81e8-4b100b69bcfd";
    const laterCaptureId = "6cc068d6-f41c-4407-a604-3862da2290c7";
    const setup = createSetup({
      remoteEntities: [
        conceptEntityResponse({
          id: oldConceptId,
          label: "Equipos moviles",
          version: 1,
        }),
      ],
      responses: [
        pullResponse({
          changes: [
            captureChange({
              sequence: "981",
              captureId: sourceCaptureId,
              version: 1,
              content: "La interaccion entre equipos moviles y trabajadores.",
            }),
            relationChange({
              sequence: "984",
              relationId: blockedRelationId,
              captureId: sourceCaptureId,
              conceptId: oldConceptId,
              version: 1,
            }),
            captureChange({
              sequence: "1049",
              captureId: laterCaptureId,
              version: 1,
              content: "Durante las ultimas semanas me cuesta conciliar el sueno.",
            }),
          ],
          nextCursor: "1057",
        }),
      ],
    });
    await setMetadataCursor("980");

    const result = await setup.coordinator.run();
    const db = await getVinemaDb();

    expect(result).toMatchObject({
      status: "SUCCESS",
      previousCursor: "980",
      nextCursor: "1057",
      pulled: 3,
    });
    await expect(db.get(CONTEXTS_STORE, oldConceptId)).resolves.toMatchObject({
      name: "Equipos moviles",
    });
    await expect(
      db.get(NODE_CONTEXT_RELATIONS_STORE, blockedRelationId),
    ).resolves.toMatchObject({
      nodeId: sourceCaptureId,
      contextId: oldConceptId,
    });
    await expect(db.get(NODES_STORE, laterCaptureId)).resolves.toMatchObject({
      id: laterCaptureId,
      content: "Durante las ultimas semanas me cuesta conciliar el sueno.",
    });
  });

  it("does not generate outbox records while applying remote changes", async () => {
    const setup = createSetup({
      responses: [
        pullResponse({
          changes: [captureChange({ sequence: "1", version: 1 })],
          nextCursor: "1",
        }),
      ],
    });

    await setup.coordinator.run();

    await expect(
      new IndexedDbSyncOutboxRepository().listPending(workspaceId, 10),
    ).resolves.toHaveLength(0);
  });

  it("does not emit UI invalidation events for empty or idempotent pulls", async () => {
    const events: unknown[] = [];
    const unsubscribe = subscribeToSyncDataChanged((detail) => {
      events.push(detail);
    });

    await createSetup({
      responses: [pullResponse({ nextCursor: "1" })],
    }).coordinator.run();
    await seedCapture({ version: 1 });
    await createSetup({
      responses: [
        pullResponse({
          changes: [captureChange({ sequence: "2", version: 1 })],
          nextCursor: "2",
        }),
      ],
    }).coordinator.run();

    expect(events).toEqual([]);
    unsubscribe();
  });

  it("applies a workspace knowledge reset change and clears pending local mutations", async () => {
    const events: unknown[] = [];
    const unsubscribe = subscribeToSyncDataChanged((detail) => {
      events.push(detail);
    });
    await seedCapture({ version: 1 });
    await seedConcept({ version: 1 });
    await seedRelation({ version: 1 });
    await new IndexedDbSyncOutboxRepository(() => now).enqueue({
      workspaceId,
      deviceId,
      mutation: captureMutation({
        mutationId: "66666666-6666-4666-8666-666666666666",
        entityId: captureId,
        baseVersion: 1,
      }),
    });
    const setup = createSetup({
      responses: [
        pullResponse({
          changes: [knowledgeResetChange({ sequence: "8" })],
          nextCursor: "8",
        }),
      ],
    });

    const result = await setup.coordinator.run();
    const db = await getVinemaDb();

    expect(result).toMatchObject({
      status: "SUCCESS",
      pulled: 1,
      applied: 1,
      nextCursor: "8",
    });
    await expect(db.get(NODES_STORE, captureId)).resolves.toBeUndefined();
    await expect(db.get(CONTEXTS_STORE, conceptId)).resolves.toBeUndefined();
    await expect(
      db.get(NODE_CONTEXT_RELATIONS_STORE, relationId),
    ).resolves.toBeUndefined();
    await expect(
      db.get(SYNC_METADATA_STORE, [workspaceId, deviceId]),
    ).resolves.toMatchObject({ pullCursor: "8" });
    await expect(
      new IndexedDbSyncOutboxRepository().listPending(workspaceId, 10),
    ).resolves.toHaveLength(0);
    expect(events).toEqual([
      {
        workspaceId,
        entityTypes: ["capture", "concept", "captureConcept"],
        changedAt: now,
      },
    ]);
    unsubscribe();
  });

  it("applies newer versions, keeps equal versions idempotent and ignores older versions", async () => {
    await seedCapture({ version: 2, content: "Local v2" });
    const newer = createSetup({
      responses: [
        pullResponse({
          changes: [
            captureChange({ sequence: "1", version: 3, content: "Remote v3" }),
          ],
          nextCursor: "1",
        }),
      ],
    });
    await newer.coordinator.run();
    const equal = createSetup({
      responses: [
        pullResponse({
          changes: [
            captureChange({ sequence: "2", version: 3, content: "Ignored equal" }),
          ],
          nextCursor: "2",
        }),
      ],
    });
    const equalResult = await equal.coordinator.run();
    const older = createSetup({
      responses: [
        pullResponse({
          changes: [
            captureChange({ sequence: "3", version: 1, content: "Ignored old" }),
          ],
          nextCursor: "3",
        }),
      ],
    });
    const olderResult = await older.coordinator.run();

    await expect((await getVinemaDb()).get(NODES_STORE, captureId)).resolves.toMatchObject({
      content: "Remote v3",
      version: 3,
    });
    expect(equalResult.idempotent).toBe(1);
    expect(olderResult.ignored).toBe(1);
  });

  it("detects local pending mutations as conflicts without overwriting remote data", async () => {
    await seedCapture({ version: 1, content: "Local content" });
    await new IndexedDbSyncOutboxRepository(() => now).enqueue({
      workspaceId,
      deviceId,
      mutation: captureMutation({
        mutationId: "66666666-6666-4666-8666-666666666666",
        entityId: captureId,
        baseVersion: 1,
      }),
    });
    const setup = createSetup({
      responses: [
        pullResponse({
          changes: [
            captureChange({ sequence: "1", version: 2, content: "Remote v2" }),
          ],
          nextCursor: "1",
        }),
      ],
    });

    const result = await setup.coordinator.run();
    const conflict = await new IndexedDbSyncOutboxRepository().getById(
      "66666666-6666-4666-8666-666666666666",
    );

    expect(result).toMatchObject({ status: "PARTIAL", conflicts: 1 });
    await expect((await getVinemaDb()).get(NODES_STORE, captureId)).resolves.toMatchObject({
      content: "Local content",
      version: 1,
    });
    expect(conflict).toMatchObject({
      status: "CONFLICT",
      conflictData: {
        reason: "REMOTE_CHANGE_CONFLICT",
        serverEntity: expect.objectContaining({
          id: captureId,
          content: "Remote v2",
          version: 2,
        }),
        remoteChange: { entityId: captureId, version: 2 },
      },
    });
  });

  it("archives remote relations by deleting the local relation", async () => {
    await seedCapture({ version: 1 });
    await seedConcept({ version: 1 });
    await seedRelation({ version: 1 });
    const setup = createSetup({
      responses: [
        pullResponse({
          changes: [
            relationChange({
              sequence: "2",
              version: 2,
              archivedAt: "2026-07-30T13:00:00.000Z",
            }),
          ],
          nextCursor: "2",
        }),
      ],
    });

    const result = await setup.coordinator.run();

    expect(result.applied).toBe(1);
    await expect(
      (await getVinemaDb()).get(NODE_CONTEXT_RELATIONS_STORE, relationId),
    ).resolves.toBeUndefined();
  });

  it("applies remote capture archives idempotently without exposing them in normal lists", async () => {
    await seedCapture({ version: 1 });
    const archivedAt = "2026-07-30T13:00:00.000Z";
    const setup = createSetup({
      responses: [
        pullResponse({
          changes: [
            captureChange({
              sequence: "2",
              version: 2,
              archivedAt,
            }),
          ],
          nextCursor: "2",
        }),
        pullResponse({
          changes: [
            captureChange({
              sequence: "2",
              version: 2,
              archivedAt,
            }),
          ],
          nextCursor: "2",
        }),
      ],
    });

    const first = await setup.coordinator.run();
    const second = await setup.coordinator.run();

    expect(first.applied).toBe(1);
    expect(second.idempotent).toBe(1);
    await expect(
      new IndexedDbNodeRepository().listByWorkspace(workspaceId),
    ).resolves.toEqual([]);
    await expect(
      new IndexedDbNodeRepository().listByWorkspace(workspaceId, {
        includeArchived: true,
      }),
    ).resolves.toMatchObject([{ id: captureId, archivedAt, version: 2 }]);
  });

  it("cancels in-flight pull using AbortSignal", async () => {
    const seenSignal: { current: AbortSignal | null } = { current: null };
    const setup = createSetup({
      pull: vi.fn(({ signal }) => {
        seenSignal.current = signal ?? null;
        return new Promise<PullResponse>((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            reject(new SyncClientError({ code: "ABORTED", message: "Cancelado" }));
          });
        });
      }),
    });

    const run = setup.coordinator.run();
    await waitFor(() => seenSignal.current !== null);
    setup.coordinator.cancel();
    const result = await run;

    expect(result.status).toBe("CANCELLED");
    expect(seenSignal.current?.aborted).toBe(true);
    await expect(getMetadata()).resolves.toMatchObject({
      lastSyncErrorCode: "ABORTED",
    });
  });

  it("skips concurrent runs for the same workspace", async () => {
    const registry = createPullCoordinatorRunRegistry();
    const releasePull: { current: (() => void) | null } = { current: null };
    const first = createSetup({
      registry,
      pull: vi.fn(
        () =>
          new Promise<PullResponse>((resolve) => {
            releasePull.current = () => resolve(pullResponse({ nextCursor: "1" }));
          }),
      ),
    });
    const second = createSetup({ registry });

    const firstRun = first.coordinator.run();
    await waitFor(() => releasePull.current !== null);
    const skipped = await second.coordinator.run();
    releasePull.current?.();
    const finished = await firstRun;

    expect(skipped.status).toBe("SKIPPED_ALREADY_RUNNING");
    expect(finished.status).toBe("SUCCESS");
  });

  it("logs cursors and batch counts without payloads", async () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const setup = createSetup({
      logger,
      responses: [
        pullResponse({
          changes: [captureChange({ sequence: "1", content: "Secret-ish text" })],
          nextCursor: "1",
        }),
      ],
    });

    await setup.coordinator.run();

    expect(logger.debug).toHaveBeenCalledWith(
      "pull batch received",
      expect.objectContaining({ previousCursor: "0", nextCursor: "1", changes: 1 }),
    );
    expect(JSON.stringify(logger)).not.toContain("Secret-ish text");
  });

  it("rejects invalid pull configuration", () => {
    expect(() => createSetup({ config: { pullBatchSize: 0 } })).toThrow(
      PullCoordinatorConfigError,
    );
  });
});

function createSetup(input: {
  responses?: PullResponse[];
  pull?: SyncClient["pull"];
  getEntity?: SyncClient["getEntity"];
  remoteEntities?: SyncEntityResponse[];
  config?: Parameters<typeof createPullCoordinator>[0]["config"];
  logger?: Parameters<typeof createPullCoordinator>[0]["logger"];
  registry?: Parameters<typeof createPullCoordinator>[0]["runRegistry"];
} = {}) {
  const responses = [...(input.responses ?? [pullResponse()])];
  const remoteEntities = new Map(
    (input.remoteEntities ?? []).map((entity) => [entityKey(entity), entity]),
  );
  const pull =
    input.pull ??
    vi.fn(async () => responses.shift() ?? pullResponse());
  const getEntity = vi.fn(
    input.getEntity ??
      (async (entityInput: Parameters<SyncClient["getEntity"]>[0]) => {
        const entity = remoteEntities.get(entityKey(entityInput));
        if (!entity) {
          throw new SyncClientError({
            code: "UNKNOWN_ERROR",
            status: 404,
            message: "La entidad no existe.",
          });
        }

        return entity;
      }),
  );
  const coordinator = createPullCoordinator({
    workspaceId,
    deviceId,
    syncClient: { pull, getEntity },
    config: input.config,
    clock: () => now,
    logger: input.logger,
    runRegistry: input.registry ?? createPullCoordinatorRunRegistry(),
  });

  return { coordinator, pull, getEntity };
}

function pullResponse(input: Partial<PullResponse> = {}): PullResponse {
  return {
    changes: [],
    nextCursor: "0",
    hasMore: false,
    ...input,
  };
}

function captureChange(input: {
  sequence: string;
  version?: number;
  content?: string;
  captureId?: string;
  archivedAt?: string | null;
}) {
  return {
    sequence: input.sequence,
    entityType: "capture" as const,
    operation: input.archivedAt ? "archive" as const : "upsert" as const,
    entity: {
      id: input.captureId ?? captureId,
      workspaceId,
      content: input.content ?? "Remote capture",
      createdAt: now,
      updatedAt: now,
      archivedAt: input.archivedAt ?? null,
      version: input.version ?? 1,
    },
  };
}

function conceptChange(input: { sequence: string; version?: number }) {
  return {
    sequence: input.sequence,
    entityType: "concept" as const,
    operation: "upsert" as const,
    entity: {
      id: conceptId,
      workspaceId,
      label: "Remote Concept",
      normalizedKey: "remote|concept",
      aliases: [],
      normalizedAliases: [],
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      mergedIntoId: null,
      version: input.version ?? 1,
    },
  };
}

function relationChange(input: {
  sequence: string;
  version?: number;
  relationId?: string;
  captureId?: string;
  conceptId?: string;
  archivedAt?: string | null;
}) {
  return {
    sequence: input.sequence,
    entityType: "captureConcept" as const,
    operation: input.archivedAt ? "archive" as const : "upsert" as const,
    entity: {
      id: input.relationId ?? relationId,
      workspaceId,
      captureId: input.captureId ?? captureId,
      conceptId: input.conceptId ?? conceptId,
      source: "USER_CONFIRMED" as const,
      createdAt: now,
      updatedAt: now,
      archivedAt: input.archivedAt ?? null,
      version: input.version ?? 1,
    },
  };
}

function knowledgeResetChange(input: { sequence: string }) {
  return {
    sequence: input.sequence,
    entityType: "workspaceKnowledgeReset" as const,
    operation: "reset" as const,
    reset: {
      workspaceId,
      occurredAt: now,
      resetVersion: input.sequence,
    },
  };
}

async function getMetadata() {
  const db = await getVinemaDb();
  return db.get(SYNC_METADATA_STORE, [workspaceId, deviceId]);
}

async function setMetadataCursor(cursor: string) {
  const db = await getVinemaDb();
  await db.put(SYNC_METADATA_STORE, {
    workspaceId,
    deviceId,
    pullCursor: cursor,
    lastPullAttemptAt: now,
    lastSuccessfulPushAt: null,
    lastSuccessfulPullAt: now,
    lastSyncAttemptAt: null,
    lastSyncErrorCode: null,
    lastSyncErrorMessage: null,
    lastMemoryVerificationAt: null,
    lastMemoryVerificationStatus: null,
    lastMemoryVerificationError: null,
    createdAt: now,
    updatedAt: now,
  });
}

async function seedCapture(input: { version: number; content?: string }) {
  const db = await getVinemaDb();
  await db.put(NODES_STORE, {
    id: captureId,
    workspaceId,
    type: "NOTE",
    content: input.content ?? "Local capture",
    status: "ACTIVE",
    organizationStatus: "ORGANIZED",
    metadata: {},
    version: input.version,
    createdAt: now,
    contentUpdatedAt: now,
    archivedAt: null,
    restoredAt: null,
    updatedAt: now,
    deletedAt: null,
    createdByDeviceId: deviceId,
    lastModifiedByDeviceId: deviceId,
  });
}

async function seedConcept(input: { version: number }) {
  const db = await getVinemaDb();
  await db.put(CONTEXTS_STORE, {
    id: conceptId,
    workspaceId,
    type: "AREA",
    name: "Local Concept",
    description: null,
    version: input.version,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  });
}

async function seedRelation(input: { version: number }) {
  const db = await getVinemaDb();
  await db.put(NODE_CONTEXT_RELATIONS_STORE, {
    id: relationId,
    workspaceId,
    nodeId: captureId,
    contextId: conceptId,
    relationType: "CONTEXT",
    version: input.version,
    createdAt: now,
  });
}

function captureEntityResponse(input: {
  id: string;
  version?: number;
  content?: string;
}): SyncEntityResponse {
  return {
    entityType: "capture",
    entity: {
      id: input.id,
      workspaceId,
      content: input.content ?? "Recovered capture",
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      version: input.version ?? 1,
    },
  };
}

function conceptEntityResponse(input: {
  id: string;
  label: string;
  workspaceId?: string;
  version?: number;
  archivedAt?: string | null;
}): SyncEntityResponse {
  return {
    entityType: "concept",
    entity: {
      id: input.id,
      workspaceId: input.workspaceId ?? workspaceId,
      label: input.label,
      normalizedKey: input.label.toLocaleLowerCase("es"),
      aliases: [],
      normalizedAliases: [],
      createdAt: now,
      updatedAt: now,
      archivedAt: input.archivedAt ?? null,
      mergedIntoId: null,
      version: input.version ?? 1,
    },
  };
}

function entityKey(input: SyncEntityResponse | Parameters<SyncClient["getEntity"]>[0]) {
  if ("entity" in input) {
    return `${input.entityType}:${input.entity.id}`;
  }

  return `${input.entityType}:${input.entityId}`;
}

function captureMutation(input: {
  mutationId: string;
  entityId: string;
  baseVersion: number | null;
}): SyncMutation {
  return {
    mutationId: input.mutationId,
    entityType: "capture",
    operation: "upsert",
    entityId: input.entityId,
    baseVersion: input.baseVersion,
    payload: {
      content: "Local pending",
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    },
  };
}

async function waitFor(condition: () => boolean) {
  for (let index = 0; index < 20; index += 1) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error("Condition was not met.");
}
