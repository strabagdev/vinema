import { openDB, type IDBPDatabase } from "idb";
import type { StorageAdapter } from "@/infrastructure/storage/storage-adapter";

const DB_NAME = "vinema";
const STORE_NAME = "key-value";

export class IndexedDbAdapter implements StorageAdapter {
  private dbPromise?: Promise<IDBPDatabase>;

  async get<T>(key: string): Promise<T | null> {
    const db = await this.getDb();
    const value = await db.get(STORE_NAME, key);
    return (value as T | undefined) ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    const db = await this.getDb();
    await db.put(STORE_NAME, value, key);
  }

  async remove(key: string): Promise<void> {
    const db = await this.getDb();
    await db.delete(STORE_NAME, key);
  }

  private getDb() {
    this.dbPromise ??= openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore(STORE_NAME);
      },
    });

    return this.dbPromise;
  }
}
