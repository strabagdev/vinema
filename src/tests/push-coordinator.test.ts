import { describe, expect, it, vi } from "vitest";
import type { PushResponse, SyncMutation } from "@vinema/sync-contracts";
import {
  SyncClientError,
  type SyncClient,
} from "@/features/sync/sync-client";
import {
  createPushCoordinator,
  createPushCoordinatorRunRegistry,
  PushCoordinatorConfigError,
  type PushCoordinatorMetadataRepository,
  type PushCoordinatorOutboxRepository,
} from "@/features/sync/push-coordinator";
import type { SyncMutationOutboxRecord } from "@/features/sync/sync-outbox-repository";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const deviceId = "22222222-2222-4222-8222-222222222222";
const now = "2026-07-30T12:00:00.000Z";

describe("push coordinator", () => {
  it("returns success for an empty queue and records metadata", async () => {
    const setup = createSetup();

    const result = await setup.coordinator.run();

    expect(result).toMatchObject({
      status: "SUCCESS",
      pushed: 0,
      removedFromOutbox: 0,
    });
    expect(setup.client.push).not.toHaveBeenCalled();
    expect(setup.metadata.events).toContainEqual(["attempt", now]);
    expect(setup.metadata.events).toContainEqual(["success", now]);
    expect(setup.metadata.events).toContainEqual(["clearFailure"]);
  });

  it("pushes one mutation and removes it after accepted confirmation", async () => {
    const mutation = makeMutation("33333333-3333-4333-8333-333333333333");
    const setup = createSetup({
      records: [makeRecord(mutation)],
      responses: [acceptedResponse(mutation)],
    });

    const result = await setup.coordinator.run();

    expect(result).toMatchObject({
      status: "SUCCESS",
      pushed: 1,
      removedFromOutbox: 1,
    });
    expect(setup.outbox.records).toHaveLength(0);
    expect(setup.client.push).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        deviceId,
        mutations: [mutation],
        signal: expect.any(AbortSignal),
      }),
    );
    expect(setup.acknowledgementRepository.recordMany).toHaveBeenCalledWith([
      expect.objectContaining({
        workspaceId,
        entityType: "capture",
        entityId: mutation.entityId,
        acknowledgedRemoteVersion: 1,
        generation: "1",
      }),
    ]);
  });

  it("pushes capture archive mutations through the existing push channel", async () => {
    const mutation = makeArchiveMutation("33333333-3333-4333-8333-333333333333");
    const setup = createSetup({
      records: [makeRecord(mutation)],
      responses: [acceptedResponse(mutation)],
    });

    const result = await setup.coordinator.run();

    expect(result.status).toBe("SUCCESS");
    expect(setup.client.push).toHaveBeenCalledWith(
      expect.objectContaining({
        mutations: [mutation],
      }),
    );
    expect(setup.outbox.records).toHaveLength(0);
  });

  it("does not push pending mutations for an entity with an active conflict", async () => {
    const mutation = makeMutation("33333333-3333-4333-8333-333333333333");
    const conflict = makeRecord(mutation, {
      mutationId: "44444444-4444-4444-8444-444444444444",
      status: "CONFLICT",
      conflictData: {
        reason: "VERSION_CONFLICT",
        serverEntity: { version: 11 },
      },
    });
    const setup = createSetup({
      records: [makeRecord(mutation), conflict],
      responses: [acceptedResponse(mutation)],
    });

    const result = await setup.coordinator.run();

    expect(result).toMatchObject({
      status: "SUCCESS",
      pushed: 0,
      deferred: 1,
    });
    expect(setup.client.push).not.toHaveBeenCalled();
    expect(setup.outbox.records).toHaveLength(2);
  });

  it("processes multiple batches", async () => {
    const first = makeMutation("33333333-3333-4333-8333-333333333333");
    const second = makeMutation("44444444-4444-4444-8444-444444444444");
    const setup = createSetup({
      config: { batchSize: 1 },
      records: [makeRecord(first), makeRecord(second)],
      responses: [acceptedResponse(first), acceptedResponse(second)],
    });

    const result = await setup.coordinator.run();

    expect(result.pushed).toBe(2);
    expect(setup.client.push).toHaveBeenCalledTimes(2);
    expect(setup.outbox.records).toHaveLength(0);
  });

  it("retries retryable server errors inside the same run", async () => {
    const mutation = makeMutation("33333333-3333-4333-8333-333333333333");
    const sleep = vi.fn(async () => undefined);
    const setup = createSetup({
      records: [makeRecord(mutation)],
      responses: [
        new SyncClientError({
          code: "SERVER_ERROR",
          message: "Temporal",
        }),
        acceptedResponse(mutation),
      ],
      sleep,
    });

    const result = await setup.coordinator.run();

    expect(result.status).toBe("SUCCESS");
    expect(result.pushed).toBe(1);
    expect(setup.client.push).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(500, expect.any(AbortSignal));
  });

  it("defers retryable server errors after max attempts", async () => {
    const mutation = makeMutation("33333333-3333-4333-8333-333333333333");
    const setup = createSetup({
      config: { maxAttemptsPerRun: 1, retryBaseDelayMs: 1_000 },
      records: [makeRecord(mutation)],
      responses: [
        new SyncClientError({
          code: "SERVER_ERROR",
          message: "Todavia no",
        }),
      ],
    });

    const result = await setup.coordinator.run();

    expect(result).toMatchObject({ status: "FAILED", failed: 1 });
    expect(setup.outbox.records[0]).toMatchObject({
      status: "FAILED",
      lastErrorCode: "SERVER_ERROR",
      nextAttemptAt: "2026-07-30T12:00:01.000Z",
    });
  });

  it("keeps network and timeout failures pending without deleting mutations", async () => {
    const network = makeMutation("33333333-3333-4333-8333-333333333333");
    const timeout = makeMutation("44444444-4444-4444-8444-444444444444");
    const networkSetup = createSetup({
      records: [makeRecord(network)],
      responses: [
        new SyncClientError({ code: "NETWORK_ERROR", message: "Offline" }),
      ],
    });
    const timeoutSetup = createSetup({
      records: [makeRecord(timeout)],
      responses: [
        new SyncClientError({ code: "TIMEOUT", message: "Lento" }),
      ],
    });

    await expect(networkSetup.coordinator.run()).resolves.toMatchObject({
      status: "OFFLINE",
      deferred: 1,
    });
    await expect(timeoutSetup.coordinator.run()).resolves.toMatchObject({
      status: "OFFLINE",
      deferred: 1,
    });
    expect(networkSetup.outbox.records[0]?.status).toBe("PENDING");
    expect(timeoutSetup.outbox.records[0]?.status).toBe("PENDING");
  });

  it("reports offline push failures as expected operational state instead of critical errors", async () => {
    const mutation = makeMutation("33333333-3333-4333-8333-333333333333");
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const setup = createSetup({
      records: [makeRecord(mutation)],
      responses: [new SyncClientError({ code: "NETWORK_ERROR", message: "Offline" })],
      logger,
    });

    await expect(setup.coordinator.run()).resolves.toMatchObject({
      status: "OFFLINE",
      deferred: 1,
    });

    expect(logger.info).toHaveBeenCalledWith(
      "push coordinator offline",
      expect.objectContaining({ status: "OFFLINE", errorCode: "NETWORK_ERROR" }),
    );
    expect(logger.error).not.toHaveBeenCalledWith(
      "push coordinator failed",
      expect.anything(),
    );
    expect(setup.outbox.records).toMatchObject([{ status: "PENDING" }]);
  });

  it("stops on auth errors without deleting mutations", async () => {
    const mutation = makeMutation("33333333-3333-4333-8333-333333333333");
    const setup = createSetup({
      records: [makeRecord(mutation)],
      responses: [
        new SyncClientError({ code: "AUTH_ERROR", message: "No autorizado" }),
      ],
    });

    const result = await setup.coordinator.run();

    expect(result).toMatchObject({ status: "FAILED", deferred: 1 });
    expect(setup.outbox.records).toMatchObject([{ status: "PENDING" }]);
    expect(setup.metadata.events).toContainEqual([
      "failure",
      "AUTH_ERROR",
      "No autorizado",
    ]);
  });

  it("removes duplicate rejections but marks conflicts and validation failures", async () => {
    const duplicate = makeMutation("33333333-3333-4333-8333-333333333333");
    const conflict = makeMutation("44444444-4444-4444-8444-444444444444");
    const rejected = makeMutation("55555555-5555-4555-8555-555555555555");
    const setup = createSetup({
      records: [
        makeRecord(duplicate),
        makeRecord(conflict),
        makeRecord(rejected),
      ],
      responses: [
        {
          accepted: [],
          conflicts: [
            {
              mutationId: conflict.mutationId,
              entityType: "capture",
              entityId: conflict.entityId,
              reason: "VERSION_CONFLICT",
              serverEntity: { version: 3 },
            },
          ],
          rejected: [
            {
              mutationId: duplicate.mutationId,
              entityType: "capture",
              entityId: duplicate.entityId,
              code: "DUPLICATE_MUTATION",
              message: "Ya aplicada",
            },
            {
              mutationId: rejected.mutationId,
              entityType: "capture",
              entityId: rejected.entityId,
              code: "VALIDATION_ERROR",
              message: "Payload invalido",
            },
          ],
          serverCursor: "10",
        },
      ],
    });

    const result = await setup.coordinator.run();

    expect(result).toMatchObject({
      status: "PARTIAL",
      conflicts: 1,
      failed: 1,
      removedFromOutbox: 1,
    });
    expect(setup.outbox.records.map((record) => record.mutationId)).toEqual([
      conflict.mutationId,
      rejected.mutationId,
    ]);
    expect(setup.outbox.records).toMatchObject([
      { status: "CONFLICT" },
      { status: "FAILED", lastErrorCode: "VALIDATION_ERROR" },
    ]);
  });

  it("cancels in-flight HTTP, returns processing to pending and keeps records", async () => {
    const mutation = makeMutation("33333333-3333-4333-8333-333333333333");
    const seenSignal: { current: AbortSignal | null } = { current: null };
    const push: SyncClient["push"] = ({ signal }) => {
      seenSignal.current = signal ?? null;
      return new Promise<PushResponse>((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          reject(
            new SyncClientError({
              code: "ABORTED",
              message: "Cancelado",
            }),
          );
        });
      });
    };
    const setup = createSetup({
      records: [makeRecord(mutation)],
      push: vi.fn(push),
    });

    const promise = setup.coordinator.run();
    await waitFor(() => seenSignal.current !== null);
    setup.coordinator.cancel();
    const result = await promise;

    expect(result.status).toBe("CANCELLED");
    const capturedSignal = seenSignal.current;
    if (!capturedSignal) {
      throw new Error("AbortSignal was not passed to push.");
    }
    expect(capturedSignal.aborted).toBe(true);
    expect(setup.outbox.records).toMatchObject([{ status: "PENDING" }]);
  });

  it("skips concurrent runs for the same workspace", async () => {
    const registry = createPushCoordinatorRunRegistry();
    const mutation = makeMutation("33333333-3333-4333-8333-333333333333");
    const releasePush: { current: (() => void) | null } = { current: null };
    const blockingPush: SyncClient["push"] = () =>
      new Promise<PushResponse>((resolve) => {
        releasePush.current = () => resolve(acceptedResponse(mutation));
      });
    const first = createSetup({
      registry,
      records: [makeRecord(mutation)],
      push: vi.fn(blockingPush),
    });
    const second = createSetup({ registry });

    const firstRun = first.coordinator.run();
    await waitFor(() => releasePush.current !== null);
    const skipped = await second.coordinator.run();
    const release = releasePush.current;
    if (!release) {
      throw new Error("Push release was not captured.");
    }
    release();
    const finished = await firstRun;

    expect(skipped.status).toBe("SKIPPED_ALREADY_RUNNING");
    expect(finished.status).toBe("SUCCESS");
  });

  it("resets stale processing before reading pending", async () => {
    const setup = createSetup();

    await setup.coordinator.run();

    expect(setup.outbox.resetCutoff).toBe("2026-07-30T11:55:00.000Z");
  });

  it("respects future nextAttemptAt", async () => {
    const mutation = makeMutation("33333333-3333-4333-8333-333333333333");
    const setup = createSetup({
      records: [
        makeRecord(mutation, {
          nextAttemptAt: "2026-07-30T13:00:00.000Z",
        }),
      ],
    });

    const result = await setup.coordinator.run();

    expect(result).toMatchObject({ status: "SUCCESS", deferred: 1, pushed: 0 });
    expect(setup.client.push).not.toHaveBeenCalled();
  });

  it("counts deferred nextAttemptAt records once across multiple batches", async () => {
    const ready = makeMutation("33333333-3333-4333-8333-333333333333");
    const future = makeMutation("44444444-4444-4444-8444-444444444444");
    const setup = createSetup({
      config: { batchSize: 1 },
      records: [
        makeRecord(ready),
        makeRecord(future, {
          nextAttemptAt: "2026-07-30T13:00:00.000Z",
        }),
      ],
      responses: [acceptedResponse(ready)],
    });

    const result = await setup.coordinator.run();

    expect(result).toMatchObject({ status: "SUCCESS", pushed: 1, deferred: 1 });
    expect(setup.outbox.records).toMatchObject([
      { mutationId: future.mutationId, status: "PENDING" },
    ]);
  });

  it("logs safe operational context without payloads", async () => {
    const mutation = makeMutation("33333333-3333-4333-8333-333333333333");
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const setup = createSetup({
      records: [makeRecord(mutation)],
      responses: [acceptedResponse(mutation)],
      logger,
    });

    await setup.coordinator.run();

    expect(logger.info).toHaveBeenCalledWith(
      "push coordinator started",
      expect.objectContaining({ workspaceId }),
    );
    expect(JSON.stringify(logger)).not.toContain("Texto local");
  });

  it("rejects invalid configuration", () => {
    expect(
      () =>
        createSetup({
          config: { batchSize: 0 },
        }),
    ).toThrow(PushCoordinatorConfigError);
  });
});

function createSetup(input: {
  records?: SyncMutationOutboxRecord[];
  responses?: Array<PushResponse | Error>;
  push?: SyncClient["push"];
  config?: Parameters<typeof createPushCoordinator>[0]["config"];
  sleep?: Parameters<typeof createPushCoordinator>[0]["sleep"];
  logger?: Parameters<typeof createPushCoordinator>[0]["logger"];
  registry?: Parameters<typeof createPushCoordinator>[0]["runRegistry"];
} = {}) {
  const outbox = new FakeOutboxRepository(input.records ?? []);
  const metadata = new FakeMetadataRepository();
  const acknowledgementRepository = {
    recordMany: vi.fn(async () => undefined),
  };
  const responses = [...(input.responses ?? [])];
  const push =
    input.push ??
    vi.fn(async () => {
      const response = responses.shift();
      if (response instanceof Error) {
        throw response;
      }
      return response ?? emptyResponse();
    });
  const client: SyncClient = {
    health: async () => ({ status: "ok" }),
    getCapture: async () => {
      throw new Error("getCapture is not used by push coordinator tests.");
    },
    getEntity: async () => {
      throw new Error("getEntity is not used by push coordinator tests.");
    },
    pull: async () => ({ changes: [], nextCursor: "0", hasMore: false }),
    push,
  };
  const coordinator = createPushCoordinator({
    workspaceId,
    deviceId,
    syncClient: client,
    outboxRepository: outbox,
    metadataRepository: metadata,
    config: input.config,
    clock: () => now,
    sleep: input.sleep ?? (async () => undefined),
    logger: input.logger,
    runRegistry: input.registry ?? createPushCoordinatorRunRegistry(),
    acknowledgementRepository,
  });

  return { coordinator, outbox, metadata, client, acknowledgementRepository };
}

class FakeOutboxRepository implements PushCoordinatorOutboxRepository {
  resetCutoff: string | null = null;

  constructor(public records: SyncMutationOutboxRecord[]) {}

  async listPending(workspaceIdInput: string, limit: number) {
    return this.records
      .filter(
        (record) =>
          record.workspaceId === workspaceIdInput && record.status === "PENDING",
      )
      .slice(0, limit);
  }

  async listAllConflicts(workspaceIdInput: string) {
    return this.records.filter(
      (record) =>
        record.workspaceId === workspaceIdInput && record.status === "CONFLICT",
    );
  }

  async markProcessing(mutationIds: string[]) {
    return this.updateMany(mutationIds, (record) => ({
      ...record,
      status: "PROCESSING",
      attemptCount: record.attemptCount + 1,
      lastAttemptAt: now,
      updatedAt: now,
    }));
  }

  async markPending(
    mutationIds: string[],
    input: { nextAttemptAt?: string } = {},
  ) {
    return this.updateMany(mutationIds, (record) => ({
      ...record,
      status: "PENDING",
      nextAttemptAt: input.nextAttemptAt,
      updatedAt: now,
    }));
  }

  async markFailed(
    mutationId: string,
    error: { code: string; message: string; nextAttemptAt?: string },
  ) {
    const [record] = await this.updateMany([mutationId], (current) => ({
      ...current,
      status: "FAILED",
      lastErrorCode: error.code,
      lastErrorMessage: error.message,
      nextAttemptAt: error.nextAttemptAt,
      updatedAt: now,
    }));
    return record;
  }

  async markConflict(mutationId: string, conflictData: unknown) {
    const [record] = await this.updateMany([mutationId], (current) => ({
      ...current,
      status: "CONFLICT",
      conflictData,
      updatedAt: now,
    }));
    return record;
  }

  async remove(mutationIds: string[]) {
    this.records = this.records.filter(
      (record) => !mutationIds.includes(record.mutationId),
    );
  }

  async resetStaleProcessing(cutoff: string) {
    this.resetCutoff = cutoff;
    const reset: SyncMutationOutboxRecord[] = [];
    this.records = this.records.map((record) => {
      if (record.status !== "PROCESSING") {
        return record;
      }

      const reference = record.lastAttemptAt ?? record.updatedAt;
      if (reference >= cutoff) {
        return record;
      }

      const next = { ...record, status: "PENDING" as const, updatedAt: now };
      reset.push(next);
      return next;
    });
    return reset;
  }

  private async updateMany(
    mutationIds: string[],
    update: (record: SyncMutationOutboxRecord) => SyncMutationOutboxRecord,
  ) {
    const updated: SyncMutationOutboxRecord[] = [];
    this.records = this.records.map((record) => {
      if (!mutationIds.includes(record.mutationId)) {
        return record;
      }

      const next = update(record);
      updated.push(next);
      return next;
    });
    return updated;
  }
}

class FakeMetadataRepository implements PushCoordinatorMetadataRepository {
  events: unknown[][] = [];

  async recordSyncAttempt(_workspaceId: string, _deviceId: string, at: string) {
    this.events.push(["attempt", at]);
  }

  async recordPushSuccess(_workspaceId: string, _deviceId: string, at: string) {
    this.events.push(["success", at]);
  }

  async recordFailure(
    _workspaceId: string,
    _deviceId: string,
    error: { code: string; message: string },
  ) {
    this.events.push(["failure", error.code, error.message]);
  }

  async clearFailure() {
    this.events.push(["clearFailure"]);
  }
}

function makeRecord(
  mutation: SyncMutation,
  overrides: Partial<SyncMutationOutboxRecord> = {},
): SyncMutationOutboxRecord {
  return {
    mutationId: mutation.mutationId,
    workspaceId,
    deviceId,
    mutation,
    status: "PENDING",
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeMutation(mutationId: string): SyncMutation {
  const entityId = mutationId.replace("4", "5") as `${string}-${string}-${string}-${string}-${string}`;
  return {
    mutationId,
    entityType: "capture",
    operation: "upsert",
    entityId,
    baseVersion: null,
    payload: {
      content: "Texto local",
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    },
  };
}

function makeArchiveMutation(mutationId: string): SyncMutation {
  const entityId = mutationId.replace("4", "5") as `${string}-${string}-${string}-${string}-${string}`;
  return {
    mutationId,
    entityType: "capture",
    operation: "archive",
    entityId,
    baseVersion: 1,
    payload: {
      updatedAt: now,
      archivedAt: now,
    },
  };
}

function acceptedResponse(mutation: SyncMutation): PushResponse {
  return {
    accepted: [
      {
        mutationId: mutation.mutationId,
        entityType: mutation.entityType,
        entityId: mutation.entityId,
        version: 1,
      },
    ],
    conflicts: [],
    rejected: [],
    serverCursor: "1",
  };
}

function emptyResponse(): PushResponse {
  return { accepted: [], conflicts: [], rejected: [], serverCursor: "0" };
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
