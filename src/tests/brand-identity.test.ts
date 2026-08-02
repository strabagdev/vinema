import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { act, createElement } from "react";
import type { ComponentType, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthScreen } from "@/app/login/login-client";
import manifest from "@/app/manifest";
import {
  BrandIntro,
  BrandLockup,
  BrandMonogram,
  BrandWordmark,
  brandGeometry,
  brandTokens,
} from "@/brand";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

describe("Vinema identity system", () => {
  afterEach(async () => {
    await act(async () => {
      root?.unmount();
      await flushPromises();
    });
    root = null;
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it("renders official wordmark and monogram as SVG, not HTML logo text", async () => {
    const screen = await render(
      createElement(
        "div",
        null,
        createElement(BrandWordmark),
        createElement(BrandMonogram),
      ),
    );

    expect(screen.querySelector("[data-brand-wordmark]")).toBeTruthy();
    expect(screen.querySelector("[data-brand-monogram]")).toBeTruthy();
    expect(screen.querySelector("[data-brand-wordmark]")?.textContent).toBe(
      "Vinema",
    );
    expect(screen.querySelector("[data-brand-monogram]")?.textContent).toBe(
      "Vinema",
    );
    expect(screen.querySelector("[data-brand-wordmark] span")).toBeNull();
  });

  it("keeps the official A crossbarless and separated from V in the monogram", () => {
    expect(brandGeometry.aPath).toBe("M282 70L296 10L310 70");
    expect(brandGeometry.monogramAPath).toBe("M48 70L62 10L76 70");
    expect(brandGeometry.aPath).not.toMatch(/[HV]/);
    expect(brandGeometry.monogramAPath).not.toMatch(/[HV]/);
    expect(brandTokens.brandMonogramGap).toBe(10);
  });

  it("keeps the typographic construction geometric, light, and uniform", async () => {
    const screen = await render(
      createElement(
        "div",
        null,
        createElement(BrandWordmark),
        createElement(BrandMonogram),
        createElement(BrandLockup),
      ),
    );

    expect(brandGeometry.strokeWidth).toBe(8);
    expect(brandGeometry.lineCap).toBe("butt");
    expect(brandGeometry.lineJoin).toBe("miter");
    expect(brandTokens.brandWordmarkTracking).toBeGreaterThanOrEqual(16);
    expect(brandGeometry.lockupViewBox).toBe("0 0 436 80");

    for (const path of screen.querySelectorAll("path")) {
      expect(path.getAttribute("stroke-width")).toBe("8");
      expect(path.getAttribute("stroke-linecap")).toBe("butt");
      expect(path.getAttribute("stroke-linejoin")).toBe("miter");
      expect(path.getAttribute("vector-effect")).toBe("non-scaling-stroke");
    }
  });

  it("uses the same V and A geometry in the lockup and monogram families", async () => {
    const screen = await render(createElement(BrandLockup));

    expect(screen.querySelector("[data-brand-lockup-monogram]")).toBeTruthy();
    expect(screen.querySelector("[data-brand-lockup-wordmark]")).toBeTruthy();
    expect(
      Array.from(screen.querySelectorAll("[data-brand-letter='A']")).map((path) =>
        path.getAttribute("d"),
      ),
    ).toEqual([brandGeometry.monogramAPath, brandGeometry.aPath]);
  });

  it("runs the spatial intro in the final header position and then settles", async () => {
    vi.useFakeTimers();
    setMatchMedia(false);
    const screen = await render(createElement(BrandIntro));

    expect(screen.querySelector("[data-brand-intro]")).toBeTruthy();
    expect(
      screen.querySelector("[data-brand-intro]")?.getAttribute("data-brand-intro-state"),
    ).toBe("running");
    expect(screen.querySelector("[data-brand-spatial-identity]")).toBeTruthy();
    expect(screen.querySelector("[data-brand-monogram]")).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(brandTokens.brandIntroDuration);
      await flushPromises();
    });

    expect(screen.querySelector("[data-brand-intro]")).toBeTruthy();
    expect(
      screen.querySelector("[data-brand-intro]")?.getAttribute("data-brand-intro-state"),
    ).toBe("settled");

    await act(async () => {
      root?.render(createElement(BrandIntro));
      await flushPromises();
    });

    expect(
      screen.querySelector("[data-brand-intro]")?.getAttribute("data-brand-intro-state"),
    ).toBe("settled");
  });

  it("renders the settled identity immediately when reduced motion is preferred", async () => {
    setMatchMedia(true);
    const screen = await render(createElement(BrandIntro));

    await flushPromises();

    expect(screen.querySelector("[data-brand-intro]")).toBeTruthy();
    expect(
      screen.querySelector("[data-brand-intro]")?.getAttribute("data-brand-intro-state"),
    ).toBe("settled");
  });

  it("declares PWA assets from the VA monogram identity", () => {
    const appManifest = manifest();

    expect(appManifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: "/brand/favicon.svg" }),
        expect.objectContaining({ src: "/brand/pwa-192.png", sizes: "192x192" }),
        expect.objectContaining({ src: "/brand/pwa-512.png", sizes: "512x512" }),
        expect.objectContaining({
          src: "/brand/pwa-maskable-512.png",
          purpose: "maskable",
        }),
      ]),
    );
    expect(readText("public/brand/favicon.svg")).toContain("M69 100L85 28L101 100");
    expect(statSync(join(process.cwd(), "public/brand/pwa-192.png")).size).toBeGreaterThan(
      0,
    );
    expect(statSync(join(process.cwd(), "public/brand/favicon.ico")).size).toBeGreaterThan(
      0,
    );
  });

  it("uses the official SVG wordmark on authentication screens", async () => {
    const TestAuthScreen = AuthScreen as ComponentType<{
      title: string;
      description: string;
      children?: ReactNode;
    }>;
    const screen = await render(
      createElement(
        TestAuthScreen,
        {
          title: "Iniciar sesion",
          description: "Entra a tu memoria local.",
        },
        createElement("p", null, "Formulario"),
      ),
    );

    expect(screen.querySelector("[data-brand-wordmark]")).toBeTruthy();
    expect(screen.querySelector("[data-brand-monogram]")).toBeNull();
    expect(screen.textContent).not.toContain(" V ");
  });

  it("keeps Tauri icon configuration pointed at generated VA assets", () => {
    const tauriConfig = readText("src-tauri/tauri.conf.json");

    expect(tauriConfig).toContain("icons/32x32.png");
    expect(tauriConfig).toContain("icons/128x128.png");
    expect(tauriConfig).toContain("icons/128x128@2x.png");
    expect(tauriConfig).toContain("icons/icon.icns");
    expect(tauriConfig).toContain("icons/icon.ico");
    expect(statSync(join(process.cwd(), "src-tauri/icons/icon.ico")).size).toBeGreaterThan(
      0,
    );
    expect(statSync(join(process.cwd(), "src-tauri/icons/icon.icns")).size).toBeGreaterThan(
      0,
    );
  });
});

async function render(element: ReactNode) {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(element);
    await flushPromises();
  });

  return container;
}

function readText(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function setMatchMedia(reducedMotion: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: reducedMotion && query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}
