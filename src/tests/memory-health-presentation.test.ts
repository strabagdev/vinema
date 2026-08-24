import { describe, expect, it } from "vitest";
import {
  deriveMemoryHealthPresentation,
} from "@/features/sync/observability/memory-health-presentation";
import type { MemorySyncHealth } from "@/features/sync/observability/memory-sync-health";
import { initialSyncState } from "@/features/sync/sync-state-engine";

describe("deriveMemoryHealthPresentation", () => {
  it("lets active conflicts dominate over an otherwise integral health state", () => {
    const presentation = deriveMemoryHealthPresentation({
      health: healthFixture({
        status: "SYNCED",
        conflictMutations: 2,
        conflictEntityCounts: {
          captures: 2,
          concepts: 0,
          captureConcepts: 0,
        },
      }),
      syncState: initialSyncState,
      verifying: false,
      localError: null,
    });

    expect(presentation).toMatchObject({
      status: "REQUIRES_ATTENTION",
      headline: "2 capturas requieren atencion",
      severity: "error",
      ariaLabel: "2 capturas requieren atencion",
      conflictCount: 2,
    });
  });

  it("uses singular copy for one capture conflict", () => {
    const presentation = deriveMemoryHealthPresentation({
      health: healthFixture({
        conflictMutations: 1,
        conflictEntityCounts: {
          captures: 1,
          concepts: 0,
          captureConcepts: 0,
        },
      }),
      syncState: initialSyncState,
      verifying: false,
      localError: null,
    });

    expect(presentation.headline).toBe("1 captura requiere atencion");
  });

  it("allows integral memory when there are no conflicts or pending changes", () => {
    const presentation = deriveMemoryHealthPresentation({
      health: healthFixture(),
      syncState: initialSyncState,
      verifying: false,
      localError: null,
    });

    expect(presentation).toMatchObject({
      status: "INTEGRAL",
      headline: "Memoria integra",
      severity: "success",
      conflictCount: 0,
      pendingCount: 0,
    });
  });

  it("presents local-only mode as a valid non-syncing state", () => {
    const presentation = deriveMemoryHealthPresentation({
      health: healthFixture({
        pendingMutations: 2,
      }),
      syncState: {
        ...initialSyncState,
        authentication: "AUTHENTICATED_LOCAL",
        pendingMutations: 2,
      },
      verifying: false,
      localError: null,
    });

    expect(presentation).toMatchObject({
      status: "LOCAL",
      headline: "Local · Sin sincronización",
      severity: "offline",
      pendingCount: 2,
    });
  });

  it("keeps offline above verification and pending states", () => {
    const presentation = deriveMemoryHealthPresentation({
      health: healthFixture({
        status: "OFFLINE",
        pendingMutations: 3,
      }),
      syncState: { ...initialSyncState, connectivity: "OFFLINE" },
      verifying: true,
      localError: null,
    });

    expect(presentation).toMatchObject({
      status: "OFFLINE",
      headline: "Sin conexion",
      severity: "offline",
      pendingCount: 3,
    });
  });

  it("uses verification only when no higher priority state is active", () => {
    const presentation = deriveMemoryHealthPresentation({
      health: healthFixture(),
      syncState: initialSyncState,
      verifying: true,
      localError: null,
    });

    expect(presentation).toMatchObject({
      status: "VERIFYING",
      headline: "Verificando memoria...",
      severity: "warning",
    });
  });

  it("shows pending when no error, conflict, offline, or verification is active", () => {
    const presentation = deriveMemoryHealthPresentation({
      health: healthFixture({
        status: "PENDING",
        pendingMutations: 2,
      }),
      syncState: initialSyncState,
      verifying: false,
      localError: null,
    });

    expect(presentation).toMatchObject({
      status: "PENDING",
      headline: "2 cambios pendientes",
      severity: "warning",
      pendingCount: 2,
    });
  });

  it("keeps real errors above active conflicts", () => {
    const presentation = deriveMemoryHealthPresentation({
      health: healthFixture({
        status: "ERROR",
        failedMutations: 1,
        conflictMutations: 2,
      }),
      syncState: initialSyncState,
      verifying: false,
      localError: null,
    });

    expect(presentation).toMatchObject({
      status: "ERROR",
      headline: "1 cambio requiere reintento",
      severity: "error",
      conflictCount: 2,
    });
  });

  it("lets a newer successful memory verification cover a stale sync error", () => {
    const presentation = deriveMemoryHealthPresentation({
      health: healthFixture({
        status: "SYNCED",
        lastVerificationAt: new Date("2026-08-03T12:01:00.000Z"),
        lastVerificationStatus: "PASSED",
      }),
      syncState: {
        ...initialSyncState,
        lastError: {
          source: "PULL",
          code: "STALE_ERROR",
          message: "Error anterior a la verificacion.",
          occurredAt: "2026-08-03T12:00:00.000Z",
        },
      },
      verifying: false,
      localError: null,
    });

    expect(presentation).toMatchObject({
      status: "INTEGRAL",
      headline: "Memoria integra",
      severity: "success",
    });
  });

  it("lets a newer sync error override a previous successful memory verification", () => {
    const presentation = deriveMemoryHealthPresentation({
      health: healthFixture({
        status: "ERROR",
        lastVerificationAt: new Date("2026-08-03T12:00:00.000Z"),
        lastVerificationStatus: "PASSED",
      }),
      syncState: {
        ...initialSyncState,
        lastError: {
          source: "PULL",
          code: "NEW_ERROR",
          message: "Error posterior a la verificacion.",
          occurredAt: "2026-08-03T12:01:00.000Z",
        },
      },
      verifying: false,
      localError: null,
    });

    expect(presentation).toMatchObject({
      status: "ERROR",
      headline: "La memoria requiere atencion",
      severity: "error",
    });
  });

  it("returns to integral after a new successful verification covers the latest sync error", () => {
    const presentation = deriveMemoryHealthPresentation({
      health: healthFixture({
        status: "SYNCED",
        lastVerificationAt: new Date("2026-08-03T12:02:00.000Z"),
        lastVerificationStatus: "PASSED",
      }),
      syncState: {
        ...initialSyncState,
        lastError: {
          source: "PULL",
          code: "RECOVERED_ERROR",
          message: "Error previo a la nueva verificacion.",
          occurredAt: "2026-08-03T12:01:00.000Z",
        },
      },
      verifying: false,
      localError: null,
    });

    expect(presentation).toMatchObject({
      status: "INTEGRAL",
      headline: "Memoria integra",
      severity: "success",
    });
  });

  it("keeps failed memory verification as requiring attention", () => {
    const presentation = deriveMemoryHealthPresentation({
      health: healthFixture({
        status: "ERROR",
        lastVerificationAt: new Date("2026-08-03T12:01:00.000Z"),
        lastVerificationStatus: "FAILED",
        lastVerificationError: "La verificacion detecto divergencia de memoria.",
      }),
      syncState: initialSyncState,
      verifying: false,
      localError: null,
    });

    expect(presentation).toMatchObject({
      status: "ERROR",
      headline: "La memoria requiere atencion",
      severity: "error",
    });
  });
});

function healthFixture(overrides: Partial<MemorySyncHealth> = {}): MemorySyncHealth {
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
    ...overrides,
  };
}
