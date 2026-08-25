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
  listCaptureConflicts: vi.fn(),
  offline: vi.fn(),
  recordMemoryVerificationResult: vi.fn(),
  reconcile: vi.fn(),
  reconcileServerAuthoritativeMemory: vi.fn(),
  syncNow: vi.fn(),
  synced: vi.fn(),
  syncing: vi.fn(),
  success: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: mocks.useAuth,
}));

vi.mock("@/features/auth/public-api-url", () => ({
  getPublicApiUrl: () => "https://api.example.test",
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
  recordMemoryVerificationResult: mocks.recordMemoryVerificationResult,
  toSafeMemorySyncSummary: vi.fn(() => "safe summary"),
  verifyCurrentMemoryConvergence: vi.fn(),
}));

vi.mock("@/features/sync/reconciliation", () => ({
  createMemoryReconciliationEngine: () => ({
    reconcile: mocks.reconcile,
  }),
}));

vi.mock("@/features/sync/server-authoritative-memory-reconciliation", () => ({
  reconcileServerAuthoritativeMemory: mocks.reconcileServerAuthoritativeMemory,
}));

vi.mock("@/features/sync/conflict-resolution", () => ({
  listCaptureConflicts: mocks.listCaptureConflicts,
  resolveCaptureConflict: vi.fn(),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let mountedRoot: Root | null = null;

describe("MemorySyncStatusPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue(authValue());
    mocks.loadMemorySyncSnapshot.mockResolvedValue(snapshotFixture());
    mocks.recordMemoryVerificationResult.mockResolvedValue(null);
    mocks.listCaptureConflicts.mockResolvedValue([captureConflictFixture()]);
    mocks.reconcile.mockResolvedValue(reconciliationFixture());
    mocks.reconcileServerAuthoritativeMemory.mockResolvedValue(serverCompletenessFixture());
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
    expect(panel?.className).toContain("overflow-hidden");
    expect(panel?.getAttribute("role")).toBe("dialog");
    expect(panel?.getAttribute("aria-modal")).toBe("true");
    expect(panel?.querySelector("[data-memory-sync-panel-body]")?.className).toContain(
      "overflow-y-auto",
    );
    expect(dot?.getAttribute("title")).toBe("memoria integra");
    expect(dot?.getAttribute("aria-label")).toBe(
      "Estado de la memoria: memoria integra",
    );
    expect(dot?.className).toContain("bg-emerald-500");
  });

  it("updates the memory status indicator from sync state without opening the panel", async () => {
    const screen = await renderPanel();

    expect(screen.querySelector("[data-memory-sync-panel]")).toBeNull();
    expect(
      screen.querySelector("[data-memory-sync-status-dot]")?.className,
    ).toContain("bg-emerald-500");

    mocks.useAuth.mockReturnValue(authValue({
      syncState: {
        ...initialSyncState,
        connectivity: "ONLINE",
        conflictCount: 1,
      },
    }));
    await act(async () => {
      mountedRoot?.render(createElement(MemorySyncStatusPanel));
      await flushPromises();
    });

    expect(screen.querySelector("[data-memory-sync-panel]")).toBeNull();
    expect(
      screen.querySelector("[data-memory-sync-status-dot]")?.className,
    ).toContain("bg-red-500");
  });

  it("keeps the panel open on mouse movement, trigger reclicks, and clicks inside", async () => {
    const screen = await renderPanel();
    const trigger = screen.querySelector("button[aria-label='Abrir Estado de la memoria']");

    await click(trigger);
    const panel = screen.querySelector("[data-memory-sync-panel]");
    expect(panel).toBeTruthy();

    await mouseLeave(trigger);
    expect(screen.querySelector("[data-memory-sync-panel]")).toBeTruthy();

    await click(trigger);
    expect(screen.querySelector("[data-memory-sync-panel]")).toBeTruthy();

    await pointerDown(panel);
    expect(screen.querySelector("[data-memory-sync-panel]")).toBeTruthy();

    await click(getButton(screen, "Verificar memoria"));
    expect(screen.querySelector("[data-memory-sync-panel]")).toBeTruthy();
  });

  it("closes with Escape or outside click", async () => {
    const screen = await renderPanel();
    const trigger = screen.querySelector<HTMLButtonElement>(
      "button[aria-label='Abrir Estado de la memoria']",
    );

    await click(trigger);
    expect(document.activeElement).toBe(screen.querySelector("[data-memory-sync-panel]"));

    await keyDownWindow({ key: "Escape" });
    expect(screen.querySelector("[data-memory-sync-panel]")).toBeNull();
    expect(document.activeElement).toBe(trigger);

    await click(trigger);
    await pointerDown(document.body);
    expect(screen.querySelector("[data-memory-sync-panel]")).toBeNull();
  });

  it("keeps focus inside the dialog while tabbing", async () => {
    const screen = await renderPanel();

    await click(screen.querySelector("button[aria-label='Abrir Estado de la memoria']"));
    const verifyButton = getButton(screen, "Verificar memoria");

    verifyButton.focus();
    await keyDownWindow({ key: "Tab" });
    expect(document.activeElement).toBe(verifyButton);

    await keyDownWindow({ key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(verifyButton);
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

  it("presents local-only mode without remote verification", async () => {
    mocks.useAuth.mockReturnValue(authValue({
      syncState: {
        ...initialSyncState,
        authentication: "AUTHENTICATED_LOCAL",
        pendingMutations: 1,
      },
    }));
    const screen = await renderPanel();

    await click(screen.querySelector("button[aria-label='Abrir Estado de la memoria']"));
    const verifyButton = getButton(screen, "Verificar memoria");
    await click(verifyButton);

    expect(screen.textContent).toContain("Local · Sin sincronización");
    expect(screen.textContent).toContain("Tus datos permanecen en este dispositivo.");
    expect(verifyButton.disabled).toBe(true);
    expect(mocks.syncNow).not.toHaveBeenCalled();
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
    expect(mocks.reconcileServerAuthoritativeMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        deviceId: "device-1",
      }),
    );
    expect(mocks.dismissKind).toHaveBeenCalledWith("error");
    expect(mocks.error).not.toHaveBeenCalledWith("Hay capturas que requieren atencion.");
    expect(screen.querySelector("[data-memory-sync-panel]")?.textContent).toContain(
      "Memoria integra",
    );
    expect(screen.querySelector("[data-memory-sync-panel]")).toBeTruthy();
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

  it("persists successful memory verification and restores it after close, reopen, and remount", async () => {
    const verifiedAt = new Date("2026-08-03T12:01:00.000Z");
    let persistedSnapshot = snapshotFixture({
      status: "ERROR",
      lastVerificationAt: null,
      lastVerificationStatus: null,
      lastVerificationError: null,
    });
    mocks.useAuth.mockReturnValue(authValue({
      syncState: {
        ...initialSyncState,
        lastError: {
          source: "PULL",
          code: "MISSING_RELATION_DEPENDENCY",
          message: "La relacion remota requiere captura y concepto locales.",
          occurredAt: "2026-08-03T12:00:00.000Z",
        },
      },
    }));
    mocks.loadMemorySyncSnapshot.mockImplementation(async () => persistedSnapshot);
    mocks.recordMemoryVerificationResult.mockImplementation(async () => {
      persistedSnapshot = snapshotFixture({
        status: "SYNCED",
        lastVerificationAt: verifiedAt,
        lastVerificationStatus: "PASSED",
        lastVerificationError: null,
      });
      return null;
    });
    const screen = await renderPanel();

    await click(screen.querySelector("button[aria-label='Abrir Estado de la memoria']"));
    expect(screen.textContent).toContain("La memoria requiere atencion");
    expect(screen.textContent).toContain("Ultima verificacion sin registro");

    await click(getButton(screen, "Verificar memoria"));

    expect(mocks.recordMemoryVerificationResult).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      deviceId: "device-1",
      status: "PASSED",
    });
    expect(screen.textContent).toContain("Memoria integra");
    expect(screen.textContent).not.toContain("La memoria requiere atencion");
    expect(screen.textContent).not.toContain("Ultima verificacion sin registro");

    await pointerDown(document.body);
    await click(screen.querySelector("button[aria-label='Abrir Estado de la memoria']"));
    expect(screen.textContent).toContain("Memoria integra");
    expect(screen.textContent).not.toContain("Ultima verificacion sin registro");

    await act(async () => {
      mountedRoot?.unmount();
      mountedRoot = null;
      await flushPromises();
    });
    const reloaded = await renderPanel();
    await click(reloaded.querySelector("button[aria-label='Abrir Estado de la memoria']"));
    expect(reloaded.textContent).toContain("Memoria integra");
    expect(reloaded.textContent).not.toContain("Ultima verificacion sin registro");
  });

  it("keeps a persisted successful verification when stale sync events refresh the snapshot", async () => {
    const verifiedAt = new Date("2026-08-03T12:01:00.000Z");
    mocks.useAuth.mockReturnValue(authValue({
      syncState: {
        ...initialSyncState,
        lastError: {
          source: "PULL",
          code: "STALE_ERROR",
          message: "Error anterior a la verificacion.",
          occurredAt: "2026-08-03T12:00:00.000Z",
        },
      },
    }));
    mocks.loadMemorySyncSnapshot.mockResolvedValue(snapshotFixture({
      status: "SYNCED",
      lastVerificationAt: verifiedAt,
      lastVerificationStatus: "PASSED",
      lastVerificationError: null,
    }));
    const screen = await renderPanel();

    await click(screen.querySelector("button[aria-label='Abrir Estado de la memoria']"));
    expect(screen.textContent).toContain("Memoria integra");

    await act(async () => {
      const { syncEventBuffer } = await import(
        "@/features/sync/observability/sync-event-buffer"
      );
      syncEventBuffer.append({
        type: "PULL_SUCCEEDED",
        workspaceId: "workspace-1",
        deviceId: "device-1",
        count: 1,
      });
      await flushPromises();
    });

    expect(screen.textContent).toContain("Memoria integra");
    expect(screen.textContent).not.toContain("La memoria requiere atencion");
  });

  it("persists failed verification causes and does not present memory as integral", async () => {
    let persistedSnapshot = snapshotFixture({
      status: "SYNCED",
      lastVerificationStatus: "PASSED",
    });
    mocks.reconcile.mockResolvedValue(reconciliationFixture({
      status: "DIVERGENCE_DETECTED",
    }));
    mocks.loadMemorySyncSnapshot.mockImplementation(async () => persistedSnapshot);
    mocks.recordMemoryVerificationResult.mockImplementation(async () => {
      persistedSnapshot = snapshotFixture({
        status: "ERROR",
        lastVerificationAt: new Date("2026-08-03T12:01:00.000Z"),
        lastVerificationStatus: "FAILED",
        lastVerificationError: "La verificacion detecto divergencia de memoria.",
      });
      return null;
    });
    const screen = await renderPanel();

    await click(screen.querySelector("button[aria-label='Abrir Estado de la memoria']"));
    await click(getButton(screen, "Verificar memoria"));

    expect(mocks.recordMemoryVerificationResult).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      deviceId: "device-1",
      status: "FAILED",
      errorMessage: "La verificacion detecto divergencia de memoria.",
    });
    expect(screen.textContent).toContain("La memoria requiere atencion");
    expect(screen.textContent).toContain(
      "La verificacion detecto divergencia de memoria.",
    );
    expect(screen.textContent).not.toContain("Memoria integra");
  });

  it("does not persist integral memory when the server inventory remains incomplete", async () => {
    let persistedSnapshot = snapshotFixture({
      status: "SYNCED",
      lastVerificationStatus: "PASSED",
    });
    mocks.reconcileServerAuthoritativeMemory.mockResolvedValue(serverCompletenessFixture({
      status: "INCOMPLETE",
      remoteCursor: "1057",
      localCursor: "1057",
      remoteCounts: inventoryCounts({ captures: { active: 11, total: 11 } }),
      localCounts: inventoryCounts({ captures: { active: 4, total: 4 } }),
      missing: inventoryCounts({ captures: { active: 7, total: 7 } }),
      errors: [
        {
          code: "INVENTORY_REPAIR_INCOMPLETE",
          message: "No fue posible completar la memoria local frente al inventario remoto.",
        },
      ],
    }));
    mocks.loadMemorySyncSnapshot.mockImplementation(async () => persistedSnapshot);
    mocks.recordMemoryVerificationResult.mockImplementation(async (input) => {
      if (input.status === "FAILED") {
        persistedSnapshot = snapshotFixture({
          status: "ERROR",
          lastVerificationAt: new Date("2026-08-03T12:01:00.000Z"),
          lastVerificationStatus: "FAILED",
          lastVerificationError: input.errorMessage,
        });
      }
      return null;
    });
    const screen = await renderPanel();

    await click(screen.querySelector("button[aria-label='Abrir Estado de la memoria']"));
    await click(getButton(screen, "Verificar memoria"));

    expect(mocks.recordMemoryVerificationResult).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "FAILED",
        errorMessage: expect.stringContaining("Local 4/4 capturas"),
      }),
    );
    expect(mocks.recordMemoryVerificationResult).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "PASSED" }),
    );
    expect(screen.textContent).toContain("La memoria requiere atencion");
    expect(screen.textContent).toContain("remoto 1057");
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

  it("opens the resolver and diagnostic details without unmounting the status panel", async () => {
    mocks.loadMemorySyncSnapshot.mockResolvedValue(snapshotFixture({
      status: "DIVERGED",
      conflictMutations: 1,
      conflictEntityCounts: {
        captures: 1,
        concepts: 0,
        captureConcepts: 0,
      },
    }));
    const screen = await renderPanel();

    await click(screen.querySelector("button[aria-label='Abrir Estado de la memoria']"));
    await click(getButton(screen, "Resolver"));

    expect(mocks.listCaptureConflicts).toHaveBeenCalledTimes(1);
    expect(screen.querySelector("[data-memory-sync-panel]")).toBeTruthy();
    expect(screen.textContent).toContain("Una captura requiere atencion");

    await click(screen.querySelector("summary"));
    expect(screen.querySelector("[data-memory-sync-panel]")).toBeTruthy();
    expect(screen.querySelector("details")?.hasAttribute("open")).toBe(true);
  });

  it("shows a useful local-only resolver state when the remote snapshot is missing", async () => {
    mocks.loadMemorySyncSnapshot.mockResolvedValue(snapshotFixture({
      status: "DIVERGED",
      conflictMutations: 1,
      conflictEntityCounts: {
        captures: 1,
        concepts: 0,
        captureConcepts: 0,
      },
    }));
    mocks.listCaptureConflicts.mockResolvedValue([
      captureConflictFixture({
        localContent: "Version local disponible",
        remoteContent: null,
        remoteVersion: 26,
      }),
    ]);
    const screen = await renderPanel();

    await click(screen.querySelector("button[aria-label='Abrir Estado de la memoria']"));
    await click(getButton(screen, "Resolver"));

    expect(screen.textContent).toContain("Versión de este dispositivo");
    expect(screen.textContent).toContain("Version local disponible");
    expect(screen.textContent).toContain("No fue posible cargar la versión sincronizada.");
    expect(screen.textContent).toContain("Reintentar cargar");
    expect(screen.textContent).toContain("Cancelar");
    expect(screen.textContent).not.toContain("Conservar versión sincronizada");
    expect(screen.textContent).not.toContain("Fusionar manualmente");
  });

  it("shows the missing synced capture message for a 404 remote load", async () => {
    mocks.loadMemorySyncSnapshot.mockResolvedValue(snapshotFixture({
      status: "DIVERGED",
      conflictMutations: 1,
      conflictEntityCounts: {
        captures: 1,
        concepts: 0,
        captureConcepts: 0,
      },
    }));
    mocks.listCaptureConflicts.mockResolvedValue([
      captureConflictFixture({
        localContent: "Version local disponible",
        remoteContent: null,
        remoteVersion: 26,
        remoteLoadStatus: "ENTITY_NOT_FOUND",
      }),
    ]);
    const screen = await renderPanel();

    await click(screen.querySelector("button[aria-label='Abrir Estado de la memoria']"));
    await click(getButton(screen, "Resolver"));

    expect(screen.textContent).toContain("La captura sincronizada ya no existe.");
  });

  it("shows the authorization message for 401 or 403 remote loads", async () => {
    mocks.loadMemorySyncSnapshot.mockResolvedValue(snapshotFixture({
      status: "DIVERGED",
      conflictMutations: 1,
      conflictEntityCounts: {
        captures: 1,
        concepts: 0,
        captureConcepts: 0,
      },
    }));
    mocks.listCaptureConflicts.mockResolvedValue([
      captureConflictFixture({
        localContent: "Version local disponible",
        remoteContent: null,
        remoteVersion: 26,
        remoteLoadStatus: "AUTH_ERROR",
      }),
    ]);
    const screen = await renderPanel();

    await click(screen.querySelector("button[aria-label='Abrir Estado de la memoria']"));
    await click(getButton(screen, "Resolver"));

    expect(screen.textContent).toContain("No fue posible autorizar la consulta.");
  });

  it("shows the offline message for network remote loads", async () => {
    mocks.loadMemorySyncSnapshot.mockResolvedValue(snapshotFixture({
      status: "DIVERGED",
      conflictMutations: 1,
      conflictEntityCounts: {
        captures: 1,
        concepts: 0,
        captureConcepts: 0,
      },
    }));
    mocks.listCaptureConflicts.mockResolvedValue([
      captureConflictFixture({
        localContent: "Version local disponible",
        remoteContent: null,
        remoteVersion: 26,
        remoteLoadStatus: "NETWORK_ERROR",
      }),
    ]);
    const screen = await renderPanel();

    await click(screen.querySelector("button[aria-label='Abrir Estado de la memoria']"));
    await click(getButton(screen, "Resolver"));

    expect(screen.textContent).toContain(
      "Sin conexión. Reintenta cuando vuelvas a estar en línea.",
    );
  });

  it("retries conflict loading by consulting the conflict loader again", async () => {
    mocks.loadMemorySyncSnapshot.mockResolvedValue(snapshotFixture({
      status: "DIVERGED",
      conflictMutations: 1,
      conflictEntityCounts: {
        captures: 1,
        concepts: 0,
        captureConcepts: 0,
      },
    }));
    mocks.listCaptureConflicts
      .mockResolvedValueOnce([
        captureConflictFixture({
          localContent: "Version local disponible",
          remoteContent: null,
          remoteVersion: 26,
        }),
      ])
      .mockResolvedValueOnce([
        captureConflictFixture({
          localContent: "Version local disponible",
          remoteContent: "Version remota actual",
          remoteVersion: 31,
          remoteLoadStatus: "LOADED",
        }),
      ]);
    const screen = await renderPanel();

    await click(screen.querySelector("button[aria-label='Abrir Estado de la memoria']"));
    await click(getButton(screen, "Resolver"));
    await click(getButton(screen, "Reintentar cargar"));

    expect(mocks.listCaptureConflicts).toHaveBeenCalledTimes(2);
    expect(screen.textContent).toContain("Version remota actual");
    expect(screen.textContent).toContain("Conservar versión sincronizada");
  });

  it("shows a useful remote-only resolver state when the local snapshot is missing", async () => {
    mocks.loadMemorySyncSnapshot.mockResolvedValue(snapshotFixture({
      status: "DIVERGED",
      conflictMutations: 1,
      conflictEntityCounts: {
        captures: 1,
        concepts: 0,
        captureConcepts: 0,
      },
    }));
    mocks.listCaptureConflicts.mockResolvedValue([
      captureConflictFixture({
        localContent: null,
        remoteContent: "Version remota disponible",
        remoteVersion: 26,
      }),
    ]);
    const screen = await renderPanel();

    await click(screen.querySelector("button[aria-label='Abrir Estado de la memoria']"));
    await click(getButton(screen, "Resolver"));

    expect(screen.textContent).toContain("Versión sincronizada");
    expect(screen.textContent).toContain("Version remota disponible");
    expect(screen.textContent).toContain("No fue posible cargar la versión local.");
    expect(screen.textContent).toContain("Reintentar cargar");
    expect(screen.textContent).toContain("Cancelar");
    expect(screen.textContent).not.toContain("Conservar esta versión");
    expect(screen.textContent).not.toContain("Fusionar manualmente");
  });

  it("shows an empty resolver fallback when neither snapshot is available", async () => {
    mocks.loadMemorySyncSnapshot.mockResolvedValue(snapshotFixture({
      status: "DIVERGED",
      conflictMutations: 1,
      conflictEntityCounts: {
        captures: 1,
        concepts: 0,
        captureConcepts: 0,
      },
    }));
    mocks.listCaptureConflicts.mockResolvedValue([
      captureConflictFixture({
        localContent: null,
        remoteContent: null,
        remoteVersion: null,
      }),
    ]);
    const screen = await renderPanel();

    await click(screen.querySelector("button[aria-label='Abrir Estado de la memoria']"));
    await click(getButton(screen, "Resolver"));

    expect(screen.textContent).toContain(
      "No fue posible cargar las versiones de esta captura.",
    );
    expect(screen.textContent).toContain("Reintentar");
    expect(screen.textContent).toContain("Cancelar");
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
    lastVerificationAt: new Date("2026-08-03T12:00:00.000Z"),
    lastVerificationStatus: "PASSED",
    lastVerificationError: null,
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

function reconciliationFixture(overrides: Record<string, unknown> = {}) {
  return {
    ...reconciliationFixtureBase(),
    ...overrides,
  };
}

function reconciliationFixtureBase() {
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

function serverCompletenessFixture(overrides: Record<string, unknown> = {}) {
  return {
    status: "COMPLETE",
    remoteCursor: "42",
    localCursor: "42",
    localCounts: inventoryCounts(),
    remoteCounts: inventoryCounts(),
    missing: inventoryCounts(),
    outdated: inventoryCounts(),
    extraLocal: inventoryCounts(),
    recovered: inventoryCounts(),
    blockedByLocalMutations: 0,
    conflicts: 0,
    errors: [],
    ...overrides,
  };
}

function inventoryCounts(
  overrides: {
    captures?: Partial<{ active: number; archived: number; total: number }>;
    concepts?: Partial<{ active: number; archived: number; total: number }>;
    captureConcepts?: Partial<{ active: number; archived: number; total: number }>;
  } = {},
) {
  return {
    captures: { active: 0, archived: 0, total: 0, ...overrides.captures },
    concepts: { active: 0, archived: 0, total: 0, ...overrides.concepts },
    captureConcepts: {
      active: 0,
      archived: 0,
      total: 0,
      ...overrides.captureConcepts,
    },
  };
}

type TestCaptureConflict = {
  workspaceId: string;
  entityId: string;
  localContent: string | null;
  remoteContent: string | null;
  localVersion: number | null;
  remoteVersion: number | null;
  remoteLoadStatus: "LOADED" | "MISSING" | "ENTITY_NOT_FOUND" | "AUTH_ERROR" | "NETWORK_ERROR" | "ERROR";
  mutationIds: string[];
  occurrenceCount: number;
};

function captureConflictFixture(
  overrides: Partial<TestCaptureConflict> = {},
): TestCaptureConflict {
  return {
    ...captureConflictFixtureBase(),
    ...overrides,
  };
}

function captureConflictFixtureBase(): TestCaptureConflict {
  return {
    workspaceId: "workspace-1",
    entityId: "capture-1",
    localContent: "Version local",
    remoteContent: "Version sincronizada",
    localVersion: 2,
    remoteVersion: 1,
    remoteLoadStatus: "LOADED",
    mutationIds: ["mutation-1"],
    occurrenceCount: 1,
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

async function pointerDown(target: Element | null) {
  if (!(target instanceof Element)) {
    throw new Error("Expected pointer target.");
  }

  await act(async () => {
    target.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await flushPromises();
  });
}

async function mouseLeave(target: Element | null) {
  if (!(target instanceof Element)) {
    throw new Error("Expected mouse target.");
  }

  await act(async () => {
    target.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    await flushPromises();
  });
}

async function keyDownWindow({
  key,
  shiftKey = false,
}: {
  key: string;
  shiftKey?: boolean;
}) {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", {
      key,
      shiftKey,
      bubbles: true,
    }));
    await flushPromises();
  });
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}
