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
  syncNow: vi.fn(async (): Promise<void> => undefined),
  captureSurfaceProps: null as CaptureSurfaceProps | null,
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
    syncNow: mocks.syncNow,
  }),
}));

vi.mock("@/features/node/hooks/use-vinema-context", () => ({
  useVinemaContext: () => ({
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
  }),
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
  }
});

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}
