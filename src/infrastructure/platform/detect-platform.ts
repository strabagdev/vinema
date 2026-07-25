import { DevicePlatform } from "@/domain/device/device";
import type { PlatformRuntime } from "@/infrastructure/platform/platform";

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

export function detectPlatform(runtime?: PlatformRuntime): DevicePlatform {
  const userAgent =
    runtime?.userAgent ?? (typeof navigator === "undefined" ? "" : navigator.userAgent);
  const hasDisplayModeStandalone =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  const isStandalone =
    runtime?.standalone ??
    (typeof window !== "undefined" &&
      (hasDisplayModeStandalone ||
        Boolean((navigator as NavigatorWithStandalone).standalone)));
  const isTauri =
    runtime?.tauri ??
    (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window);

  if (isStandalone && !isTauri) {
    return DevicePlatform.PWA;
  }

  if (isTauri) {
    if (/windows|win32|win64/i.test(userAgent)) {
      return DevicePlatform.WINDOWS;
    }

    if (/macintosh|mac os x|macos/i.test(userAgent)) {
      return DevicePlatform.MACOS;
    }

    if (/linux|x11/i.test(userAgent)) {
      return DevicePlatform.LINUX;
    }

    return DevicePlatform.UNKNOWN;
  }

  return DevicePlatform.WEB;
}
