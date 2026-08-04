import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemorySyncStatusPanel } from "@/features/sync/observability/memory-sync-status-panel";
import type { MemorySyncHealth } from "@/features/sync/observability/memory-sync-health";
import { initialSyncState } from "@/features/sync/sync-state-engine";

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  dismissKind: vi.fn(),
  loadMemorySyncSnapshot: vi.fn(),
  offline: vi.fn(),
  reconcile: vi.fn(),
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
  VisualFeedbackWordmark: () =>
    createElement("span", { "data-vinema-brand": "monogram" }),
  useVisualFeedback: () => ({
    error: mocks.error,
    dismissKind: mocks.dismissKind,
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

vi.mock("@/features/sync/reconciliation", () => ({
  createMemoryReconciliationEngine: () => ({
    reconcile: mocks.reconcile,
  }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let mountedRoot: Root | null = null;

describe("MemorySyncStatusPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue(authValue());
    mocks.loadMemorySyncSnapshot.mockResolvedValue(snapshotFixture());
    mocks.reconcile.mockResolvedValue(reconciliationFixture());
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
    const homeLink = screen.querySelector("a[aria-label='Vinema']");
    expect(homeLink?.getAttribute("href")).toBe("/");
    expect(screen.querySelector("[data-vinema-brand='monogram']")).toBeTruthy();
    expect(panel?.textContent).toContain("Estado de la memoria");
    expect(panel?.textContent).toContain("Memoria integra");
    expect(panel?.textContent).toContain("Verificar memoria");
    expect(panel?.textContent).not.toContain("Cursor local");
    expect(panel?.textContent).not.toContain("Firma local");
    expect(panel?.textContent).not.toContain("Workspace");
    expect(panel?.textContent).not.toContain("RECONCILIATION_COMPLETED");
    expect(panel?.querySelector("details")).toBeNull();
    expect(panel?.className).toContain("fixed");
    expect(panel?.className).toContain("md:absolute");
    expect(dot?.getAttribute("title")).toBe("memoria integra");
    expect(dot?.getAttribute("aria-label")).toBe(
      "Estado de la memoria: memoria integra",
    );
    expect(dot?.className).toContain("bg-emerald-500");
  });

  it("does not call syncNow while offline", async () => {
    mocks.useAuth.mockReturnValue(authValue({
      syncState: { ...initialSyncState, connectivity: "OFFLINE" },
    }));
    mocks.loadMemorySyncSnapshot.mockResolvedValue(snapshotFixture({
      status: "OFFLINE",
      convergence: "UNKNOWN",
    }));
    const screen = await renderPanel();

    await click(screen.querySelector("button[aria-label='Abrir Estado de la memoria']"));
    await click(getButton(screen, "Verificar memoria"));

    expect(mocks.syncNow).not.toHaveBeenCalled();
    expect(mocks.offline).not.toHaveBeenCalled();
    expect(screen.textContent).toContain("Sin conexion");
    expect(getButton(screen, "Verificar memoria").disabled).toBe(true);
    expect(
      screen.querySelector("[data-memory-sync-status-dot]")?.className,
    ).toContain("bg-zinc-400");
    expect(screen.textContent).toContain("Los cambios se guardaran");
  });

  it("refreshes the visible health from the post-reconciliation snapshot", async () => {
    mocks.useAuth.mockReturnValue(authValue({
      syncState: {
        ...initialSyncState,
        conflictCount: 49,
        lastSuccessfulSyncAt: "2026-08-03T12:00:00.000Z",
      },
    }));
    mocks.loadMemorySyncSnapshot
      .mockResolvedValueOnce(snapshotFixture({
        status: "DIVERGED",
        conflictMutations: 2,
        conflictEntityCounts: {
          captures: 2,
          concepts: 0,
          captureConcepts: 0,
        },
      }))
      .mockResolvedValueOnce(snapshotFixture({
        status: "SYNCED",
        conflictMutations: 0,
      }));
    const screen = await renderPanel();

    await click(screen.querySelector("button[aria-label='Abrir Estado de la memoria']"));
    expect(screen.querySelector("[data-memory-sync-panel]")?.textContent).toContain(
      "2 capturas requieren atencion",
    );
    expect(screen.querySelector("[data-memory-sync-status-dot]")?.getAttribute("title")).toBe(
      "2 capturas requieren atencion",
    );
    expect(screen.querySelector("[data-memory-sync-status-dot]")?.getAttribute("aria-label")).toBe(
      "Estado de la memoria: 2 capturas requieren atencion",
    );
    expect(
      screen.querySelector("[data-memory-sync-status-dot]")?.className,
    ).toContain("bg-red-500");

    await click(getButton(screen, "Verificar memoria"));

    expect(mocks.reconcile).toHaveBeenCalledTimes(1);
    expect(mocks.dismissKind).toHaveBeenCalledWith("error");
    expect(mocks.error).not.toHaveBeenCalledWith("Hay capturas que requieren atencion.");
    expect(screen.querySelector("[data-memory-sync-panel]")?.textContent).toContain(
      "Memoria integra",
    );
    expect(screen.querySelector("[data-memory-sync-panel]")?.textContent).not.toContain(
      "requieren atencion",
    );
    expect(screen.querySelector("[data-memory-sync-panel]")?.textContent).not.toContain(
      "Verificando convergencia",
    );
    expect(getButton(screen, "Verificar memoria").disabled).toBe(false);
    expect(
      screen.querySelector("[data-memory-sync-status-dot]")?.className,
    ).toContain("bg-emerald-500");
    expect(screen.querySelector("[data-memory-sync-status-dot]")?.getAttribute("title")).toBe(
      "memoria integra",
    );
  });

  it("shows a conflict diagnostic export action only when real conflicts exist", async () => {
    mocks.loadMemorySyncSnapshot.mockResolvedValue(snapshotFixture({
      status: "DIVERGED",
      conflictMutations: 2,
      conflictEntityCounts: {
        captures: 2,
        concepts: 0,
        captureConcepts: 0,
      },
    }));
    const screen = await renderPanel();

    await click(screen.querySelector("button[aria-label='Abrir Estado de la memoria']"));

    expect(screen.querySelector("[data-memory-sync-panel]")?.textContent).toContain(
      "2 capturas requieren atencion",
    );
    expect(screen.querySelector("[data-memory-sync-panel]")?.textContent).toContain(
      "Resolver",
    );
    expect(screen.querySelector("[data-memory-sync-panel]")?.textContent).toContain(
      "Exportar diagnostico",
    );
  });

  it("keeps verification loading only while reconciliation is active", async () => {
    let resolveReconcile: ((value: unknown) => void) | null = null;
    mocks.reconcile.mockReturnValue(new Promise((resolve) => {
      resolveReconcile = resolve;
    }));
    const screen = await renderPanel();

    await click(screen.querySelector("button[aria-label='Abrir Estado de la memoria']"));
    const verifyButton = getButton(screen, "Verificar memoria");

    await act(async () => {
      verifyButton.click();
      await flushPromises();
    });

    expect(verifyButton.disabled).toBe(true);
    expect(screen.textContent).toContain("Verificando memoria");

    await act(async () => {
      resolveReconcile?.(reconciliationFixture());
      await flushPromises();
      await flushPromises();
    });

    expect(getButton(screen, "Verificar memoria").disabled).toBe(false);
    expect(screen.textContent).not.toContain("Verificando memoria");
    expect(screen.textContent).not.toContain("Verificando convergencia");
  });

  it("cleans verification loading when reconciliation fails", async () => {
    mocks.reconcile.mockRejectedValue(new Error("boom"));
    const screen = await renderPanel();

    await click(screen.querySelector("button[aria-label='Abrir Estado de la memoria']"));
    await click(getButton(screen, "Verificar memoria"));

    expect(getButton(screen, "Verificar memoria").disabled).toBe(false);
    expect(screen.textContent).toContain("No fue posible verificar la memoria");
    expect(screen.textContent).not.toContain("Verificando memoria");
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

function snapshotFixture(
  overrides: Partial<MemorySyncHealth> = {},
) {
  const health = { ...baseHealthFixture(), ...overrides };

  return {
    health,
    metadata: null,
    mutations: [],
    localSignature: { generation: "42", hash: "abcdef12", items: 0 },
  };
}

function baseHealthFixture(): MemorySyncHealth {
  return {
    status: "SYNCED",
    workspaceId: "workspace-1",
    deviceId: "device-1",
    pendingMutations: 0,
    processingMutations: 0,
    failedMutations: 0,
    conflictMutations: 0,
    conflictEntityCounts: {
      captures: 0,
      concepts: 0,
      captureConcepts: 0,
    },
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
  };
}

function reconciliationFixture() {
  return {
    status: "MEMORY_INTEGRAL",
    phases: ["HEALTH_CHECK", "VERIFYING_CONVERGENCE", "MEMORY_INTEGRAL"],
    health: {
      workspaceId: "workspace-1",
      deviceId: "device-1",
      generation: "42",
      offline: false,
      pendingMutations: 0,
      processingMutations: 0,
      failedMutations: 0,
      conflictMutations: 0,
      localCursor: "42",
    },
    orphanEntities: [],
    generatedMutations: [],
    convergence: { status: "CONFIRMED", reason: "MATCHING_SIGNATURES" },
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
