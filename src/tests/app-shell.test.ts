import type React from "react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app-shell/app-shell";

const navigationMocks = vi.hoisted(() => ({
  pathname: "/",
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMocks.pathname,
  useRouter: () => ({
    push: navigationMocks.push,
  }),
}));

vi.mock("@/components/app-shell/app-header", () => ({
  AppHeader: () => createElement("header", { "data-app-header": "" }),
}));

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) =>
    createElement("div", null, children),
}));

vi.mock("@/features/auth/auth-guard", () => ({
  AuthGuard: ({ children }: { children: React.ReactNode }) =>
    createElement("div", { "data-auth-guard": "" }, children),
  isPublicAuthRoute: () => false,
}));

vi.mock("@/features/auth/auth-provider", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) =>
    createElement("div", { "data-auth-provider": "" }, children),
}));

vi.mock("@/features/feedback/visual-feedback-provider", () => ({
  VisualFeedbackProvider: ({ children }: { children: React.ReactNode }) =>
    createElement("div", null, children),
  VisualFeedbackPulse: () =>
    createElement("div", {
      "data-canvas-pulse": "",
      "data-visual-feedback-pulse": "",
    }),
  VisualFeedbackViewport: () =>
    createElement("div", { "data-visual-feedback-viewport": "" }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let mountedRoot: Root | null = null;

describe("AppShell", () => {
  beforeEach(() => {
    navigationMocks.pathname = "/";
    navigationMocks.push.mockReset();
  });

  afterEach(async () => {
    if (mountedRoot) {
      await act(async () => {
        mountedRoot?.unmount();
        mountedRoot = null;
      });
    }

    document.body.replaceChildren();
  });

  it("keeps canvas routes locked to the viewport without rendering the old mobile writing FAB", async () => {
    const screen = await renderAppShell();
    const shell = screen.querySelector("[data-app-shell]");

    expect(shell?.getAttribute("data-app-shell")).toBe("canvas");
    expect(shell?.className).toContain("h-dvh");
    expect(shell?.className).toContain("overflow-hidden");
    expect(shell?.className).toContain("vinema-canvas-layout");
    expect(shell?.className).toContain("bg-[var(--vinema-surface-background)]");
    expect(screen.querySelector("button[aria-label='Capturar']")).toBeNull();
    expect(screen.innerHTML).not.toContain("fixed bottom-5 right-5");
  });

  it("renders header, flexible main and fixed footer for canvas routes", async () => {
    const screen = await renderAppShell();
    const header = screen.querySelector("header");
    const main = screen.querySelector("main");
    const footer = screen.querySelector("[data-app-footer]");
    const pulse = screen.querySelector("[data-canvas-pulse]");
    const pulseSlot = screen.querySelector("[data-canvas-footer-pulse-slot]");

    expect(header?.getAttribute("data-app-header")).toBe("");
    expect(main?.className).toContain("flex-1");
    expect(main?.className).toContain("min-h-0");
    expect(main?.className).toContain("overflow-hidden");
    expect(footer?.tagName).toBe("FOOTER");
    expect(footer?.className).toContain("vinema-canvas-footer-grid");
    expect(footer?.className).toContain("w-full");
    expect(footer?.className).toContain("shrink-0");
    expect(footer?.className).toContain("bg-[var(--vinema-surface-background)]");
    expect(footer?.className).toContain(
      "pb-[max(0.5rem,env(safe-area-inset-bottom))]",
    );
    expect(pulseSlot?.className).toContain("col-[2]");
    expect(pulseSlot?.className).toContain("justify-center");
    expect(footer?.contains(pulse)).toBe(true);
    expect(main?.contains(pulse)).toBe(false);
  });

  it("does not expose the removed calm state contract", async () => {
    const screen = await renderAppShell();
    const shell = screen.querySelector("[data-app-shell]");

    expect(shell?.hasAttribute("data-calm-state")).toBe(false);
    expect(screen.querySelector("[data-calm-primary]")).toBeNull();
    expect(screen.querySelector("[data-calm-secondary]")).toBeNull();
  });
});

async function renderAppShell() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  mountedRoot = createRoot(container);

  await act(async () => {
    mountedRoot?.render(
      createElement(
        AppShell,
        null,
        createElement("section", { "data-testid": "content" }),
      ),
    );
  });

  return container;
}
