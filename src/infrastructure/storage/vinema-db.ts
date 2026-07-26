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

export const VINEMA_DB_NAME = "vinema";
export const VINEMA_DB_VERSION = 4;

export const APP_SETTINGS_STORE = "app_settings";
export const CONTEXTS_STORE = "contexts";
export const DEVICES_STORE = "devices";
export const LEGACY_KEY_VALUE_STORE = "key-value";
export const NODE_CONTEXT_RELATIONS_STORE = "node_context_relations";
export const NODES_STORE = "nodes";
export const WORKSPACES_STORE = "workspaces";

export interface VinemaDbSchema extends DBSchema {
  [APP_SETTINGS_STORE]: {
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
  [WORKSPACES_STORE]: {
    key: string;
    value: Workspace;
  };
}

let dbPromise: Promise<IDBPDatabase<VinemaDbSchema>> | undefined;
type UpgradeTransaction = Parameters<
  NonNullable<OpenDBCallbacks<VinemaDbSchema>["upgrade"]>
>[3];
type InlineStoreName =
  | typeof CONTEXTS_STORE
  | typeof DEVICES_STORE
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
  dbPromise ??= openDB<VinemaDbSchema>(VINEMA_DB_NAME, VINEMA_DB_VERSION, {
    async upgrade(db, _oldVersion, _newVersion, transaction) {
      ensureOutOfLineStore(db, APP_SETTINGS_STORE);
      ensureOutOfLineStore(db, LEGACY_KEY_VALUE_STORE);

      await ensureInlineIdStore(db, transaction, DEVICES_STORE);
      await ensureInlineIdStore(db, transaction, WORKSPACES_STORE);
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
    },
  });

  return dbPromise;
}

export async function resetVinemaDbConnectionForTests() {
  const db = await dbPromise;
  db?.close();
  dbPromise = undefined;
}

function ensureOutOfLineStore(
  db: IDBPDatabase<VinemaDbSchema>,
  storeName: typeof APP_SETTINGS_STORE | typeof LEGACY_KEY_VALUE_STORE,
) {
  if (!db.objectStoreNames.contains(storeName)) {
    db.createObjectStore(storeName);
  }
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
