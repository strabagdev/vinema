import { describe, expect, it } from "vitest";
import { DevicePlatform } from "@/domain/device/device";
import { getOrCreateDevice } from "@/features/device/get-or-create-device";
import type { StorageAdapter } from "@/infrastructure/storage/storage-adapter";

class MemoryStorageAdapter implements StorageAdapter {
  private readonly data = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | null> {
    return (this.data.get(key) as T | undefined) ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.data.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.data.delete(key);
  }
}

describe("getOrCreateDevice", () => {
  it("creates and persists a device when none exists", async () => {
    const storage = new MemoryStorageAdapter();

    const device = await getOrCreateDevice(storage, DevicePlatform.WEB);

    expect(device.id).toEqual(expect.any(String));
    expect(device.name).toBe("Vinema web");
    expect(device.platform).toBe(DevicePlatform.WEB);
    expect(await storage.get("vinema:device")).toEqual(device);
  });

  it("reuses the same id and updates lastSeenAt", async () => {
    const storage = new MemoryStorageAdapter();
    const firstDevice = await getOrCreateDevice(storage, DevicePlatform.WEB);

    const secondDevice = await getOrCreateDevice(storage, DevicePlatform.PWA);

    expect(secondDevice.id).toBe(firstDevice.id);
    expect(secondDevice.createdAt).toBe(firstDevice.createdAt);
    expect(secondDevice.platform).toBe(DevicePlatform.PWA);
    expect(Date.parse(secondDevice.lastSeenAt)).toBeGreaterThanOrEqual(
      Date.parse(firstDevice.lastSeenAt),
    );
  });
});
