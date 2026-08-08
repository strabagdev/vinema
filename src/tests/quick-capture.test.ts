import { act, createElement } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app-shell/app-shell";
import type { Device } from "@/domain/device/device";
import { DevicePlatform } from "@/domain/device/device";
import type { Workspace } from "@/domain/workspace/workspace";
import { CANVAS_PREFERENCES_KEY } from "@/features/canvas/canvas-preferences";
import { QuickCaptureSheet } from "@/features/capture/quick-capture-sheet";
import type { StorageAdapter } from "@/infrastructure/storage/storage-adapter";
import { InMemoryContextRepository } from "@/tests/fakes/in-memory-context-repository";
import { InMemoryNodeContextRelationRepository } from "@/tests/fakes/in-memory-node-context-relation-repository";
import { InMemoryNodeRepository } from "@/tests/fakes/in-memory-node-repository";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  pathname: "/memory",
  push: vi.fn(),
  replace: vi.fn(),
  logout: vi.fn(async (): Promise<void> => undefined),
  syncConnectivity: "ONLINE",
}));

class MemoryStorageAdapter implements StorageAdapter {
  readonly data = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | null> {
    return (this.data.get(key) as T | undefined) ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.data.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.data.delete(key);
  }
}

const workspace: Workspace = {
  id: "workspace-1",
  name: "Personal",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const device: Device = {
  id: "device-1",
  name: "Web",
  platform: DevicePlatform.WEB,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastSeenAt: "2026-01-01T00:00:00.000Z",
};

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
  }),
}));

vi.mock("@/features/auth/auth-provider", () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({
    state: { status: "AUTHENTICATED_ONLINE", error: null },
    user: { email: "user@example.test", displayName: "User" },
    workspaceId: "workspace-1",
    accessToken: "access-token",
    syncState: {
      lifecycle: "STARTED",
      phase: "IDLE",
      connectivity: mocks.syncConnectivity,
      authentication: "AUTHENTICATED",
      pendingMutations: 0,
      processingMutations: 0,
      failedMutations: 0,
      conflictCount: 0,
      lastRunStartedAt: null,
      lastRunFinishedAt: null,
      lastSuccessfulSyncAt: null,
      nextRunAt: null,
      lastError: null,
    },
    isAuthenticated: true,
    isLoading: false,
    error: null,
    register: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
    logout: mocks.logout,
  }),
}));

let currentRoot: Root | null = null;

describe("Global writing entry", () => {
  beforeEach(() => {
    mocks.pathname = "/memory";
    mocks.push.mockClear();
    mocks.replace.mockClear();
    mocks.logout.mockReset();
    mocks.logout.mockResolvedValue(undefined);
    mocks.syncConnectivity = "ONLINE";
    setNavigatorOnline(true);
  });

  afterEach(async () => {
    await act(async () => {
      currentRoot?.unmount();
      await flushPromises();
    });
    currentRoot = null;
    document.body.replaceChildren();
  });

  it("keeps the removed global writing action out of the account header", async () => {
    const { container } = await renderAppShell();

    expect(container.querySelector("button[aria-label='Capturar']")).toBeNull();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(document.querySelector("[role='dialog']")).toBeNull();
    expect(document.querySelector("#quick-capture-editor")).toBeNull();
  });

  it("renders a minimal top header with Archive in the session menu", async () => {
    mocks.pathname = "/";
    const { container } = await renderAppShell();
    const header = container.querySelector("header");
    const nav = container.querySelector("nav[aria-label='Navegacion principal']");

    expect(header?.className).not.toContain("border-b");
    expect(container.querySelector("aside")).toBeNull();
    expect(nav).toBeNull();
    const memoryStatusTrigger = container.querySelector(
      "button[aria-label='Abrir Estado de la memoria']",
    );
    expect(memoryStatusTrigger).toBeNull();
    expect(container.querySelector("a[aria-label='Vinema']")?.getAttribute("href")).toBe("/");
    expect(container.querySelector("[data-vinema-brand='monogram']")).toBeTruthy();
    expect(header?.textContent).not.toContain("VN");
    expect(container.querySelector("a[aria-label='Explorar']")).toBeNull();
  });

  it("waits for local logout before navigating to login", async () => {
    let resolveLogout: (() => void) | undefined;
    mocks.logout.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveLogout = resolve;
        }),
    );
    const { container } = await renderAppShell();

    await pointerDown(container.querySelector<HTMLButtonElement>("button[aria-label='Abrir menu']"));
    const logoutItem = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      .find((item) => item.textContent?.includes("Cerrar sesion"));
    if (!logoutItem) {
      throw new Error("Missing logout menu item.");
    }
    await click(logoutItem);

    expect(mocks.logout).toHaveBeenCalledTimes(1);
    expect(mocks.replace).not.toHaveBeenCalled();

    await act(async () => {
      resolveLogout?.();
      await flushPromises();
    });

    expect(mocks.replace).toHaveBeenCalledWith("/login");
  });

  it("does not show the old permanent local-only badge while online", async () => {
    setNavigatorOnline(true);

    const { container } = await renderAppShell();

    expect(container.textContent).not.toContain("Solo local");
    expect(container.textContent).not.toContain("Modo local");
  });

  it("shows a quiet local-mode signal when the browser is offline", async () => {
    mocks.syncConnectivity = "OFFLINE";
    setNavigatorOnline(false);

    const { container } = await renderAppShell();

    expect(container.querySelector("[data-feedback-kind='offline']")).toBeTruthy();
  });

  it("uses Ctrl+Shift+K to focus writing without opening a second editor", async () => {
    await renderAppShell();

    await keydown({ key: "K", ctrlKey: true, shiftKey: true });

    expect(mocks.push).toHaveBeenCalledWith("/#capture");
    expect(document.querySelector("[role='dialog']")).toBeNull();
    expect(document.querySelector("#quick-capture-editor")).toBeNull();
  });

  it("uses Cmd+Shift+K to focus writing and accepts uppercase keys", async () => {
    await renderAppShell();

    await keydown({ key: "K", metaKey: true, shiftKey: true });

    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith("/#capture");
  });

  it("applies canvas text size and the single canvas font to quick capture", async () => {
    const storage = new MemoryStorageAdapter();
    await storage.set(CANVAS_PREFERENCES_KEY, {
      width: "compact",
      textSize: 18,
      fontFamily: "mono",
      appearance: "system",
    });
    const container = document.createElement("div");
    document.body.replaceChildren(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(QuickCaptureSheet, {
          open: true,
          onOpenChange: vi.fn(),
          onOpenFullCapture: vi.fn(),
          device,
          workspace,
          storage,
          repositories: {
            nodeRepository: new InMemoryNodeRepository(),
            contextRepository: new InMemoryContextRepository(),
            nodeContextRelationRepository:
              new InMemoryNodeContextRelationRepository(),
          },
        }),
      );
      await flushPromises();
    });
    currentRoot = root;

    const textarea = document.querySelector<HTMLTextAreaElement>(
      "#quick-capture-editor",
    );

    expect(textarea?.style.fontSize).toBe("18px");
    expect(textarea?.style.fontFamily).toContain("var(--font-geist-sans)");
  });

  it("ignores partial shortcut combinations and other keys", async () => {
    await renderAppShell();

    await keydown({ key: "k", ctrlKey: true });
    await keydown({ key: "k", shiftKey: true });
    await keydown({ key: "x", ctrlKey: true, shiftKey: true });

    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("ignores incomplete keydown events without throwing", async () => {
    await renderAppShell();

    expect(() => {
      window.dispatchEvent(new Event("keydown"));
    }).not.toThrow();
    expect(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
    }).not.toThrow();

    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("dispatches focus from the global shortcut when the user is already on Inicio", async () => {
    mocks.pathname = "/";
    await renderAppShell();
    const focusEvents: string[] = [];
    window.addEventListener("vinema:focus-capture", () => {
      focusEvents.push("focus");
    });

    await keydown({ key: "k", ctrlKey: true, shiftKey: true });

    expect(mocks.push).not.toHaveBeenCalled();
    expect(focusEvents).toEqual(["focus"]);
  });

  it("does not steal shortcuts from editable fields", async () => {
    const { container } = await renderAppShell();
    const input = document.createElement("input");
    container.append(input);
    input.focus();

    await keydown({ key: "K", metaKey: true, shiftKey: true, target: input });

    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("removes the keydown listener on unmount", async () => {
    const addEventListener = vi.spyOn(window, "addEventListener");
    const removeEventListener = vi.spyOn(window, "removeEventListener");
    const { root } = await renderAppShell();
    const added = addEventListener.mock.calls.find(
      ([type]) => type === "keydown",
    );

    await act(async () => {
      root.unmount();
      await flushPromises();
    });
    currentRoot = null;

    const removed = removeEventListener.mock.calls.find(
      ([type, listener]) => type === "keydown" && listener === added?.[1],
    );

    expect(added).toBeTruthy();
    expect(removed).toBeTruthy();
  });

  it("does not duplicate the shortcut after repeated mounts", async () => {
    const first = await renderAppShell();
    await act(async () => {
      first.root.unmount();
      await flushPromises();
    });
    currentRoot = null;
    await renderAppShell();

    await keydown({ key: "k", ctrlKey: true, shiftKey: true });

    expect(mocks.push).toHaveBeenCalledTimes(1);
  });
});

async function renderAppShell(): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(createElement(AppShell, null, createElement("div", null, "Ruta")));
    await flushPromises();
  });

  currentRoot = root;
  return { container, root };
}

async function click(button: HTMLElement) {
  await act(async () => {
    button.click();
    await flushPromises();
  });
}

async function pointerDown(element: HTMLElement | null) {
  if (!element) {
    throw new Error("Missing pointer target.");
  }

  await act(async () => {
    element.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        ctrlKey: false,
      }),
    );
    await flushPromises();
  });
}

async function keydown({
  key,
  ctrlKey = false,
  metaKey = false,
  shiftKey = false,
  target = window,
}: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  target?: Window | HTMLElement | Document;
}) {
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        key,
        ctrlKey,
        metaKey,
        shiftKey,
      }),
    );
    await flushPromises();
  });
}

async function flushPromises() {
  for (let index = 0; index < 12; index += 1) {
    await Promise.resolve();
  }
}

function setNavigatorOnline(online: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => online,
  });
}
