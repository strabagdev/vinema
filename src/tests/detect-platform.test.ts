import { describe, expect, it } from "vitest";
import { DevicePlatform } from "@/domain/device/device";
import { detectPlatform } from "@/infrastructure/platform/detect-platform";

describe("detectPlatform", () => {
  it("detects a regular browser as web", () => {
    expect(detectPlatform({ userAgent: "Mozilla/5.0" })).toBe(DevicePlatform.WEB);
  });

  it("detects standalone browser mode as pwa", () => {
    expect(detectPlatform({ standalone: true, userAgent: "Mozilla/5.0" })).toBe(
      DevicePlatform.PWA,
    );
  });

  it("detects tauri on linux", () => {
    expect(
      detectPlatform({
        tauri: true,
        userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
      }),
    ).toBe(DevicePlatform.LINUX);
  });

  it("detects tauri on macOS", () => {
    expect(
      detectPlatform({
        tauri: true,
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      }),
    ).toBe(DevicePlatform.MACOS);
  });

  it("detects tauri on windows", () => {
    expect(
      detectPlatform({
        tauri: true,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      }),
    ).toBe(DevicePlatform.WINDOWS);
  });
});
