import { describe, expect, it, vi } from "vitest";
import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import {
  createMemorySignature,
  verifyMemoryConvergence,
} from "@/features/sync/observability/convergence-checker";
import { diagnoseCaptureSync } from "@/features/sync/observability/entity-sync-diagnostic";
import { deriveMemorySyncHealth } from "@/features/sync/observability/memory-sync-health";
import {
  appendMemorySyncEvent,
  syncEventBuffer,
} from "@/features/sync/observability/sync-event-buffer";
import {
  MemoryReconciliationEngine,
  findOrphanEntities,
  type MemoryReconciliationDependencies,
} from "@/features/sync/reconciliation";
import { initialSyncState, type SyncState } from "@/features/sync/sync-state-engine";
import type {
  SyncMetadataRecord,
  SyncMutationOutboxRecord,
} from "@/features/sync/sync-outbox-repository";
import type { SyncEntityAcknowledgementRecord } from "@/features/sync/sync-entity-acknowledgement-repository";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const deviceId = "22222222-2222-4222-8222-222222222222";
const nodeId = "33333333-3333-4333-8333-333333333333";
const now = "2026-08-03T12:00:00.000Z";

describe("memory sync observability", () => {
  it("derives synced, syncing, offline, pending, failed and unknown health states", () => {
    expect(
      deriveMemorySyncHealth({
        syncState: { ...initialSyncState, lastSuccessfulSyncAt: now },
        metadata: metadata(),
        mutations: [],
        recentEvents: [],
        workspaceId,
        deviceId,
      }).status,
    ).toBe("SYNCED");
    expect(health({ phase: "PUSHING" }).status).toBe("SYNCING");
    expect(health({ connectivity: "OFFLINE" }).status).toBe("OFFLINE");
    expect(health({}, [outboxRecord("PENDING")]).status).toBe("PENDING");
    expect(health({}, [outboxRecord("FAILED")]).status).toBe("ERROR");
    expect(health({}, [outboxRecord("CONFLICT")]).status).toBe("DIVERGED");
    expect(health({}, [], null, null).status).toBe("UNKNOWN");
  });

  it("tracks last push, pull, cursor and recent change counters", () => {
    const result = deriveMemorySyncHealth({
      syncState: { ...initialSyncState, lastSuccessfulSyncAt: now },
      metadata: metadata(),
      mutations: [outboxRecord("PENDING"), outboxRecord("PROCESSING")],
      recentEvents: [
        event("PUSH_SUCCEEDED", 2),
        event("PULL_SUCCEEDED", 3),
        event("CHANGE_APPLIED", 1),
      ],
      workspaceId,
      deviceId,
    });

    expect(result.pendingMutations).toBe(1);
    expect(result.processingMutations).toBe(1);
    expect(result.lastPushAt?.toISOString()).toBe(now);
    expect(result.lastPullAt?.toISOString()).toBe(now);
    expect(result.localCursor).toBe("42");
    expect(result.remoteCursor).toBeNull();
    expect(result.sentChanges).toBe(2);
    expect(result.receivedChanges).toBe(3);
    expect(result.appliedChanges).toBe(1);
  });

  it("keeps a bounded event buffer and does not store content payloads", () => {
    syncEventBuffer.clear();

    for (let index = 0; index < 120; index += 1) {
      appendMemorySyncEvent({
        type: "OUTBOX_ENQUEUED",
        workspaceId,
        deviceId,
        entityType: "capture",
        entityId: nodeId,
        mutationId: `mutation-${index}`,
        status: "PENDING",
      });
    }

    const events = syncEventBuffer.list({ workspaceId, limit: 200 });
    expect(events).toHaveLength(100);
    expect(JSON.stringify(events)).not.toContain("contenido secreto");
    expect(events[0]?.mutationId).toBe("mutation-119");
  });

  it("creates deterministic signatures and verifies convergence honestly", () => {
    const local = createMemorySignature({
      nodes: [node({ version: 1 })],
      contexts: [context({ version: 1 })],
      relations: [relation({ version: 1 })],
      generation: "10",
    });
    const same = createMemorySignature({
      relations: [relation({ version: 1 })],
      contexts: [context({ version: 1 })],
      nodes: [node({ version: 1 })],
      generation: "10",
    });
    const changed = createMemorySignature({
      nodes: [node({ version: 2 })],
      contexts: [context({ version: 1 })],
      relations: [relation({ version: 1 })],
      generation: "10",
    });

    expect(local.hash).toBe(same.hash);
    expect(verifyMemoryConvergence({
      localSignature: local,
      remoteSignature: same,
      pendingMutations: 0,
    }).status).toBe("CONFIRMED");
    expect(verifyMemoryConvergence({
      localSignature: local,
      remoteSignature: changed,
      pendingMutations: 0,
    }).status).toBe("DIVERGED");
    expect(verifyMemoryConvergence({
      localSignature: local,
      remoteSignature: null,
      pendingMutations: 0,
    }).status).toBe("UNKNOWN");
    expect(verifyMemoryConvergence({
      localSignature: local,
      remoteSignature: same,
      pendingMutations: 1,
    }).status).toBe("PENDING");
  });

  it("diagnoses pending, applied and stale UI capture stages", () => {
    const pending = diagnoseCaptureSync({
      nodeId,
      nodes: [node({})],
      mutations: [outboxRecord("PENDING")],
      events: [],
    });
    expect(pending.stoppedAt).toBe("OUTBOX");
    expect(pending.steps.find((step) => step.stage === "OUTBOX")?.status).toBe(
      "PENDING",
    );

    const applied = diagnoseCaptureSync({
      nodeId,
      nodes: [node({})],
      mutations: [],
      events: [event("CHANGE_APPLIED", 1)],
      visibleNodeIds: [nodeId],
    });
    expect(applied.stoppedAt).toBeNull();
    expect(applied.steps.find((step) => step.stage === "UI")?.status).toBe("OK");

    const staleUi = diagnoseCaptureSync({
      nodeId,
      nodes: [node({})],
      mutations: [],
      events: [],
      visibleNodeIds: [],
    });
    expect(staleUi.steps.find((step) => step.stage === "UI")?.status).toBe(
      "UNKNOWN",
    );
  });

  it("detects orphan captures, concepts and relations without duplicating queued entities", () => {
    const existingMutation = outboxRecord("PENDING");
    const orphans = findOrphanEntities({
      nodes: [
        node({ id: nodeId }),
        node({ id: "88888888-8888-4888-8888-888888888888" }),
      ],
      contexts: [context({})],
      relations: [relation({})],
      mutations: [existingMutation],
    });

    expect(orphans).toMatchObject([
      {
        entityType: "capture",
        entityId: "88888888-8888-4888-8888-888888888888",
        reason: "NEVER_ACKNOWLEDGED",
      },
      {
        entityType: "concept",
        entityId: "66666666-6666-4666-8666-666666666666",
        reason: "NEVER_ACKNOWLEDGED",
      },
      {
        entityType: "captureConcept",
        entityId: "77777777-7777-4777-8777-777777777777",
        reason: "NEVER_ACKNOWLEDGED",
      },
    ]);
  });

  it("does not treat an acknowledged entity with an empty outbox as orphan", () => {
    const orphans = findOrphanEntities({
      nodes: [node({ version: 2, updatedAt: "2026-08-03T12:01:00.000Z" })],
      contexts: [],
      relations: [],
      mutations: [],
      acknowledgements: [
        acknowledgement({
          entityType: "capture",
          entityId: nodeId,
          acknowledgedLocalVersion: 2,
          acknowledgedLocalUpdatedAt: "2026-08-03T12:01:00.000Z",
        }),
      ],
    });

    expect(orphans).toEqual([]);
  });

  it("detects local changes after acknowledgement as missing mutations", () => {
    const orphans = findOrphanEntities({
      nodes: [node({ version: 3, updatedAt: "2026-08-03T12:02:00.000Z" })],
      contexts: [],
      relations: [],
      mutations: [],
      acknowledgements: [
        acknowledgement({
          entityType: "capture",
          entityId: nodeId,
          acknowledgedLocalVersion: 2,
          acknowledgedLocalUpdatedAt: "2026-08-03T12:01:00.000Z",
        }),
      ],
    });

    expect(orphans).toMatchObject([
      {
        entityType: "capture",
        entityId: nodeId,
        reason: "LOCAL_VERSION_AHEAD",
        localVersion: 3,
      },
    ]);
  });

  it("generates missing outbox mutations and runs the existing sync pipeline", async () => {
    const setup = reconciliationSetup({
      nodes: [node({})],
      contexts: [context({})],
      relations: [relation({})],
    });

    const result = await setup.engine.reconcile({
      workspaceId,
      deviceId,
      syncState: initialSyncState,
    });

    expect(result.orphanEntities).toHaveLength(3);
    expect(result.generatedMutations.map((record) => record.mutation.entityType)).toEqual([
      "capture",
      "concept",
      "captureConcept",
    ]);
    expect(setup.runSync).toHaveBeenCalledTimes(1);
    expect(result.phases).toEqual([
      "HEALTH_CHECK",
      "DETECTING_DIVERGENCE",
      "FINDING_ORPHANS",
      "GENERATING_MUTATIONS",
      "PUSHING",
      "PULLING",
      "APPLYING",
      "VERIFYING_CONVERGENCE",
    ]);
  });

  it("does not create duplicate orphan mutations when one already exists", async () => {
    const setup = reconciliationSetup({
      nodes: [node({})],
      mutations: [outboxRecord("PENDING")],
    });

    const result = await setup.engine.reconcile({
      workspaceId,
      deviceId,
      syncState: initialSyncState,
    });

    expect(result.orphanEntities).toHaveLength(0);
    expect(result.generatedMutations).toHaveLength(0);
    expect(setup.runSync).toHaveBeenCalledTimes(1);
  });

  it("is idempotent when acknowledgements are recorded after the first run", async () => {
    const setup = reconciliationSetup({
      nodes: [node({ version: 1 })],
      acknowledgeOnSync: true,
    });

    const first = await setup.engine.reconcile({
      workspaceId,
      deviceId,
      syncState: initialSyncState,
    });
    const second = await setup.engine.reconcile({
      workspaceId,
      deviceId,
      syncState: initialSyncState,
    });

    expect(first.generatedMutations).toHaveLength(1);
    expect(second.generatedMutations).toHaveLength(0);
  });

  it("keeps reconciliation read-only while offline", async () => {
    const setup = reconciliationSetup({ nodes: [node({})] });

    const result = await setup.engine.reconcile({
      workspaceId,
      deviceId,
      syncState: { ...initialSyncState, connectivity: "OFFLINE" },
    });

    expect(result.status).toBe("OFFLINE");
    expect(result.generatedMutations).toHaveLength(0);
    expect(setup.enqueued).toHaveLength(0);
    expect(setup.runSync).not.toHaveBeenCalled();
  });

  it("reports conflicts and pending changes after reconciliation", async () => {
    const conflictSetup = reconciliationSetup({
      mutations: [outboxRecord("CONFLICT")],
    });
    await expect(conflictSetup.engine.reconcile({
      workspaceId,
      deviceId,
      syncState: initialSyncState,
    })).resolves.toMatchObject({ status: "CONFLICT" });

    const pendingSetup = reconciliationSetup({
      mutations: [outboxRecord("FAILED")],
    });
    await expect(pendingSetup.engine.reconcile({
      workspaceId,
      deviceId,
      syncState: initialSyncState,
    })).resolves.toMatchObject({ status: "DIVERGENCE_DETECTED" });
  });

  it("does not re-enqueue conflicted entities automatically", async () => {
    const setup = reconciliationSetup({
      nodes: [node({})],
      mutations: [outboxRecord("CONFLICT")],
    });

    const result = await setup.engine.reconcile({
      workspaceId,
      deviceId,
      syncState: initialSyncState,
    });

    expect(result.generatedMutations).toHaveLength(0);
    expect(result.status).toBe("CONFLICT");
  });

  it("handles a larger local dataset without changing the convergence contract", async () => {
    const nodes = Array.from({ length: 120 }, (_, index) =>
      node({
        id: uuidFromIndex(index),
        content: `Captura ${index}`,
      }),
    );
    const setup = reconciliationSetup({ nodes });

    const result = await setup.engine.reconcile({
      workspaceId,
      deviceId,
      syncState: initialSyncState,
    });

    expect(result.generatedMutations).toHaveLength(120);
    expect(result.convergence.status).toBe("PENDING");
    expect(result.status).toBe("PENDING_CHANGES");
  });

  it("does not resend a complete acknowledged dataset on every verification", async () => {
    const nodes = Array.from({ length: 120 }, (_, index) =>
      node({
        id: uuidFromIndex(index),
        version: 2,
        content: `Captura ${index}`,
      }),
    );
    const setup = reconciliationSetup({
      nodes,
      acknowledgements: nodes.map((item) =>
        acknowledgement({
          entityType: "capture",
          entityId: item.id,
          acknowledgedLocalVersion: item.version,
        }),
      ),
    });

    const result = await setup.engine.reconcile({
      workspaceId,
      deviceId,
      syncState: initialSyncState,
    });

    expect(result.generatedMutations).toHaveLength(0);
  });

  it("reset invalidates previous acknowledgements by clearing the ledger boundary", () => {
    const oldAcknowledgements = [
      acknowledgement({
        entityType: "capture",
        entityId: nodeId,
        acknowledgedLocalVersion: 1,
        generation: "old-reset",
      }),
    ];
    const afterReset = findOrphanEntities({
      nodes: [node({ version: 1 })],
      contexts: [],
      relations: [],
      mutations: [],
      acknowledgements: [],
    });

    expect(oldAcknowledgements).toHaveLength(1);
    expect(afterReset).toMatchObject([
      { entityType: "capture", entityId: nodeId, reason: "NEVER_ACKNOWLEDGED" },
    ]);
  });
});

function health(
  syncState: Partial<SyncState> = {},
  mutations: SyncMutationOutboxRecord[] = [],
  currentWorkspaceId: string | null = workspaceId,
  currentDeviceId: string | null = deviceId,
) {
  return deriveMemorySyncHealth({
    syncState: { ...initialSyncState, ...syncState },
    metadata: metadata(),
    mutations,
    recentEvents: [],
    workspaceId: currentWorkspaceId,
    deviceId: currentDeviceId,
  });
}

function event(type: Parameters<typeof appendMemorySyncEvent>[0]["type"], count: number) {
  return {
    id: `${type}-${count}`,
    type,
    timestamp: now,
    workspaceId,
    deviceId,
    count,
  };
}

function metadata(): SyncMetadataRecord {
  return {
    workspaceId,
    deviceId,
    pullCursor: "42",
    lastPullAttemptAt: now,
    lastSuccessfulPushAt: now,
    lastSuccessfulPullAt: now,
    lastSyncAttemptAt: now,
    lastSyncErrorCode: null,
    lastSyncErrorMessage: null,
    createdAt: now,
    updatedAt: now,
  };
}

function outboxRecord(
  status: SyncMutationOutboxRecord["status"],
): SyncMutationOutboxRecord {
  return {
    mutationId: "44444444-4444-4444-8444-444444444444",
    workspaceId,
    deviceId,
    mutation: {
      mutationId: "55555555-5555-4555-8555-555555555555",
      entityType: "capture",
      operation: "upsert",
      entityId: nodeId,
      baseVersion: null,
      payload: {
        content: "contenido secreto",
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      },
    },
    status,
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function node(overrides: Partial<Node>): Node {
  return {
    id: nodeId,
    workspaceId,
    type: "NOTE",
    content: "Memoria",
    status: "ACTIVE",
    organizationStatus: "ORGANIZED",
    metadata: {},
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    createdByDeviceId: deviceId,
    lastModifiedByDeviceId: deviceId,
    ...overrides,
  };
}

function context(overrides: Partial<Context>): Context {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    workspaceId,
    type: "AREA",
    name: "Trabajo",
    description: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    ...overrides,
  };
}

function relation(overrides: Partial<NodeContextRelation>): NodeContextRelation {
  return {
    id: "77777777-7777-4777-8777-777777777777",
    workspaceId,
    nodeId,
    contextId: "66666666-6666-4666-8666-666666666666",
    version: 1,
    createdAt: now,
    ...overrides,
  };
}

function acknowledgement(
  overrides: Partial<SyncEntityAcknowledgementRecord>,
): SyncEntityAcknowledgementRecord {
  return {
    workspaceId,
    entityType: "capture",
    entityId: nodeId,
    acknowledgedRemoteVersion: 1,
    acknowledgedLocalVersion: 1,
    acknowledgedLocalUpdatedAt: now,
    acknowledgedAt: now,
    generation: "42",
    lastChangeId: "42",
    ...overrides,
  };
}

function reconciliationSetup({
  nodes = [],
  contexts = [],
  relations = [],
  mutations = [],
  acknowledgements = [],
  acknowledgeOnSync = false,
}: {
  nodes?: Node[];
  contexts?: Context[];
  relations?: NodeContextRelation[];
  mutations?: SyncMutationOutboxRecord[];
  acknowledgements?: SyncEntityAcknowledgementRecord[];
  acknowledgeOnSync?: boolean;
}) {
  const enqueued: SyncMutationOutboxRecord[] = [];
  const runSync = vi.fn(async () => {
    if (!acknowledgeOnSync) {
      return;
    }

    for (const record of enqueued.splice(0)) {
      acknowledgements.push(acknowledgement({
        entityType: record.mutation.entityType,
        entityId: record.mutation.entityId,
        acknowledgedLocalVersion: record.localVersion ?? null,
        acknowledgedLocalUpdatedAt:
          "updatedAt" in record.mutation.payload
            ? record.mutation.payload.updatedAt
            : null,
      }));
    }
  });
  let mutationIndex = 0;
  const dependencies: MemoryReconciliationDependencies = {
    listNodes: async () => nodes,
    listContexts: async () => contexts,
    listRelations: async () => relations,
    listMutations: async () => [...mutations, ...enqueued],
    listAcknowledgements: async () => acknowledgements,
    enqueueMutation: async (input) => {
      const record: SyncMutationOutboxRecord = {
        mutationId: input.mutation.mutationId,
        workspaceId: input.workspaceId,
        deviceId: input.deviceId,
        mutation: input.mutation,
        localVersion: input.localVersion,
        status: "PENDING",
        attemptCount: 0,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      };
      enqueued.push(record);
      return record;
    },
    getMetadata: async () => metadata(),
    runSync,
    createMutationId: () => uuidFromIndex(900 + mutationIndex++),
    emitEvent: () => undefined,
  };

  return {
    engine: new MemoryReconciliationEngine(dependencies),
    enqueued,
    runSync,
  };
}

function uuidFromIndex(index: number) {
  return `99999999-9999-4999-8999-${String(index).padStart(12, "0")}`;
}
