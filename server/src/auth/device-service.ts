import type {
  CurrentDeviceResponse,
  DeviceAppType,
  DevicePlatform,
  DeviceSummary,
  RegisterDeviceRequest,
  RegisterDeviceResponse,
} from "@vinema/sync-contracts";
import { AuthError } from "./auth-errors";
import type { AuthContext } from "./access-token";
import type { DeviceRecord, DeviceRepository } from "./device-repository";

const VALID_PLATFORMS = new Set<DevicePlatform>([
  "windows",
  "macos",
  "linux",
  "android",
  "ios",
  "web",
  "unknown",
]);
const VALID_APP_TYPES = new Set<DeviceAppType>(["WEB", "PWA", "TAURI", "UNKNOWN"]);

export type DeviceService = {
  registerOrUpdateDevice(input: RegisterOrUpdateDeviceInput): Promise<RegisterDeviceResponse>;
  getCurrentDevice(authContext: AuthContext): Promise<CurrentDeviceResponse>;
};

export type RegisterOrUpdateDeviceInput = RegisterDeviceRequest & {
  userId: string;
};

export function createDeviceService({
  repository,
  clock = () => new Date(),
}: {
  repository: DeviceRepository;
  clock?: () => Date;
}): DeviceService {
  return {
    async registerOrUpdateDevice(input) {
      const metadata = normalizeDeviceInput(input);
      const existing = await repository.findByUserAndClientDeviceId(
        input.userId,
        metadata.clientDeviceId,
      );
      const now = clock();

      if (!existing) {
        const device = await repository.create({
          userId: input.userId,
          ...metadata,
          now,
        });
        return { device: toDeviceSummary(device), created: true };
      }

      if (existing.revokedAt) {
        throw new AuthError("DEVICE_REVOKED", "Dispositivo revocado.", 403);
      }

      const device = await repository.updateMetadata({
        deviceId: existing.id,
        ...metadata,
        lastSeenAt: now,
      });

      return { device: toDeviceSummary(device), created: false };
    },

    async getCurrentDevice(authContext) {
      const device = await repository.findById(authContext.deviceId);
      if (!device || device.userId !== authContext.userId) {
        throw new AuthError("TOKEN_INVALID", "Token invalido.", 401);
      }

      if (device.revokedAt) {
        throw new AuthError("DEVICE_REVOKED", "Dispositivo revocado.", 403);
      }

      return { device: toDeviceSummary(device) };
    },
  };
}

export function toDeviceSummary(device: DeviceRecord): DeviceSummary {
  return {
    id: device.id,
    userId: device.userId,
    clientDeviceId: device.clientDeviceId,
    name: device.name,
    platform: normalizePlatform(device.platform),
    appType: normalizeAppType(device.appType),
    appVersion: device.appVersion,
    createdAt: device.createdAt.toISOString(),
    updatedAt: device.updatedAt.toISOString(),
    lastSeenAt: device.lastSeenAt.toISOString(),
    revokedAt: device.revokedAt?.toISOString() ?? null,
  };
}

function normalizeDeviceInput(input: RegisterOrUpdateDeviceInput) {
  const clientDeviceId = input.clientDeviceId.trim();
  if (!clientDeviceId) {
    throw new AuthError("VALIDATION_ERROR", "clientDeviceId requerido.", 400);
  }

  return {
    clientDeviceId,
    name: input.name.trim() || "Vinema",
    platform: normalizePlatform(input.platform),
    appType: normalizeAppType(input.appType),
    appVersion: input.appVersion?.trim() || null,
  };
}

function normalizePlatform(platform: string): DevicePlatform {
  const value = platform.toLowerCase() as DevicePlatform;
  return VALID_PLATFORMS.has(value) ? value : "unknown";
}

function normalizeAppType(appType: string): DeviceAppType {
  const value = appType.toUpperCase() as DeviceAppType;
  return VALID_APP_TYPES.has(value) ? value : "UNKNOWN";
}
