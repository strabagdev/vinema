import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGuard } from "@/features/auth/auth-guard";
import type { AuthState } from "@/features/auth/auth-state-engine";

const mocks = vi.hoisted(() => ({
  pathname: "/",
  replace: vi.fn(),
  push: vi.fn(),
    auth: {
      authStatus: "BOOT",
      isAuthenticated: false,
      isLoading: true,
      syncState: {
        connectivity: "UNKNOWN",
      },
      state: {
        status: "BOOT",
      } as AuthState,
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
}));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => mocks.auth,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("AuthGuard state presentation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.pathname = "/";
    mocks.replace.mockReset();
    mocks.push.mockReset();
    mocks.auth = {
      authStatus: "BOOT",
      isAuthenticated: false,
      isLoading: true,
      syncState: {
        connectivity: "UNKNOWN",
      },
      state: {
        status: "BOOT",
      } as AuthState,
    };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("shows the neutral startup screen only for blocking startup state", async () => {
    vi.useFakeTimers();
    await renderGuard();

    expect(container.querySelector("[data-vinema-initial-loading]")).toBeNull();
    await advanceTimers(180);

    const startup = container.querySelector("[data-vinema-initial-loading]");

    expect(container.textContent).not.toContain("Preparando Vinema");
    expect(container.textContent).not.toContain("Restaurando sesion");
    expect(container.textContent).not.toContain("Protected");
    expect(container.querySelector(".rounded-lg")).toBeNull();
    expect(startup).toBeDefined();
    expect(startup?.className).toContain("fixed");
    expect(startup?.className).toContain("inset-0");
    expect(startup?.className).toContain("min-h-dvh");
    expect(startup?.className).toContain("bg-[var(--vinema-surface-background)]");
    expect(startup?.getAttribute("data-vinema-initial-loading-theme")).toBe(
      "semantic",
    );
    expect(startup?.getAttribute("data-vinema-initial-loading-motion")).toBe(
      "reduced-safe",
    );
    expect(startup?.getAttribute("data-vinema-initial-loading-stage")).toBe("auth");
    expect(
      startup?.querySelector("[data-vinema-initial-loading-message]")?.textContent,
    ).toBe("Preparando tu espacio");
    expect(
      (
        startup?.querySelector(
          "[data-vinema-initial-loading-progress]",
        ) as HTMLElement | null
      )?.style.width,
    ).toBe("25%");
    expect(startup?.textContent).not.toContain("%");
    expect(startup?.querySelector("[data-vinema-brand='monogram']")).toBeDefined();
    expect(startup?.querySelector(".vinema-initial-loading-logo")).toBeDefined();

    vi.useRealTimers();
  });

  it("allows local-only authenticated sessions", async () => {
    mocks.auth = {
      authStatus: "AUTHENTICATED_LOCAL",
      isAuthenticated: true,
      isLoading: false,
      syncState: {
        connectivity: "ONLINE",
      },
      state: {
        status: "AUTHENTICATED_LOCAL",
      } as AuthState,
    };

    await renderGuard();

    expect(container.textContent).toContain("Protected");
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  async function renderGuard() {
    await act(async () => {
      root.render(
        createElement(
          AuthGuard,
          null,
          createElement("p", null, "Protected"),
        ),
      );
    });
  }
});

async function advanceTimers(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}
