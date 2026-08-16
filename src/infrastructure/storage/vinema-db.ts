import {
  openDB,
  type DBSchema,
  type IDBPDatabase,
  type OpenDBCallbacks,
} from "idb";
import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import type { Workspace } from "@/domain/workspace/workspace";
import type {
  SyncEntityAcknowledgementRecord,
} from "@/features/sync/sync-entity-acknowledgement-repository";
import type {
  SyncMetadataRecord,
  SyncMutationOutboxRecord,
} from "@/features/sync/sync-outbox-repository";
import type { StoredEmbeddingRecord } from "@/features/semantic-similarity/embedding-types";

export const VINEMA_DB_NAME = "vinema";
export const VINEMA_DB_VERSION = 9;

export const APP_SETTINGS_STORE = "app_settings";
export const AUTH_SESSION_STORE = "auth_session";
export const CONTEXTS_STORE = "contexts";
export const DEVICES_STORE = "devices";
export const EMBEDDINGS_STORE = "embeddings";
export const LEGACY_KEY_VALUE_STORE = "key-value";
export const NODE_CONTEXT_RELATIONS_STORE = "node_context_relations";
export const NODES_STORE = "nodes";
export const SYNC_METADATA_STORE = "sync_metadata";
export const SYNC_ENTITY_ACKS_STORE = "sync_entity_acknowledgements";
export const SYNC_MUTATIONS_STORE = "sync_mutations";
export const WORKSPACES_STORE = "workspaces";

export interface VinemaDbSchema extends DBSchema {
  [APP_SETTINGS_STORE]: {
    key: string;
    value: unknown;
  };
  [AUTH_SESSION_STORE]: {
    key: string;
    value: unknown;
  };
  [CONTEXTS_STORE]: {
    key: string;
    value: Context;
    indexes: {
      "by-archived-at": string;
      "by-type": string;
      "by-workspace": string;
      "by-workspace-and-type": [string, string];
    };
  };
  [DEVICES_STORE]: {
    key: string;
    value: { id: string } & Record<string, unknown>;
  };
  [EMBEDDINGS_STORE]: {
    key: string;
    value: StoredEmbeddingRecord;
    indexes: {
      "by-source": [string, string, string];
      "by-status": [string, string];
      "by-workspace-and-model": [string, string, string, number];
    };
  };
  [LEGACY_KEY_VALUE_STORE]: {
    key: string;
    value: unknown;
  };
  [NODE_CONTEXT_RELATIONS_STORE]: {
    key: string;
    value: NodeContextRelation;
    indexes: {
      "by-context": string;
      "by-node": string;
      "by-node-and-context": [string, string];
      "by-related-node": string;
      "by-relation-type": string;
      "by-workspace": string;
    };
  };
  [NODES_STORE]: {
    key: string;
    value: Node;
    indexes: {
      "by-updated-at": string;
      "by-workspace": string;
    };
  };
  [SYNC_METADATA_STORE]: {
    key: [string, string];
    value: SyncMetadataRecord;
    indexes: {
      "by-device": string;
      "by-workspace": string;
    };
  };
  [SYNC_ENTITY_ACKS_STORE]: {
    key: [string, string, string];
    value: SyncEntityAcknowledgementRecord;
    indexes: {
      "by-workspace": string;
      "by-entity": [string, string];
      "by-workspace-and-type": [string, string];
    };
  };
  [SYNC_MUTATIONS_STORE]: {
    key: string;
    value: SyncMutationOutboxRecord;
    indexes: {
      "by-created-at": string;
      "by-next-at": string;
      "by-status": string;
      "by-workspace": string;
      "by-workspace-and-status": [string, string];
    };
  };
  [WORKSPACES_STORE]: {
    key: string;
    value: Workspace;
  };
}

let activeVinemaDbName = VINEMA_DB_NAME;
let dbPromise: Promise<IDBPDatabase<VinemaDbSchema>> | undefined;
type UpgradeTransaction = Parameters<
  NonNullable<OpenDBCallbacks<VinemaDbSchema>["upgrade"]>
>[3];
type InlineStoreName =
  | typeof CONTEXTS_STORE
  | typeof DEVICES_STORE
  | typeof EMBEDDINGS_STORE
  | typeof NODE_CONTEXT_RELATIONS_STORE
  | typeof NODES_STORE
  | typeof WORKSPACES_STORE;
type UpgradeObjectStore = {
  keyPath: IDBObjectStore["keyPath"];
  indexNames: DOMStringList;
  getAll(): Promise<unknown[]>;
  put(value: unknown): Promise<unknown>;
  createIndex(
    name: string,
    keyPath: string | string[],
    options?: IDBIndexParameters,
  ): unknown;
};

export function getVinemaDb() {
  dbPromise ??= openDB<VinemaDbSchema>(activeVinemaDbName, VINEMA_DB_VERSION, {
    async upgrade(db, _oldVersion, _newVersion, transaction) {
      await ensureVinemaStores(db, transaction);
    },
    blocked(currentVersion, blockedVersion) {
      reportVinemaDbDevelopmentWarning(
        `IndexedDB upgrade blocked from v${currentVersion} to v${blockedVersion ?? "unknown"}. Close other Vinema tabs and reload.`,
      );
    },
    blocking(_currentVersion, blockedVersion, event) {
      reportVinemaDbDevelopmentWarning(
        `Closing Vinema IndexedDB connection for pending upgrade to v${blockedVersion ?? "unknown"}.`,
      );
      closeVersionChangeTarget(event);
    },
  }).then((db) => {
    db.addEventListener("versionchange", () => {
      reportVinemaDbDevelopmentWarning(
        "Closing Vinema IndexedDB connection after versionchange.",
      );
      db.close();
    });

    return db;
  });

  return dbPromise;
}

export async function ensureVinemaDatabaseSchema() {
  const db = await getVinemaDb();
  const missingStores = getMissingVinemaStores(db);

  if (missingStores.length > 0) {
    throw new VinemaDatabaseSchemaError(
      `Vinema IndexedDB schema is incomplete. Missing stores: ${missingStores.join(", ")}.`,
      { missingStores },
    );
  }

  return {
    version: db.version,
    stores: Array.from(db.objectStoreNames),
  };
}

export async function resetVinemaDbConnectionForTests() {
  const db = await dbPromise;
  db?.close();
  dbPromise = undefined;
}

export async function setVinemaDbNameForTests(dbName: string) {
  if (!dbName.trim()) {
    throw new Error("Vinema test IndexedDB name cannot be empty.");
  }

  await resetVinemaDbConnectionForTests();
  activeVinemaDbName = dbName;
}

export async function resetVinemaDbNameForTests() {
  await resetVinemaDbConnectionForTests();
  activeVinemaDbName = VINEMA_DB_NAME;
}

function ensureOutOfLineStore(
  db: IDBPDatabase<VinemaDbSchema>,
  storeName:
    | typeof APP_SETTINGS_STORE
    | typeof AUTH_SESSION_STORE
    | typeof LEGACY_KEY_VALUE_STORE,
) {
  if (!db.objectStoreNames.contains(storeName)) {
    db.createObjectStore(storeName);
  }
}

async function ensureVinemaStores(
  db: IDBPDatabase<VinemaDbSchema>,
  transaction: UpgradeTransaction,
) {
  ensureOutOfLineStore(db, APP_SETTINGS_STORE);
  ensureOutOfLineStore(db, AUTH_SESSION_STORE);
  ensureOutOfLineStore(db, LEGACY_KEY_VALUE_STORE);

  await ensureInlineIdStore(db, transaction, DEVICES_STORE);
  await ensureInlineIdStore(db, transaction, WORKSPACES_STORE);
  await ensureInlineIdStore(db, transaction, EMBEDDINGS_STORE, ensureEmbeddingIndexes);
  await ensureInlineIdStore(db, transaction, NODES_STORE, ensureNodeIndexes);
  await ensureInlineIdStore(
    db,
    transaction,
    CONTEXTS_STORE,
    ensureContextIndexes,
  );
  await ensureInlineIdStore(
    db,
    transaction,
    NODE_CONTEXT_RELATIONS_STORE,
    ensureNodeContextRelationIndexes,
  );
  await ensureSyncMutationsStore(db, transaction);
  ensureSyncMetadataStore(db, transaction);
  ensureSyncEntityAcknowledgementsStore(db, transaction);
}

async function ensureInlineIdStore(
  db: IDBPDatabase<VinemaDbSchema>,
  transaction: UpgradeTransaction,
  storeName: InlineStoreName,
  configure?: (store: UpgradeObjectStore) => void,
) {
  if (!db.objectStoreNames.contains(storeName)) {
    const store = db.createObjectStore(storeName, { keyPath: "id" });
    configure?.(store);
    return;
  }

  const existingStore = transaction.objectStore(storeName);

  if (existingStore.keyPath === "id") {
    configure?.(existingStore);
    return;
  }

  const records = await existingStore.getAll();
  db.deleteObjectStore(storeName);

  const recreatedStore = db.createObjectStore(storeName, { keyPath: "id" });
  configure?.(recreatedStore);

  for (const record of records) {
    if (hasInlineId(record)) {
      await recreatedStore.put(stripLegacyEmbeddedContext(record));
    }
  }
}

function ensureEmbeddingIndexes(store: UpgradeObjectStore) {
  if (!store.indexNames.contains("by-source")) {
    store.createIndex("by-source", ["workspaceId", "sourceType", "sourceId"]);
  }

  if (!store.indexNames.contains("by-status")) {
    store.createIndex("by-status", ["workspaceId", "status"]);
  }

  if (!store.indexNames.contains("by-workspace-and-model")) {
    store.createIndex("by-workspace-and-model", [
      "workspaceId",
      "modelId",
      "modelVersion",
      "dimensions",
    ]);
  }
}

function ensureNodeIndexes(store: UpgradeObjectStore) {
  if (!store.indexNames.contains("by-updated-at")) {
    store.createIndex("by-updated-at", "updatedAt");
  }

  if (!store.indexNames.contains("by-workspace")) {
    store.createIndex("by-workspace", "workspaceId");
  }
}

function ensureContextIndexes(store: UpgradeObjectStore) {
  if (!store.indexNames.contains("by-workspace")) {
    store.createIndex("by-workspace", "workspaceId");
  }

  if (!store.indexNames.contains("by-type")) {
    store.createIndex("by-type", "type");
  }

  if (!store.indexNames.contains("by-archived-at")) {
    store.createIndex("by-archived-at", "archivedAt");
  }

  if (!store.indexNames.contains("by-workspace-and-type")) {
    store.createIndex("by-workspace-and-type", ["workspaceId", "type"]);
  }
}

function ensureNodeContextRelationIndexes(store: UpgradeObjectStore) {
  if (!store.indexNames.contains("by-workspace")) {
    store.createIndex("by-workspace", "workspaceId");
  }

  if (!store.indexNames.contains("by-node")) {
    store.createIndex("by-node", "nodeId");
  }

  if (!store.indexNames.contains("by-context")) {
    store.createIndex("by-context", "contextId");
  }

  if (!store.indexNames.contains("by-node-and-context")) {
    store.createIndex("by-node-and-context", ["nodeId", "contextId"], {
      unique: true,
    });
  }

  if (!store.indexNames.contains("by-related-node")) {
    store.createIndex("by-related-node", "relatedNodeId");
  }

  if (!store.indexNames.contains("by-relation-type")) {
    store.createIndex("by-relation-type", "relationType");
  }
}

function ensureSyncMutationIndexes(store: UpgradeObjectStore) {
  if (!store.indexNames.contains("by-workspace")) {
    store.createIndex("by-workspace", "workspaceId");
  }

  if (!store.indexNames.contains("by-status")) {
    store.createIndex("by-status", "status");
  }

  if (!store.indexNames.contains("by-created-at")) {
    store.createIndex("by-created-at", "createdAt");
  }

  if (!store.indexNames.contains("by-workspace-and-status")) {
    store.createIndex("by-workspace-and-status", ["workspaceId", "status"]);
  }

  if (!store.indexNames.contains("by-next-at")) {
    store.createIndex("by-next-at", "nextAttemptAt");
  }
}

async function ensureSyncMutationsStore(
  db: IDBPDatabase<VinemaDbSchema>,
  transaction: UpgradeTransaction,
) {
  if (!db.objectStoreNames.contains(SYNC_MUTATIONS_STORE)) {
    const store = db.createObjectStore(SYNC_MUTATIONS_STORE, {
      keyPath: "mutationId",
    });
    ensureSyncMutationIndexes(store);
    return;
  }

  const existingStore = transaction.objectStore(SYNC_MUTATIONS_STORE);

  if (existingStore.keyPath === "mutationId") {
    ensureSyncMutationIndexes(existingStore);
    return;
  }

  const records = await existingStore.getAll();
  db.deleteObjectStore(SYNC_MUTATIONS_STORE);

  const recreatedStore = db.createObjectStore(SYNC_MUTATIONS_STORE, {
    keyPath: "mutationId",
  });
  ensureSyncMutationIndexes(recreatedStore);

  for (const record of records) {
    if (
      typeof record === "object" &&
      record !== null &&
      "mutationId" in record &&
      typeof record.mutationId === "string"
    ) {
      await recreatedStore.put(record);
    }
  }
}

function ensureSyncMetadataStore(
  db: IDBPDatabase<VinemaDbSchema>,
  transaction: UpgradeTransaction,
) {
  if (!db.objectStoreNames.contains(SYNC_METADATA_STORE)) {
    const store = db.createObjectStore(SYNC_METADATA_STORE, {
      keyPath: ["workspaceId", "deviceId"],
    });
    ensureSyncMetadataIndexes(store);
    return;
  }

  ensureSyncMetadataIndexes(transaction.objectStore(SYNC_METADATA_STORE));
}

function ensureSyncMetadataIndexes(store: UpgradeObjectStore) {
  if (!store.indexNames.contains("by-workspace")) {
    store.createIndex("by-workspace", "workspaceId");
  }

  if (!store.indexNames.contains("by-device")) {
    store.createIndex("by-device", "deviceId");
  }
}

function ensureSyncEntityAcknowledgementsStore(
  db: IDBPDatabase<VinemaDbSchema>,
  transaction: UpgradeTransaction,
) {
  if (!db.objectStoreNames.contains(SYNC_ENTITY_ACKS_STORE)) {
    const store = db.createObjectStore(SYNC_ENTITY_ACKS_STORE, {
      keyPath: ["workspaceId", "entityType", "entityId"],
    });
    ensureSyncEntityAcknowledgementIndexes(store);
    return;
  }

  ensureSyncEntityAcknowledgementIndexes(
    transaction.objectStore(SYNC_ENTITY_ACKS_STORE),
  );
}

function ensureSyncEntityAcknowledgementIndexes(store: UpgradeObjectStore) {
  if (!store.indexNames.contains("by-workspace")) {
    store.createIndex("by-workspace", "workspaceId");
  }

  if (!store.indexNames.contains("by-entity")) {
    store.createIndex("by-entity", ["entityType", "entityId"]);
  }

  if (!store.indexNames.contains("by-workspace-and-type")) {
    store.createIndex("by-workspace-and-type", ["workspaceId", "entityType"]);
  }
}

export class VinemaDatabaseSchemaError extends Error {
  constructor(
    message: string,
    public readonly details: { missingStores: string[] },
  ) {
    super(message);
    this.name = "VinemaDatabaseSchemaError";
  }
}

function getMissingVinemaStores(db: IDBPDatabase<VinemaDbSchema>) {
  const requiredStores = [
    APP_SETTINGS_STORE,
    AUTH_SESSION_STORE,
    CONTEXTS_STORE,
    DEVICES_STORE,
    LEGACY_KEY_VALUE_STORE,
    NODE_CONTEXT_RELATIONS_STORE,
    NODES_STORE,
    SYNC_ENTITY_ACKS_STORE,
    SYNC_METADATA_STORE,
    SYNC_MUTATIONS_STORE,
    WORKSPACES_STORE,
  ] as const;

  return requiredStores.filter(
    (storeName) => !db.objectStoreNames.contains(storeName),
  );
}

function closeVersionChangeTarget(event: IDBVersionChangeEvent) {
  const database = event.target as { close?: () => void } | null;
  database?.close?.();
}

function reportVinemaDbDevelopmentWarning(message: string) {
  if (process.env.NODE_ENV === "development") {
    console.warn(`[vinema-db] ${message}`);
  }
}

function hasInlineId(value: unknown): value is { id: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string"
  );
}

function stripLegacyEmbeddedContext<T>(value: T): T {
  if (typeof value !== "object" || value === null || !("context" in value)) {
    return value;
  }

  const record = { ...value };
  delete (record as { context?: unknown }).context;
  return record;
}
