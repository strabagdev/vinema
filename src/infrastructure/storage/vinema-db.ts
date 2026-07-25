import {
  openDB,
  type DBSchema,
  type IDBPDatabase,
  type OpenDBCallbacks,
} from "idb";
import type { Node } from "@/domain/node/node";
import type { Workspace } from "@/domain/workspace/workspace";

export const VINEMA_DB_NAME = "vinema";
export const VINEMA_DB_VERSION = 3;

export const APP_SETTINGS_STORE = "app_settings";
export const DEVICES_STORE = "devices";
export const LEGACY_KEY_VALUE_STORE = "key-value";
export const NODES_STORE = "nodes";
export const WORKSPACES_STORE = "workspaces";

export interface VinemaDbSchema extends DBSchema {
  [APP_SETTINGS_STORE]: {
    key: string;
    value: unknown;
  };
  [DEVICES_STORE]: {
    key: string;
    value: { id: string } & Record<string, unknown>;
  };
  [LEGACY_KEY_VALUE_STORE]: {
    key: string;
    value: unknown;
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
  | typeof DEVICES_STORE
  | typeof WORKSPACES_STORE
  | typeof NODES_STORE;
type UpgradeObjectStore = {
  keyPath: IDBObjectStore["keyPath"];
  indexNames: DOMStringList;
  getAll(): Promise<unknown[]>;
  put(value: { id: string } & Record<string, unknown>): Promise<unknown>;
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
      await ensureInlineIdStore(db, transaction, NODES_STORE, (store) => {
        store.createIndex("by-updated-at", "updatedAt");
        store.createIndex("by-workspace", "workspaceId");
      });
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
    ensureNodeIndexes(existingStore, storeName);
    return;
  }

  const records = await existingStore.getAll();
  db.deleteObjectStore(storeName);

  const recreatedStore = db.createObjectStore(storeName, { keyPath: "id" });
  configure?.(recreatedStore);

  for (const record of records) {
    if (hasInlineId(record)) {
      recreatedStore.put(record);
    }
  }
}

function ensureNodeIndexes(
  store: UpgradeObjectStore,
  storeName: InlineStoreName,
) {
  if (storeName !== NODES_STORE) {
    return;
  }

  if (!store.indexNames.contains("by-updated-at")) {
    store.createIndex("by-updated-at", "updatedAt");
  }

  if (!store.indexNames.contains("by-workspace")) {
    store.createIndex("by-workspace", "workspaceId");
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
