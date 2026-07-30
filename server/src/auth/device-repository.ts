import type { DeviceAppType, PrismaClient } from "@prisma/client";

export type DeviceRecord = {
  id: string;
  userId: string;
  clientDeviceId: string;
  name: string;
  platform: string;
  appType: DeviceAppType;
  appVersion: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
};

export type CreateDeviceInput = {
  userId: string;
  clientDeviceId: string;
  name: string;
  platform: string;
  appType: DeviceAppType;
  appVersion?: string | null;
  now: Date;
};

export type UpdateDeviceMetadataInput = {
  deviceId: string;
  name: string;
  platform: string;
  appType: DeviceAppType;
  appVersion?: string | null;
  lastSeenAt: Date;
};

export interface DeviceRepository {
  findByUserAndClientDeviceId(
    userId: string,
    clientDeviceId: string,
  ): Promise<DeviceRecord | null>;
  create(input: CreateDeviceInput): Promise<DeviceRecord>;
  updateMetadata(input: UpdateDeviceMetadataInput): Promise<DeviceRecord>;
  touchLastSeen(deviceId: string, at: Date): Promise<DeviceRecord>;
  findById(deviceId: string): Promise<DeviceRecord | null>;
  listByUserId(userId: string): Promise<DeviceRecord[]>;
}

export class PrismaDeviceRepository implements DeviceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByUserAndClientDeviceId(userId: string, clientDeviceId: string) {
    return this.prisma.device.findUnique({
      where: { userId_clientDeviceId: { userId, clientDeviceId } },
    });
  }

  create(input: CreateDeviceInput) {
    return this.prisma.device.create({
      data: {
        userId: input.userId,
        clientDeviceId: input.clientDeviceId,
        name: input.name,
        platform: input.platform,
        appType: input.appType,
        appVersion: input.appVersion ?? null,
        lastSeenAt: input.now,
      },
    });
  }

  updateMetadata(input: UpdateDeviceMetadataInput) {
    return this.prisma.device.update({
      where: { id: input.deviceId },
      data: {
        name: input.name,
        platform: input.platform,
        appType: input.appType,
        appVersion: input.appVersion ?? null,
        lastSeenAt: input.lastSeenAt,
      },
    });
  }

  touchLastSeen(deviceId: string, at: Date) {
    return this.prisma.device.update({
      where: { id: deviceId },
      data: { lastSeenAt: at },
    });
  }

  findById(deviceId: string) {
    return this.prisma.device.findUnique({ where: { id: deviceId } });
  }

  listByUserId(userId: string) {
    return this.prisma.device.findMany({
      where: { userId },
      orderBy: { lastSeenAt: "desc" },
    });
  }
}
