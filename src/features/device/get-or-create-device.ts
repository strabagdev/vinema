import {
  DevicePlatform,
  type Device,
} from "@/domain/device/device";
import type { StorageAdapter } from "@/infrastructure/storage/storage-adapter";
import { detectPlatform } from "@/infrastructure/platform/detect-platform";

const DEVICE_KEY = "vinema:device";

function createDeviceName(platform: DevicePlatform) {
  const platformLabel = platform.toLowerCase();
  return `Vinema ${platformLabel}`;
}

function createDeviceId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function getOrCreateDevice(
  storage: StorageAdapter,
  platform: DevicePlatform = detectPlatform(),
): Promise<Device> {
  const now = new Date().toISOString();
  const existingDevice = await storage.get<Device>(DEVICE_KEY);

  if (existingDevice) {
    const updatedDevice: Device = {
      ...existingDevice,
      platform,
      lastSeenAt: now,
    };

    await storage.set(DEVICE_KEY, updatedDevice);
    return updatedDevice;
  }

  const device: Device = {
    id: createDeviceId(),
    name: createDeviceName(platform),
    platform,
    createdAt: now,
    lastSeenAt: now,
  };

  await storage.set(DEVICE_KEY, device);
  return device;
}
