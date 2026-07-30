import type {
  CreateDeviceInput,
  DeviceRecord,
  DeviceRepository,
  UpdateDeviceMetadataInput,
} from "../auth/device-repository";

export class InMemoryDeviceRepository implements DeviceRepository {
  readonly devices = new Map<string, DeviceRecord>();

  async findByUserAndClientDeviceId(userId: string, clientDeviceId: string) {
    return (
      [...this.devices.values()].find(
        (device) =>
          device.userId === userId &&
          device.clientDeviceId === clientDeviceId,
      ) ?? null
    );
  }

  async create(input: CreateDeviceInput) {
    const device: DeviceRecord = {
      id: crypto.randomUUID(),
      userId: input.userId,
      clientDeviceId: input.clientDeviceId,
      name: input.name,
      platform: input.platform,
      appType: input.appType,
      appVersion: input.appVersion ?? null,
      createdAt: input.now,
      updatedAt: input.now,
      lastSeenAt: input.now,
      revokedAt: null,
    };
    this.devices.set(device.id, device);
    return device;
  }

  async updateMetadata(input: UpdateDeviceMetadataInput) {
    const existing = this.devices.get(input.deviceId);
    if (!existing) {
      throw new Error("Device not found");
    }

    const updated: DeviceRecord = {
      ...existing,
      name: input.name,
      platform: input.platform,
      appType: input.appType,
      appVersion: input.appVersion ?? null,
      updatedAt: input.lastSeenAt,
      lastSeenAt: input.lastSeenAt,
    };
    this.devices.set(updated.id, updated);
    return updated;
  }

  async touchLastSeen(deviceId: string, at: Date) {
    const existing = this.devices.get(deviceId);
    if (!existing) {
      throw new Error("Device not found");
    }

    const updated = { ...existing, updatedAt: at, lastSeenAt: at };
    this.devices.set(updated.id, updated);
    return updated;
  }

  async findById(deviceId: string) {
    return this.devices.get(deviceId) ?? null;
  }

  async listByUserId(userId: string) {
    return [...this.devices.values()].filter((device) => device.userId === userId);
  }

  revoke(deviceId: string, at = new Date()) {
    const existing = this.devices.get(deviceId);
    if (existing) {
      this.devices.set(deviceId, { ...existing, revokedAt: at, updatedAt: at });
    }
  }
}
