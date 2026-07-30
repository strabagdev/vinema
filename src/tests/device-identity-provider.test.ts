import { describe, expect, it } from "vitest";
import { DevicePlatform } from "@/domain/device/device";
import { createDeviceIdentityProvider } from "@/features/auth/device-identity-provider";
import type { StorageAdapter } from "@/infrastructure/storage/storage-adapter";

describe("DeviceIdentityProvider", () => {
  it("generates the clientDeviceId once and keeps it after reinitialization", async () => {
    const storage = new MemoryStorageAdapter();
    const first = createDeviceIdentityProvider({ storage });
    const firstId = await first.getClientDeviceId();
    const second = createDeviceIdentityProvider({ storage });

    expect(await second.getClientDeviceId()).toBe(firstId);
    expect(firstId).toMatch(/.+/);
  });

  it("keeps clientDeviceId after auth logout because device identity is not session state", async () => {
    const storage = new MemoryStorageAdapter();
    const provider = createDeviceIdentityProvider({ storage });
    const beforeLogout = await provider.getClientDeviceId();

    const afterLogout = await provider.getClientDeviceId();

    expect(afterLogout).toBe(beforeLogout);
  });

  it("returns conservative WEB metadata", async () => {
    const provider = createDeviceIdentityProvider({
      storage: new MemoryStorageAdapter(),
      detect: () => ({ tauri: false, standalone: false, userAgent: "Mozilla/5.0" }),
    });

    await expect(provider.getDeviceMetadata()).resolves.toMatchObject({
      name: "Vinema Web",
      platform: "web",
      appType: "WEB",
    });
  });

  it("returns PWA metadata", async () => {
    const provider = createDeviceIdentityProvider({
      storage: new MemoryStorageAdapter({ platform: DevicePlatform.PWA }),
      detect: () => ({ tauri: false, standalone: true, userAgent: "Mozilla/5.0" }),
    });

    await expect(provider.getDeviceMetadata()).resolves.toMatchObject({
      name: "Vinema PWA",
      platform: "web",
      appType: "PWA",
    });
  });

  it("returns TAURI metadata with native platform", async () => {
    const provider = createDeviceIdentityProvider({
      storage: new MemoryStorageAdapter({ platform: DevicePlatform.WINDOWS }),
      detect: () => ({
        tauri: true,
        standalone: false,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      }),
    });

    await expect(provider.getDeviceMetadata()).resolves.toMatchObject({
      name: "Vinema Windows",
      platform: "windows",
      appType: "TAURI",
    });
  });

  it("falls back to UNKNOWN app type for unknown platform", async () => {
    const provider = createDeviceIdentityProvider({
      storage: new MemoryStorageAdapter({ platform: DevicePlatform.UNKNOWN }),
      detect: () => ({ tauri: false, standalone: false, userAgent: "" }),
    });

    await expect(provider.getDeviceMetadata()).resolves.toMatchObject({
      name: "Vinema",
      platform: "unknown",
      appType: "UNKNOWN",
    });
  });
});

class MemoryStorageAdapter implements StorageAdapter {
  private readonly values = new Map<string, unknown>();

  constructor(private readonly seed?: { platform?: DevicePlatform }) {}

  async get<T>(key: string): Promise<T | null> {
    return (this.values.get(key) as T | undefined) ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    const next = this.seed?.platform && isDeviceValue(value)
      ? { ...value, platform: this.seed.platform }
      : value;
    this.values.set(key, next);
  }

  async remove(key: string): Promise<void> {
    this.values.delete(key);
  }
}

function isDeviceValue(value: unknown): value is { platform: DevicePlatform } {
  return Boolean(value && typeof value === "object" && "platform" in value);
}
