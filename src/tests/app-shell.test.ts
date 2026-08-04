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
    expect(screen.querySelector("button[aria-label='Capturar']")).toBeNull();
    expect(screen.innerHTML).not.toContain("fixed bottom-5 right-5");
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
