import type { StorageAdapter } from "@/infrastructure/storage/storage-adapter";

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly storage: Storage = window.localStorage) {}

  async get<T>(key: string): Promise<T | null> {
    const value = this.storage.getItem(key);

    if (value === null) {
      return null;
    }

    return JSON.parse(value) as T;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.storage.setItem(key, JSON.stringify(value));
  }

  async remove(key: string): Promise<void> {
    this.storage.removeItem(key);
  }
}
