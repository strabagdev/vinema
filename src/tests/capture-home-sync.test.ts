import { act, createElement } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CaptureHomeClient } from "@/app/capture-home-client";
import type { CaptureSurfaceProps } from "@/features/capture/capture-surface";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  authStatus: "AUTHENTICATED_ONLINE",
  syncPhase: "IDLE",
  syncConnectivity: "ONLINE",
  syncNow: vi.fn(async (): Promise<void> => undefined),
  captureSurfaceProps: null as CaptureSurfaceProps | null,
  contextStatus: "ready" as "loading" | "ready" | "error",
  contextError: "No se pudo cargar Vinema",
  workspaceId: "11111111-1111-4111-8111-111111111111",
  deviceId: "22222222-2222-4222-8222-222222222222",
  createLocalSyncRepositorySet: vi.fn(() => ({
    contextRepository: {},
    nodeContextRelationRepository: {},
    nodeRepository: {},
  })),
}));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({
    authStatus: mocks.authStatus,
    syncState: {
      phase: mocks.syncPhase,
      connectivity: mocks.syncConnectivity,
    },
    syncNow: mocks.syncNow,
  }),
}));

vi.mock("@/features/node/hooks/use-vinema-context", () => ({
  useVinemaContext: () => {
    if (mocks.contextStatus === "loading") {
      return { status: "loading" };
    }

    if (mocks.contextStatus === "error") {
      return { status: "error", error: mocks.contextError };
    }

    return {
      status: "ready",
      device: {
        id: mocks.deviceId,
        name: "Web",
        platform: "web",
        createdAt: "2026-01-01T00:00:00.000Z",
        lastSeenAt: "2026-01-01T00:00:00.000Z",
      },
      workspace: {
        id: mocks.workspaceId,
        name: "Personal",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      error: null,
    };
  },
}));

vi.mock("@/infrastructure/repositories", () => ({
  createLocalSyncRepositorySet: mocks.createLocalSyncRepositorySet,
  storageAdapter: {},
}));

vi.mock("@/features/capture/capture-surface", () => ({
  CaptureSurface: (props: CaptureSurfaceProps) => {
    mocks.captureSurfaceProps = props;
    return createElement("div", { "data-testid": "capture-surface" });
  },
}));

describe("CaptureHomeClient sync composition", () => {
  let root: Root | null = null;

  beforeEach(() => {
    mocks.authStatus = "AUTHENTICATED_ONLINE";
    mocks.syncPhase = "IDLE";
    mocks.syncConnectivity = "ONLINE";
    mocks.contextStatus = "ready";
    mocks.contextError = "No se pudo cargar Vinema";
    mocks.workspaceId = "11111111-1111-4111-8111-111111111111";
    mocks.deviceId = "22222222-2222-4222-8222-222222222222";
    mocks.syncNow.mockClear();
    mocks.createLocalSyncRepositorySet.mockClear();
    mocks.captureSurfaceProps = null;
    document.body.replaceChildren();
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
      await flushPromises();
    });
    root = null;
    document.body.replaceChildren();
  });

  it("requests immediate sync after a committed local capture while online", async () => {
    await renderCaptureHome();

    await act(async () => {
      await mocks.captureSurfaceProps?.onCaptureCommitted?.();
      await flushPromises();
    });

    expect(mocks.syncNow).toHaveBeenCalledTimes(1);
  });

  it("does not force remote sync after a committed local capture while offline", async () => {
    mocks.authStatus = "AUTHENTICATED_OFFLINE";
    await renderCaptureHome();

    await act(async () => {
      await mocks.captureSurfaceProps?.onCaptureCommitted?.();
      await flushPromises();
    });

    expect(mocks.syncNow).not.toHaveBeenCalled();
  });

  it("keeps local captures local when using Vinema without an account", async () => {
    mocks.authStatus = "AUTHENTICATED_LOCAL";
    await renderCaptureHome();

    await act(async () => {
      await mocks.captureSurfaceProps?.onCaptureCommitted?.();
      await flushPromises();
    });

    expect(mocks.syncNow).not.toHaveBeenCalled();
  });

  it("renders a neutral startup state while the local context loads", async () => {
    vi.useFakeTimers();
    mocks.contextStatus = "loading";

    const container = await renderCaptureHome();

    expect(container.querySelector("[data-vinema-initial-loading]")).toBeNull();

    await advanceTimers(180);

    const startup = container.querySelector("[data-vinema-initial-loading]");

    expect(container.textContent).not.toContain("Cargando Memoria");
    expect(container.querySelector(".rounded-lg")).toBeNull();
    expect(container.querySelector(".border-zinc-200")).toBeNull();
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
    expect(startup?.getAttribute("data-vinema-initial-loading-stage")).toBe("local");
    expect(
      startup?.querySelector("[data-vinema-initial-loading-message]")?.textContent,
    ).toBe("Abriendo tu memoria");
    expect(startup?.querySelector("[data-vinema-brand='monogram']")).toBeDefined();
    expect(startup?.querySelector(".vinema-initial-loading-logo")).toBeDefined();
    expect(
      (
        startup?.querySelector(
          "[data-vinema-initial-loading-progress]",
        ) as HTMLElement | null
      )?.style.width,
    ).toBe("55%");
    expect(startup?.textContent).not.toContain("%");
    expect(mocks.createLocalSyncRepositorySet).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("does not show startup chrome when local context resolves quickly", async () => {
    vi.useFakeTimers();
    mocks.contextStatus = "loading";
    const container = await renderCaptureHome();

    mocks.contextStatus = "ready";
    await act(async () => {
      root?.render(createElement(CaptureHomeClient as () => ReactNode));
      await flushPromises();
    });
    await advanceTimers(179);

    expect(container.querySelector("[data-vinema-initial-loading]")).toBeNull();
    expect(container.querySelector("[data-testid='capture-surface']")).toBeDefined();

    vi.useRealTimers();
  });

  it("keeps the startup state briefly once visible and then exits complete", async () => {
    vi.useFakeTimers();
    mocks.contextStatus = "loading";
    const container = await renderCaptureHome();
    await advanceTimers(180);

    expect(container.querySelector("[data-vinema-initial-loading]")).toBeDefined();

    mocks.contextStatus = "ready";
    await act(async () => {
      root?.render(createElement(CaptureHomeClient as () => ReactNode));
      await flushPromises();
    });

    expect(container.querySelector("[data-testid='capture-surface']")).toBeDefined();
    expect(
      container.querySelector("[data-vinema-initial-loading-message]")?.textContent,
    ).toBe("Listo");
    expect(
      (
        container.querySelector(
          "[data-vinema-initial-loading-progress]",
        ) as HTMLElement | null
      )?.style.width,
    ).toBe("100%");

    await advanceTimers(349);
    expect(container.querySelector("[data-vinema-initial-loading]")).toBeDefined();
    await advanceTimers(1);
    expect(
      container.querySelector("[data-vinema-initial-loading]")?.className,
    ).toContain("vinema-initial-loading-exit");
    await advanceTimers(160);
    expect(container.querySelector("[data-vinema-initial-loading]")).toBeNull();

    vi.useRealTimers();
  });

  it("uses real sync and offline startup stages without regressing progress", async () => {
    vi.useFakeTimers();
    mocks.contextStatus = "ready";
    mocks.syncPhase = "PULLING";
    const container = await renderCaptureHome();
    await advanceTimers(180);
    let startup = container.querySelector("[data-vinema-initial-loading]");

    expect(startup?.getAttribute("data-vinema-initial-loading-stage")).toBe("sync");
    expect(
      startup?.querySelector("[data-vinema-initial-loading-message]")?.textContent,
    ).toBe("Sincronizando cambios");
    expect(
      (
        startup?.querySelector(
          "[data-vinema-initial-loading-progress]",
        ) as HTMLElement | null
      )?.style.width,
    ).toBe("85%");

    mocks.syncConnectivity = "OFFLINE";
    await act(async () => {
      root?.render(createElement(CaptureHomeClient as () => ReactNode));
      await flushPromises();
    });
    startup = container.querySelector("[data-vinema-initial-loading]");
    expect(startup?.getAttribute("data-vinema-initial-loading-stage")).toBe("offline");
    expect(
      startup?.querySelector("[data-vinema-initial-loading-message]")?.textContent,
    ).toBe("Trabajando desde tu memoria local");
    expect(
      (
        startup?.querySelector(
          "[data-vinema-initial-loading-progress]",
        ) as HTMLElement | null
      )?.style.width,
    ).toBe("85%");

    vi.useRealTimers();
  });

  it("does not hide a real startup error behind the loader", async () => {
    vi.useFakeTimers();
    mocks.contextStatus = "loading";
    const container = await renderCaptureHome();

    mocks.contextStatus = "error";
    mocks.contextError = "No se pudo abrir el contexto local.";
    await act(async () => {
      root?.render(createElement(CaptureHomeClient as () => ReactNode));
      await flushPromises();
    });
    await advanceTimers(180);

    expect(container.textContent).toContain("No se pudo abrir el contexto local.");
    expect(container.querySelector("[data-vinema-initial-loading]")).toBeNull();

    vi.useRealTimers();
  });

  it("keeps capture repositories stable across sync-driven rerenders", async () => {
    await renderCaptureHome();
    const firstRepositories = mocks.captureSurfaceProps?.repositories;

    await act(async () => {
      root?.render(createElement(CaptureHomeClient as () => ReactNode));
      await flushPromises();
    });

    expect(mocks.createLocalSyncRepositorySet).toHaveBeenCalledTimes(1);
    expect(mocks.captureSurfaceProps?.repositories).toBe(firstRepositories);
    expect(mocks.captureSurfaceProps?.repositories.contextRepository).toBe(
      firstRepositories?.contextRepository,
    );
    expect(mocks.captureSurfaceProps?.repositories.nodeRepository).toBe(
      firstRepositories?.nodeRepository,
    );
    expect(
      mocks.captureSurfaceProps?.repositories.nodeContextRelationRepository,
    ).toBe(firstRepositories?.nodeContextRelationRepository);
  });

  it("recreates capture repositories when the workspace changes", async () => {
    await renderCaptureHome();
    const firstRepositories = mocks.captureSurfaceProps?.repositories;

    mocks.workspaceId = "33333333-3333-4333-8333-333333333333";
    await act(async () => {
      root?.render(createElement(CaptureHomeClient as () => ReactNode));
      await flushPromises();
    });

    expect(mocks.createLocalSyncRepositorySet).toHaveBeenCalledTimes(2);
    expect(mocks.captureSurfaceProps?.repositories).not.toBe(firstRepositories);
    expect(mocks.createLocalSyncRepositorySet).toHaveBeenLastCalledWith({
      workspaceId: mocks.workspaceId,
      deviceId: mocks.deviceId,
    });
  });

  async function renderCaptureHome() {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(createElement(CaptureHomeClient as () => ReactNode));
      await flushPromises();
    });

    return container;
  }
});

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

async function advanceTimers(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await flushPromises();
  });
}
