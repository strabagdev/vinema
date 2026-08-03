import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemorySyncStatusPanel } from "@/features/sync/observability/memory-sync-status-panel";
import { initialSyncState } from "@/features/sync/sync-state-engine";

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  loadMemorySyncSnapshot: vi.fn(),
  offline: vi.fn(),
  syncNow: vi.fn(),
  synced: vi.fn(),
  syncing: vi.fn(),
  success: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: mocks.useAuth,
}));

vi.mock("@/features/feedback/visual-feedback-provider", () => ({
  VisualFeedbackWordmark: () => createElement("span", null, "VN"),
  useVisualFeedback: () => ({
    error: mocks.error,
    offline: mocks.offline,
    synced: mocks.synced,
    syncing: mocks.syncing,
    success: mocks.success,
  }),
}));

vi.mock("@/features/sync/observability/memory-sync-observability", () => ({
  abbreviate: (value: string | null | undefined) => value ?? "no disponible",
  diagnoseCurrentCaptureSync: vi.fn(),
  loadMemorySyncSnapshot: mocks.loadMemorySyncSnapshot,
  toSafeMemorySyncSummary: vi.fn(() => "safe summary"),
  verifyCurrentMemoryConvergence: vi.fn(),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let mountedRoot: Root | null = null;

describe("MemorySyncStatusPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue(authValue());
    mocks.loadMemorySyncSnapshot.mockResolvedValue(snapshotFixture());
  });

  afterEach(async () => {
    if (mountedRoot) {
      await act(async () => {
        mountedRoot?.unmount();
        mountedRoot = null;
        await flushPromises();
      });
    }
    document.body.replaceChildren();
  });

  it("stays closed by default and opens a responsive memory status panel", async () => {
    const screen = await renderPanel();

    expect(screen.querySelector("[data-memory-sync-panel]")).toBeNull();

    await click(screen.querySelector("button[aria-label='Abrir Estado de la memoria']"));

    const panel = screen.querySelector("[data-memory-sync-panel]");
    const dot = screen.querySelector("[data-memory-sync-status-dot]");
    expect(panel?.textContent).toContain("Estado de la memoria");
    expect(panel?.textContent).toContain("Sincronizado");
    expect(panel?.textContent).toContain("Verificar memoria");
    expect(panel?.className).toContain("fixed");
    expect(panel?.className).toContain("md:absolute");
    expect(dot?.getAttribute("title")).toBe("Estado de la memoria");
    expect(dot?.getAttribute("aria-label")).toBe(
      "Estado de la memoria: sincronizada",
    );
    expect(dot?.className).toContain("bg-emerald-500");
  });

  it("does not call syncNow while offline", async () => {
    mocks.useAuth.mockReturnValue(authValue({
      syncState: { ...initialSyncState, connectivity: "OFFLINE" },
    }));
    const screen = await renderPanel();

    await click(screen.querySelector("button[aria-label='Abrir Estado de la memoria']"));
    await click(getButton(screen, "Verificar memoria"));

    expect(mocks.syncNow).not.toHaveBeenCalled();
    expect(mocks.offline).toHaveBeenCalled();
    expect(screen.textContent).toContain("Sin conexion");
    expect(
      screen.querySelector("[data-memory-sync-status-dot]")?.className,
    ).toContain("bg-zinc-400");
  });
});

async function renderPanel() {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  mountedRoot = createRoot(container);

  await act(async () => {
    mountedRoot?.render(createElement(MemorySyncStatusPanel));
    await flushPromises();
  });

  return container;
}

function authValue(overrides: Record<string, unknown> = {}) {
  return {
    isAuthenticated: true,
    workspaceId: "workspace-1",
    deviceId: "device-1",
    syncState: { ...initialSyncState, lastSuccessfulSyncAt: "2026-08-03T12:00:00.000Z" },
    syncNow: mocks.syncNow,
    ...overrides,
  };
}

function snapshotFixture() {
  return {
    health: {
      status: "SYNCED",
      workspaceId: "workspace-1",
      deviceId: "device-1",
      pendingMutations: 0,
      processingMutations: 0,
      failedMutations: 0,
      conflictMutations: 0,
      lastSuccessfulSyncAt: new Date("2026-08-03T12:00:00.000Z"),
      lastPushAt: new Date("2026-08-03T12:00:00.000Z"),
      lastPullAt: new Date("2026-08-03T12:00:00.000Z"),
      localCursor: "42",
      remoteCursor: null,
      sentChanges: 0,
      receivedChanges: 0,
      appliedChanges: 0,
      convergence: "CONFIRMED",
      recentEvents: [],
    },
    metadata: null,
    mutations: [],
    localSignature: { generation: "42", hash: "abcdef12", items: 0 },
  };
}

function getButton(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.includes(text),
  );

  if (!button) {
    throw new Error(`Expected button ${text}.`);
  }

  return button as HTMLButtonElement;
}

async function click(target: Element | null) {
  if (!(target instanceof HTMLElement)) {
    throw new Error("Expected clickable element.");
  }

  await act(async () => {
    target.click();
    await flushPromises();
  });
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}
