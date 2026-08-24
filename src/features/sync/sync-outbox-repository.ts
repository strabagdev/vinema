import { MAX_PUSH_MUTATIONS, syncMutationSchema, type SyncMutation } from "@vinema/sync-contracts";
import {
  SYNC_METADATA_STORE,
  SYNC_MUTATIONS_STORE,
  getVinemaDb,
} from "@/infrastructure/storage/vinema-db";
import {
  consolidateEntitySyncConflicts,
  countEntitySyncConflicts,
} from "@/features/sync/conflict-lifecycle";

export const SYNC_OUTBOX_MAX_LIST_LIMIT = MAX_PUSH_MUTATIONS;

export const SYNC_MUTATION_STATUSES = [
  "PENDING",
  "PROCESSING",
  "FAILED",
  "CONFLICT",
] as const;

export type SyncMutationOutboxStatus = (typeof SYNC_MUTATION_STATUSES)[number];

export type SyncMutationOutboxRecord = {
  mutationId: string;
  workspaceId: string;
  deviceId: string;
  mutation: SyncMutation;
  localVersion?: number;
  status: SyncMutationOutboxStatus;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  lastAttemptAt?: string;
  nextAttemptAt?: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  conflictData?: unknown;
};

export type SyncMutationEnqueueInput = {
  workspaceId: string;
  deviceId: string;
  mutation: SyncMutation;
  localVersion?: number;
  createdAt?: string;
};

export type SyncOutboxFailureInput = {
  code: string;
  message: string;
  nextAttemptAt?: string;
};

export type SyncOutboxPendingInput = {
  nextAttemptAt?: string;
};

export type SyncMetadataRecord = {
  workspaceId: string;
  deviceId: string;
  pullCursor: string;
  lastPullAttemptAt: string | null;
  lastSuccessfulPushAt: string | null;
  lastSuccessfulPullAt: string | null;
  lastSyncAttemptAt: string | null;
  lastSyncErrorCode: string | null;
  lastSyncErrorMessage: string | null;
  lastMemoryVerificationAt: string | null;
  lastMemoryVerificationStatus: SyncMemoryVerificationStatus | null;
  lastMemoryVerificationError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SyncMemoryVerificationStatus = "PASSED" | "FAILED";

export type SyncMetadataUpsertInput = {
  workspaceId: string;
  deviceId: string;
  pullCursor?: string;
  lastPullAttemptAt?: string | null;
  lastSuccessfulPushAt?: string | null;
  lastSuccessfulPullAt?: string | null;
  lastSyncAttemptAt?: string | null;
  lastSyncErrorCode?: string | null;
  lastSyncErrorMessage?: string | null;
  lastMemoryVerificationAt?: string | null;
  lastMemoryVerificationStatus?: SyncMemoryVerificationStatus | null;
  lastMemoryVerificationError?: string | null;
  at?: string;
};

export type SyncOutboxErrorCode =
  | "DUPLICATE_MUTATION_CONFLICT"
  | "MUTATION_NOT_FOUND"
  | "INVALID_STATUS_TRANSITION"
  | "STORAGE_ERROR"
  | "INVALID_MUTATION"
  | "INVALID_LIMIT";

export class SyncOutboxError extends Error {
  constructor(
    public readonly code: SyncOutboxErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "SyncOutboxError";
  }
}

export function canTransition(
  from: SyncMutationOutboxStatus,
  to: SyncMutationOutboxStatus,
) {
  return (
    (from === "PENDING" && to === "PROCESSING") ||
    (from === "PROCESSING" && to === "PENDING") ||
    (from === "PROCESSING" && to === "FAILED") ||
    (from === "PROCESSING" && to === "CONFLICT") ||
    (from === "FAILED" && to === "PENDING") ||
    (from === "CONFLICT" && to === "PENDING")
  );
}

export class IndexedDbSyncOutboxRepository {
  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  async enqueue(input: SyncMutationEnqueueInput): Promise<SyncMutationOutboxRecord> {
    const record = createSyncMutationOutboxRecord(input, input.createdAt ?? this.now());
    const db = await getVinemaDb();
    const transaction = db.transaction(SYNC_MUTATIONS_STORE, "readwrite");
    const existing = await transaction.store.get(record.mutationId);

    if (existing) {
      if (!isSameEnqueuedMutation(existing, record)) {
        throw new SyncOutboxError(
          "DUPLICATE_MUTATION_CONFLICT",
          "La mutacion ya existe con contenido distinto.",
          { mutationId: record.mutationId },
        );
      }

      await transaction.done;
      return existing;
    }

    await transaction.store.put(record);
    await transaction.done;
    return record;
  }

  async getById(mutationId: string): Promise<SyncMutationOutboxRecord | null> {
    assertNonEmpty("mutationId", mutationId);
    const db = await getVinemaDb();
    return (await db.get(SYNC_MUTATIONS_STORE, mutationId)) ?? null;
  }

  async listPending(workspaceId: string, limit: number): Promise<SyncMutationOutboxRecord[]> {
    return this.listByStatus(workspaceId, "PENDING", limit);
  }

  async listFailed(workspaceId: string, limit: number): Promise<SyncMutationOutboxRecord[]> {
    return this.listByStatus(workspaceId, "FAILED", limit);
  }

  async listConflicts(workspaceId: string, limit: number): Promise<SyncMutationOutboxRecord[]> {
    return this.listByStatus(workspaceId, "CONFLICT", limit);
  }

  async listAllConflicts(workspaceId: string): Promise<SyncMutationOutboxRecord[]> {
    assertNonEmpty("workspaceId", workspaceId);
    const db = await getVinemaDb();
    const records = await db.getAllFromIndex(
      SYNC_MUTATIONS_STORE,
      "by-workspace-and-status",
      [workspaceId, "CONFLICT"],
    );
    return sortOutboxRecords(records);
  }

  async countLogicalConflicts(workspaceId: string): Promise<number> {
    return countEntitySyncConflicts(await this.listAllConflicts(workspaceId));
  }

  async consolidateLogicalConflicts(workspaceId: string): Promise<{
    logicalConflicts: number;
    removedMutations: number;
  }> {
    assertNonEmpty("workspaceId", workspaceId);
    const db = await getVinemaDb();
    const transaction = db.transaction(SYNC_MUTATIONS_STORE, "readwrite");
    const records = await transaction.store.index("by-workspace-and-status").getAll([
      workspaceId,
      "CONFLICT",
    ]);
    const consolidation = consolidateEntitySyncConflicts(records);

    for (const mutationId of consolidation.redundantMutationIds) {
      await transaction.store.delete(mutationId);
    }

    await transaction.done;
    return {
      logicalConflicts: consolidation.conflicts.length,
      removedMutations: consolidation.redundantMutationIds.length,
    };
  }

  async listByWorkspace(
    workspaceId: string,
    limit = SYNC_OUTBOX_MAX_LIST_LIMIT,
  ): Promise<SyncMutationOutboxRecord[]> {
    assertNonEmpty("workspaceId", workspaceId);
    assertLimit(limit);
    const db = await getVinemaDb();
    const records = await db.getAllFromIndex(
      SYNC_MUTATIONS_STORE,
      "by-workspace",
      workspaceId,
    );
    return sortOutboxRecords(records).slice(0, limit);
  }

  async listByEntity(input: {
    workspaceId: string;
    entityId: string;
    limit?: number;
  }): Promise<SyncMutationOutboxRecord[]> {
    assertNonEmpty("workspaceId", input.workspaceId);
    assertNonEmpty("entityId", input.entityId);
    const records = await this.listByWorkspace(
      input.workspaceId,
      input.limit ?? SYNC_OUTBOX_MAX_LIST_LIMIT,
    );

    return records.filter((record) => record.mutation.entityId === input.entityId);
  }

  async markProcessing(mutationIds: string[]): Promise<SyncMutationOutboxRecord[]> {
    const now = this.now();
    return this.updateMany(mutationIds, (record) => ({
      ...transition(record, "PROCESSING"),
      attemptCount: record.attemptCount + 1,
      lastAttemptAt: now,
      updatedAt: now,
    }));
  }

  async markPending(
    mutationIds: string[],
    input: SyncOutboxPendingInput = {},
  ): Promise<SyncMutationOutboxRecord[]> {
    if (input.nextAttemptAt !== undefined) {
      assertIsoDate("nextAttemptAt", input.nextAttemptAt);
    }

    const now = this.now();
    return this.updateMany(mutationIds, (record) => {
      const next = transition(record, "PENDING");
      return removeUndefinedFields({
        ...next,
        updatedAt: now,
        nextAttemptAt: input.nextAttemptAt,
      });
    });
  }

  async markFailed(
    mutationId: string,
    error: SyncOutboxFailureInput,
  ): Promise<SyncMutationOutboxRecord> {
    assertNonEmpty("error.code", error.code);
    assertNonEmpty("error.message", error.message);
    if (error.nextAttemptAt !== undefined) {
      assertIsoDate("nextAttemptAt", error.nextAttemptAt);
    }

    const [record] = await this.updateMany([mutationId], (current) => ({
      ...transition(current, "FAILED"),
      lastErrorCode: error.code,
      lastErrorMessage: error.message,
      nextAttemptAt: error.nextAttemptAt,
      updatedAt: this.now(),
    }));
    return record;
  }

  async markConflict(
    mutationId: string,
    conflictData: unknown,
  ): Promise<SyncMutationOutboxRecord> {
    const [record] = await this.updateMany([mutationId], (current) => ({
      ...transition(current, "CONFLICT"),
      conflictData,
      updatedAt: this.now(),
    }));
    return record;
  }

  async remove(mutationIds: string[]): Promise<void> {
    const db = await getVinemaDb();
    const transaction = db.transaction(SYNC_MUTATIONS_STORE, "readwrite");
    for (const mutationId of mutationIds) {
      assertNonEmpty("mutationId", mutationId);
      await transaction.store.delete(mutationId);
    }
    await transaction.done;
  }

  async countPending(workspaceId: string): Promise<number> {
    return this.countByStatus(workspaceId, "PENDING");
  }

  async countByStatus(
    workspaceId: string,
    status: SyncMutationOutboxStatus,
  ): Promise<number> {
    assertNonEmpty("workspaceId", workspaceId);
    assertValidStatus(status);
    const db = await getVinemaDb();
    return db.countFromIndex(SYNC_MUTATIONS_STORE, "by-workspace-and-status", [
      workspaceId,
      status,
    ]);
  }

  async resetStaleProcessing(cutoff: string): Promise<SyncMutationOutboxRecord[]> {
    assertIsoDate("cutoff", cutoff);
    const db = await getVinemaDb();
    const transaction = db.transaction(SYNC_MUTATIONS_STORE, "readwrite");
    const records = await transaction.store.index("by-status").getAll("PROCESSING");
    const now = this.now();
    const resetRecords: SyncMutationOutboxRecord[] = [];

    for (const record of records) {
      const referenceAt = record.lastAttemptAt ?? record.updatedAt;
      if (referenceAt >= cutoff) {
        continue;
      }

      const next = removeUndefinedFields({
        ...transition(record, "PENDING"),
        updatedAt: now,
        nextAttemptAt: undefined,
      });
      await transaction.store.put(next);
      resetRecords.push(next);
    }

    await transaction.done;
    return sortOutboxRecords(resetRecords);
  }

  private async listByStatus(
    workspaceId: string,
    status: SyncMutationOutboxStatus,
    limit: number,
  ) {
    assertNonEmpty("workspaceId", workspaceId);
    assertLimit(limit);
    const db = await getVinemaDb();
    const records = await db.getAllFromIndex(
      SYNC_MUTATIONS_STORE,
      "by-workspace-and-status",
      [workspaceId, status],
    );
    return sortOutboxRecords(records).slice(0, limit);
  }

  private async updateMany(
    mutationIds: string[],
    update: (record: SyncMutationOutboxRecord) => SyncMutationOutboxRecord,
  ) {
    const db = await getVinemaDb();
    const transaction = db.transaction(SYNC_MUTATIONS_STORE, "readwrite");
    const records: SyncMutationOutboxRecord[] = [];

    for (const mutationId of mutationIds) {
      assertNonEmpty("mutationId", mutationId);
      const record = await transaction.store.get(mutationId);
      if (!record) {
        throw new SyncOutboxError(
          "MUTATION_NOT_FOUND",
          "La mutacion no existe.",
          { mutationId },
        );
      }
      records.push(record);
    }

    const updated = records.map(update);
    for (const record of updated) {
      await transaction.store.put(record);
    }

    await transaction.done;
    return updated;
  }
}

export class IndexedDbSyncMetadataRepository {
  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  async get(
    workspaceId: string,
    deviceId: string,
  ): Promise<SyncMetadataRecord | null> {
    assertNonEmpty("workspaceId", workspaceId);
    assertNonEmpty("deviceId", deviceId);
    const db = await getVinemaDb();
    return (await db.get(SYNC_METADATA_STORE, [workspaceId, deviceId])) ?? null;
  }

  async upsert(input: SyncMetadataUpsertInput): Promise<SyncMetadataRecord> {
    assertNonEmpty("workspaceId", input.workspaceId);
    assertNonEmpty("deviceId", input.deviceId);
    const at = input.at ?? this.now();
    assertIsoDate("at", at);
    const existing = await this.get(input.workspaceId, input.deviceId);
    const record: SyncMetadataRecord = {
      workspaceId: input.workspaceId,
      deviceId: input.deviceId,
      pullCursor: pickInput(input, "pullCursor", existing?.pullCursor ?? "0"),
      lastPullAttemptAt: pickInput(
        input,
        "lastPullAttemptAt",
        existing?.lastPullAttemptAt ?? null,
      ),
      lastSuccessfulPushAt: pickInput(
        input,
        "lastSuccessfulPushAt",
        existing?.lastSuccessfulPushAt ?? null,
      ),
      lastSuccessfulPullAt: pickInput(
        input,
        "lastSuccessfulPullAt",
        existing?.lastSuccessfulPullAt ?? null,
      ),
      lastSyncAttemptAt: pickInput(
        input,
        "lastSyncAttemptAt",
        existing?.lastSyncAttemptAt ?? null,
      ),
      lastSyncErrorCode: pickInput(
        input,
        "lastSyncErrorCode",
        existing?.lastSyncErrorCode ?? null,
      ),
      lastSyncErrorMessage: pickInput(
        input,
        "lastSyncErrorMessage",
        existing?.lastSyncErrorMessage ?? null,
      ),
      lastMemoryVerificationAt: pickInput(
        input,
        "lastMemoryVerificationAt",
        existing?.lastMemoryVerificationAt ?? null,
      ),
      lastMemoryVerificationStatus: pickInput(
        input,
        "lastMemoryVerificationStatus",
        existing?.lastMemoryVerificationStatus ?? null,
      ),
      lastMemoryVerificationError: pickInput(
        input,
        "lastMemoryVerificationError",
        existing?.lastMemoryVerificationError ?? null,
      ),
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
    };

    validateMetadata(record);
    const db = await getVinemaDb();
    await db.put(SYNC_METADATA_STORE, record);
    return record;
  }

  async updateCursor(
    workspaceId: string,
    deviceId: string,
    cursor: string,
  ): Promise<SyncMetadataRecord> {
    assertCursor(cursor);
    return this.upsert({ workspaceId, deviceId, pullCursor: cursor });
  }

  async recordSyncAttempt(
    workspaceId: string,
    deviceId: string,
    at: string,
  ): Promise<SyncMetadataRecord> {
    assertIsoDate("at", at);
    return this.upsert({ workspaceId, deviceId, lastSyncAttemptAt: at, at });
  }

  async recordPullAttempt(
    workspaceId: string,
    deviceId: string,
    at: string,
  ): Promise<SyncMetadataRecord> {
    assertIsoDate("at", at);
    return this.upsert({ workspaceId, deviceId, lastPullAttemptAt: at, at });
  }

  async recordPushSuccess(
    workspaceId: string,
    deviceId: string,
    at: string,
  ): Promise<SyncMetadataRecord> {
    assertIsoDate("at", at);
    return this.upsert({ workspaceId, deviceId, lastSuccessfulPushAt: at, at });
  }

  async recordPullSuccess(
    workspaceId: string,
    deviceId: string,
    cursor: string,
    at: string,
  ): Promise<SyncMetadataRecord> {
    assertCursor(cursor);
    assertIsoDate("at", at);
    return this.upsert({
      workspaceId,
      deviceId,
      pullCursor: cursor,
      lastSuccessfulPullAt: at,
      at,
    });
  }

  async recordFailure(
    workspaceId: string,
    deviceId: string,
    error: { code: string; message: string },
    at: string,
  ): Promise<SyncMetadataRecord> {
    assertNonEmpty("error.code", error.code);
    assertNonEmpty("error.message", error.message);
    assertIsoDate("at", at);
    return this.upsert({
      workspaceId,
      deviceId,
      lastSyncAttemptAt: at,
      lastSyncErrorCode: error.code,
      lastSyncErrorMessage: error.message,
      at,
    });
  }

  async clearFailure(
    workspaceId: string,
    deviceId: string,
  ): Promise<SyncMetadataRecord> {
    return this.upsert({
      workspaceId,
      deviceId,
      lastSyncErrorCode: null,
      lastSyncErrorMessage: null,
    });
  }

  async recordMemoryVerification(
    input: {
      workspaceId: string;
      deviceId: string;
      status: SyncMemoryVerificationStatus;
      errorMessage?: string | null;
      at: string;
    },
  ): Promise<SyncMetadataRecord> {
    assertIsoDate("at", input.at);
    assertValidMemoryVerificationStatus(input.status);
    return this.upsert({
      workspaceId: input.workspaceId,
      deviceId: input.deviceId,
      lastMemoryVerificationAt: input.at,
      lastMemoryVerificationStatus: input.status,
      lastMemoryVerificationError:
        input.status === "FAILED" ? input.errorMessage ?? "Verificacion fallida." : null,
      at: input.at,
    });
  }
}

export function createSyncMutationOutboxRecord(
  input: SyncMutationEnqueueInput,
  now: string,
): SyncMutationOutboxRecord {
  assertNonEmpty("workspaceId", input.workspaceId);
  assertNonEmpty("deviceId", input.deviceId);
  assertIsoDate("createdAt", now);
  const parsed = syncMutationSchema.safeParse(input.mutation);

  if (!parsed.success) {
    throw new SyncOutboxError(
      "INVALID_MUTATION",
      "La mutacion local no cumple el contrato remoto.",
      parsed.error.issues,
    );
  }

  return {
    mutationId: parsed.data.mutationId,
    workspaceId: input.workspaceId,
    deviceId: input.deviceId,
    mutation: parsed.data,
    localVersion: input.localVersion,
    status: "PENDING",
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function isSameEnqueuedMutation(
  existing: SyncMutationOutboxRecord,
  next: SyncMutationOutboxRecord,
) {
  return stableStringify({
    workspaceId: existing.workspaceId,
    deviceId: existing.deviceId,
    mutation: existing.mutation,
  }) === stableStringify({
    workspaceId: next.workspaceId,
    deviceId: next.deviceId,
    mutation: next.mutation,
  });
}

function transition(
  record: SyncMutationOutboxRecord,
  status: SyncMutationOutboxStatus,
): SyncMutationOutboxRecord {
  if (!canTransition(record.status, status)) {
    throw new SyncOutboxError(
      "INVALID_STATUS_TRANSITION",
      "La transicion de estado no es valida.",
      { from: record.status, to: status, mutationId: record.mutationId },
    );
  }

  return { ...record, status };
}

function sortOutboxRecords(records: SyncMutationOutboxRecord[]) {
  return [...records].sort((a, b) => {
    const byCreatedAt = a.createdAt.localeCompare(b.createdAt);
    return byCreatedAt === 0
      ? a.mutationId.localeCompare(b.mutationId)
      : byCreatedAt;
  });
}

function assertLimit(limit: number) {
  if (
    !Number.isInteger(limit) ||
    limit <= 0 ||
    limit > SYNC_OUTBOX_MAX_LIST_LIMIT
  ) {
    throw new SyncOutboxError(
      "INVALID_LIMIT",
      "El limite de mutaciones no es valido.",
      { limit, max: SYNC_OUTBOX_MAX_LIST_LIMIT },
    );
  }
}

function assertValidStatus(status: string) {
  if (!SYNC_MUTATION_STATUSES.includes(status as SyncMutationOutboxStatus)) {
    throw new SyncOutboxError(
      "INVALID_STATUS_TRANSITION",
      "El estado de mutacion no es valido.",
      { status },
    );
  }
}

function validateMetadata(record: SyncMetadataRecord) {
  assertNonEmpty("workspaceId", record.workspaceId);
  assertNonEmpty("deviceId", record.deviceId);
  assertCursor(record.pullCursor);
  assertNullableIsoDate("lastPullAttemptAt", record.lastPullAttemptAt);
  assertIsoDate("createdAt", record.createdAt);
  assertIsoDate("updatedAt", record.updatedAt);
  assertNullableIsoDate("lastSuccessfulPushAt", record.lastSuccessfulPushAt);
  assertNullableIsoDate("lastSuccessfulPullAt", record.lastSuccessfulPullAt);
  assertNullableIsoDate("lastSyncAttemptAt", record.lastSyncAttemptAt);
  assertNullableIsoDate("lastMemoryVerificationAt", record.lastMemoryVerificationAt);
  if (record.lastMemoryVerificationStatus !== null) {
    assertValidMemoryVerificationStatus(record.lastMemoryVerificationStatus);
  }
}

function assertValidMemoryVerificationStatus(status: string) {
  if (status !== "PASSED" && status !== "FAILED") {
    throw new SyncOutboxError(
      "INVALID_MUTATION",
      "El estado de verificacion de memoria no es valido.",
      { status },
    );
  }
}

function assertNonEmpty(field: string, value: string) {
  if (!value.trim()) {
    throw new SyncOutboxError(
      "INVALID_MUTATION",
      `${field} no puede estar vacio.`,
      { field },
    );
  }
}

function assertIsoDate(field: string, value: string) {
  if (Number.isNaN(Date.parse(value))) {
    throw new SyncOutboxError(
      "INVALID_MUTATION",
      `${field} debe ser una fecha ISO valida.`,
      { field },
    );
  }
}

function assertNullableIsoDate(field: string, value: string | null) {
  if (value !== null) {
    assertIsoDate(field, value);
  }
}

function assertCursor(cursor: string) {
  if (!/^\d+$/.test(cursor)) {
    throw new SyncOutboxError(
      "INVALID_MUTATION",
      "El cursor de sincronizacion no es valido.",
      { cursor },
    );
  }
}

function removeUndefinedFields<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as T;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function pickInput<
  T extends Record<string, unknown>,
  K extends keyof T,
  Fallback,
>(input: T, key: K, fallback: Fallback): Exclude<T[K], undefined> | Fallback {
  return Object.prototype.hasOwnProperty.call(input, key)
    ? (input[key] as Exclude<T[K], undefined>)
    : fallback;
}
