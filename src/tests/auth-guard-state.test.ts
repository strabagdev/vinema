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
    isAuthenticated: false,
    isLoading: true,
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
      isAuthenticated: false,
      isLoading: true,
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

  it("shows the preparing screen only for blocking startup state", async () => {
    await renderGuard();

    expect(container.textContent).toContain("Preparando Vinema");
    expect(container.textContent).not.toContain("Protected");
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
