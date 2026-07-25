import type { StorageAdapter } from "@/infrastructure/storage/storage-adapter";
import {
  APP_SETTINGS_STORE,
  LEGACY_KEY_VALUE_STORE,
  getVinemaDb,
} from "@/infrastructure/storage/vinema-db";

export class IndexedDbAdapter implements StorageAdapter {
  async get<T>(key: string): Promise<T | null> {
    const db = await getVinemaDb();
    const value =
      (await db.get(APP_SETTINGS_STORE, key)) ??
      (await db.get(LEGACY_KEY_VALUE_STORE, key));

    return (value as T | undefined) ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    const db = await getVinemaDb();
    await db.put(APP_SETTINGS_STORE, value, key);
  }

  async remove(key: string): Promise<void> {
    const db = await getVinemaDb();
    await db.delete(APP_SETTINGS_STORE, key);
    await db.delete(LEGACY_KEY_VALUE_STORE, key);
  }
}
