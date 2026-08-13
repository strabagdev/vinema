import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

describe("Vinema brand assets", () => {
  it("keeps the official master SVG geometry and currentColor", () => {
    const monogram = readFileSync("public/brand/vinema-monogram.svg", "utf8");
    const wordmark = readFileSync("public/brand/vinema-wordmark.svg", "utf8");
    const lockup = readFileSync("public/brand/vinema-lockup.svg", "utf8");

    expect(monogram).toContain("stroke=\"currentColor\"");
    expect(monogram).toContain("M18 16 L49 82 L73 16 L102 82");
    expect(wordmark).toContain("stroke=\"currentColor\"");
    expect(wordmark).toContain("M640 92 L668 18 L696 92");
    expect(lockup).toContain("stroke=\"currentColor\"");
    expect(lockup).toContain("M18 16 L49 82 L73 16 L102 82");
  });

  it("declares the official monogram assets for favicon and PWA", () => {
    const appManifest = manifest();
    const iconSources = appManifest.icons?.map((icon) => icon.src) ?? [];

    expect(iconSources).toEqual(
      expect.arrayContaining([
        "/icon.svg",
        "/icon-16.png",
        "/icon-32.png",
        "/icon-48.png",
        "/icon-192.png",
        "/icon-512.png",
      ]),
    );
    expect(readFileSync("public/icon.svg", "utf8")).toContain(
      "M18 16 L49 82 L73 16 L102 82",
    );
    for (const icon of [
      "public/icon-16.png",
      "public/icon-32.png",
      "public/icon-48.png",
      "public/icon-192.png",
      "public/icon-512.png",
      "public/apple-touch-icon.png",
    ]) {
      expect(existsSync(icon)).toBe(true);
    }
  });

  it("provides regenerated Tauri icon formats", () => {
    for (const icon of [
      "src-tauri/icons/32x32.png",
      "src-tauri/icons/128x128.png",
      "src-tauri/icons/128x128@2x.png",
      "src-tauri/icons/icon.png",
      "src-tauri/icons/icon.ico",
      "src-tauri/icons/icon.icns",
    ]) {
      expect(existsSync(icon)).toBe(true);
    }
  });

  it("keeps initial loading motion compatible with reduced-motion preferences", () => {
    const globals = readFileSync("src/app/globals.css", "utf8");

    expect(globals).toContain(".vinema-initial-loading-logo");
    expect(globals).toContain(".vinema-initial-loading-progress");
    expect(globals).toContain(".vinema-initial-loading-exit");
    expect(globals).toContain("@keyframes vinema-initial-loading-pulse");
    expect(globals).toContain("@media (prefers-reduced-motion: reduce)");
    expect(globals).toContain("animation: none;");
    expect(globals).toContain("transition: none;");
  });
});
