import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { AppHeader } from "@/components/app-shell/app-header";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
  }),
}));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({
    user: { email: "user@example.test", displayName: "User" },
    isAuthenticated: true,
    workspaceId: "workspace-1",
    deviceId: "device-1",
    syncNow: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock("@/features/node/hooks/use-vinema-context", () => ({
  useVinemaContext: () => ({
    status: "ready",
    workspace: {
      id: "workspace-1",
      name: "Personal",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    device: {
      id: "device-1",
      workspaceId: "workspace-1",
      name: "Vinema Web",
      platform: "WEB",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    error: null,
  }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("AppHeader", () => {
  it("keeps the main header minimal and moves Archive into the session menu", async () => {
    const screen = await renderHeader();

    expect(
      screen.querySelector("a[aria-label='Ir a Inicio']")?.getAttribute("href"),
    ).toBe("/");
    expect(screen.querySelector("nav[aria-label='Navegacion principal']")).toBeNull();
    expect(screen.querySelector("a[aria-label='Explorar']")).toBeNull();
    expect(screen.textContent).not.toContain("Explorar");
    expect(screen.textContent).not.toContain("Base de conocimiento");

    await click(screen.querySelector("button[aria-label='Abrir menu']"));

    expect(document.body.querySelector("a[href='/notes/archive']")).toBeTruthy();
    expect(document.body.textContent).toContain("Respaldar conocimiento");
    expect(document.body.textContent).toContain("Restaurar conocimiento");
    expect(document.body.textContent).toContain("Vaciar conocimiento");
    expect(document.body.textContent).toContain("Cerrar sesion");
    expect(document.body.textContent).not.toContain("Sincronizacion futura");
  });
});

async function renderHeader() {
  const container = document.createElement("div");
  document.body.replaceChildren(container);

  await act(async () => {
    createRoot(container).render(
      createElement(AppHeader, {
        pathname: "/",
        onFocusWriting: vi.fn(),
      }),
    );
    await flushPromises();
  });

  return container;
}

async function click(element: Element | null) {
  if (!(element instanceof HTMLElement)) {
    throw new Error("Expected clickable element.");
  }

  await act(async () => {
    element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();
  });
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}
