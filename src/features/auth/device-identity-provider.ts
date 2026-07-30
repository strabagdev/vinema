import type {
  DeviceAppType,
  DevicePlatform as TrustedDevicePlatform,
  RegisterDeviceRequest,
} from "@vinema/sync-contracts";
import { DevicePlatform } from "@/domain/device/device";
import { getOrCreateDevice } from "@/features/device/get-or-create-device";
import { IndexedDbAdapter } from "@/infrastructure/storage/indexed-db-adapter";
import type { StorageAdapter } from "@/infrastructure/storage/storage-adapter";

export type DeviceIdentityProvider = {
  getClientDeviceId(): Promise<string>;
  getDeviceMetadata(): Promise<RegisterDeviceRequest>;
};

export function createDeviceIdentityProvider({
  storage = new IndexedDbAdapter(),
  appVersion,
  detect = defaultRuntimeDetection,
}: {
  storage?: StorageAdapter;
  appVersion?: string;
  detect?: () => RuntimeDeviceDetection;
} = {}): DeviceIdentityProvider {
  return {
    async getClientDeviceId() {
      const device = await getOrCreateDevice(storage, toLocalPlatform(detect()));
      return device.id;
    },

    async getDeviceMetadata() {
      const runtime = detect();
      const device = await getOrCreateDevice(storage, toLocalPlatform(runtime));
      const appType = detectAppType(device.platform, runtime);
      const platform = mapPlatform(device.platform, runtime);

      return {
        clientDeviceId: device.id,
        name: createDeviceName({ appType, platform }),
        platform,
        appType,
        appVersion,
      };
    },
  };
}

function toLocalPlatform(runtime: RuntimeDeviceDetection): DevicePlatform {
  if (runtime.tauri) {
    if (/windows|win32|win64/i.test(runtime.userAgent)) {
      return DevicePlatform.WINDOWS;
    }
    if (/macintosh|mac os x|macos/i.test(runtime.userAgent)) {
      return DevicePlatform.MACOS;
    }
    if (/linux|x11/i.test(runtime.userAgent)) {
      return DevicePlatform.LINUX;
    }

    return DevicePlatform.UNKNOWN;
  }

  if (runtime.standalone) {
    return DevicePlatform.PWA;
  }

  if (runtime.userAgent.trim()) {
    return DevicePlatform.WEB;
  }

  return DevicePlatform.UNKNOWN;
}

export type RuntimeDeviceDetection = {
  tauri: boolean;
  standalone: boolean;
  userAgent: string;
};

function defaultRuntimeDetection(): RuntimeDeviceDetection {
  const userAgent =
    typeof navigator === "undefined" ? "" : navigator.userAgent;
  const standalone =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  const tauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  return { tauri, standalone, userAgent };
}

function detectAppType(
  platform: DevicePlatform,
  runtime: RuntimeDeviceDetection,
): DeviceAppType {
  if (runtime.tauri || isNativePlatform(platform)) {
    return "TAURI";
  }

  if (runtime.standalone || platform === DevicePlatform.PWA) {
    return "PWA";
  }

  if (platform === DevicePlatform.WEB) {
    return "WEB";
  }

  return "UNKNOWN";
}

function mapPlatform(
  platform: DevicePlatform,
  runtime: RuntimeDeviceDetection,
): TrustedDevicePlatform {
  if (platform === DevicePlatform.WINDOWS) {
    return "windows";
  }
  if (platform === DevicePlatform.MACOS) {
    return "macos";
  }
  if (platform === DevicePlatform.LINUX) {
    return "linux";
  }

  if (/android/i.test(runtime.userAgent)) {
    return "android";
  }
  if (/iphone|ipad|ipod/i.test(runtime.userAgent)) {
    return "ios";
  }
  if (platform === DevicePlatform.WEB || platform === DevicePlatform.PWA) {
    return "web";
  }

  return "unknown";
}

function createDeviceName({
  appType,
  platform,
}: {
  appType: DeviceAppType;
  platform: TrustedDevicePlatform;
}) {
  if (appType === "PWA") {
    return "Vinema PWA";
  }
  if (appType === "TAURI") {
    return `Vinema ${platformLabel(platform)}`;
  }
  if (appType === "WEB") {
    return "Vinema Web";
  }

  return "Vinema";
}

function platformLabel(platform: TrustedDevicePlatform) {
  if (platform === "macos") {
    return "macOS";
  }

  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

function isNativePlatform(platform: DevicePlatform) {
  return (
    platform === DevicePlatform.WINDOWS ||
    platform === DevicePlatform.MACOS ||
    platform === DevicePlatform.LINUX
  );
}
