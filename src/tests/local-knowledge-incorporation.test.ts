import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import {
  detectLocalKnowledgeIncorporationOffer,
  incorporateLocalKnowledgeToRemoteAccount,
} from "@/features/auth/local-knowledge-incorporation";
import { InMemoryLocalAuthIdentityStorage } from "@/features/auth/storage/in-memory-auth-session-storage";
import type { StoredLocalAuthIdentity } from "@/features/auth/storage/auth-session-storage";
import { IndexedDbSyncOutboxRepository } from "@/features/sync/sync-outbox-repository";
import { IndexedDbContextRepository } from "@/infrastructure/context/indexed-db-context-repository";
import { IndexedDbNodeContextRelationRepository } from "@/infrastructure/context/indexed-db-node-context-relation-repository";
import { IndexedDbNodeRepository } from "@/infrastructure/node/indexed-db-node-repository";
import {
  VINEMA_DB_NAME,
  resetVinemaDbConnectionForTests,
} from "@/infrastructure/storage/vinema-db";

const localWorkspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const localDeviceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const remoteWorkspaceId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const remoteDeviceId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const remoteUserId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const localContextId = "11111111-1111-4111-8111-111111111111";
const localNodeId = "22222222-2222-4222-8222-222222222222";
const localRelationId = "33333333-3333-4333-8333-333333333333";
const remoteContextId = "44444444-4444-4444-8444-444444444444";
const remoteNodeId = "55555555-5555-4555-8555-555555555555";
const remoteRelationId = "66666666-6666-4666-8666-666666666666";
const existingContextId = "77777777-7777-4777-8777-777777777777";
const existingNodeId = "88888888-8888-4888-8888-888888888888";
const existingRelationId = "99999999-9999-4999-8999-999999999999";
const now = "2026-08-08T12:00:00.000Z";

describe("local knowledge incorporation", () => {
  beforeEach(async () => {
    await resetVinemaDbConnectionForTests();
    await deleteDB(VINEMA_DB_NAME);
  });

  afterEach(async () => {
    await resetVinemaDbConnectionForTests();
    await deleteDB(VINEMA_DB_NAME);
  });

  it("does not offer migration for an empty local identity", async () => {
    const localStorage = createLocalStorage();

    await expect(
      detectLocalKnowledgeIncorporationOffer({
        localAuthIdentityStorage: localStorage,
      }),
    ).resolves.toBeNull();
  });

  it("offers migration when the local workspace has captures, concepts or relations", async () => {
    const localStorage = createLocalStorage();
    await seedLocalKnowledge();

    await expect(
      detectLocalKnowledgeIncorporationOffer({
        localAuthIdentityStorage: localStorage,
      }),
    ).resolves.toMatchObject({
      counts: { captures: 1, concepts: 1, relations: 1 },
      interrupted: false,
    });
  });

  it("keeps local data unchanged while the user chooses no por ahora", async () => {
    const localStorage = createLocalStorage();
    await seedLocalKnowledge();
    const before = await snapshotCounts(localWorkspaceId);

    await detectLocalKnowledgeIncorporationOffer({
      localAuthIdentityStorage: localStorage,
    });

    await expect(snapshotCounts(localWorkspaceId)).resolves.toEqual(before);
    await expect(localStorage.load()).resolves.toMatchObject({
      active: false,
      migrationStatus: "LOCAL_PENDING",
    });
  });

  it("incorporates captures, concepts, relations and timestamps into the remote workspace", async () => {
    const localStorage = createLocalStorage();
    await seedLocalKnowledge();

    await incorporateLocalKnowledgeToRemoteAccount({
      localAuthIdentityStorage: localStorage,
      remoteUserId,
      remoteWorkspaceId,
      remoteDeviceId,
      syncNow: vi.fn(async () => undefined),
      verifyRemoteSync: async () => undefined,
      clock: () => now,
      idFactory: createSequentialIds("run", remoteContextId, remoteNodeId, remoteRelationId),
    });

    const [remoteNodes, remoteContexts, remoteRelations] = await Promise.all([
      new IndexedDbNodeRepository().listByWorkspace(remoteWorkspaceId),
      new IndexedDbContextRepository().list({ workspaceId: remoteWorkspaceId }),
      new IndexedDbNodeContextRelationRepository().listByWorkspace(remoteWorkspaceId),
    ]);

    expect(remoteNodes).toHaveLength(1);
    expect(remoteNodes[0]).toMatchObject({
      id: remoteNodeId,
      workspaceId: remoteWorkspaceId,
      content: "Captura local importante",
      createdAt: "2026-08-08T10:00:00.000Z",
      updatedAt: "2026-08-08T10:05:00.000Z",
      contentUpdatedAt: "2026-08-08T10:04:00.000Z",
      createdByDeviceId: remoteDeviceId,
      lastModifiedByDeviceId: remoteDeviceId,
    });
    expect(remoteNodes[0].metadata.localIncorporation).toMatchObject({
      sourceWorkspaceId: localWorkspaceId,
      sourceDeviceId: localDeviceId,
      sourceNodeId: localNodeId,
      migrationRunId: "run",
    });
    expect(remoteContexts).toHaveLength(1);
    expect(remoteContexts[0]).toMatchObject({
      id: remoteContextId,
      name: "Mitcom",
      aliases: ["estado de pago"],
      createdAt: "2026-08-08T09:00:00.000Z",
      updatedAt: "2026-08-08T09:30:00.000Z",
    });
    expect(remoteRelations).toHaveLength(1);
    expect(remoteRelations[0]).toMatchObject({
      id: remoteRelationId,
      nodeId: remoteNodeId,
      contextId: remoteContextId,
      createdAt: "2026-08-08T10:06:00.000Z",
    });
  });

  it("deduplicates equivalent remote concepts, captures and relations", async () => {
    const localStorage = createLocalStorage();
    await seedLocalKnowledge();
    await seedRemoteEquivalentKnowledge();

    const result = await incorporateLocalKnowledgeToRemoteAccount({
      localAuthIdentityStorage: localStorage,
      remoteUserId,
      remoteWorkspaceId,
      remoteDeviceId,
      syncNow: vi.fn(async () => undefined),
      verifyRemoteSync: async () => undefined,
      clock: () => now,
      idFactory: createSequentialIds("run"),
    });

    await expect(snapshotCounts(remoteWorkspaceId)).resolves.toEqual({
      nodes: 1,
      contexts: 1,
      relations: 1,
    });
    expect(result.reused).toEqual({ captures: 1, concepts: 1, relations: 1 });
  });

  it("does not clean local knowledge when remote sync fails", async () => {
    const localStorage = createLocalStorage();
    await seedLocalKnowledge();

    await expect(
      incorporateLocalKnowledgeToRemoteAccount({
        localAuthIdentityStorage: localStorage,
        remoteUserId,
        remoteWorkspaceId,
        remoteDeviceId,
        syncNow: vi.fn(async () => {
          throw new Error("offline");
        }),
        clock: () => now,
        idFactory: createSequentialIds("run", remoteContextId, remoteNodeId, remoteRelationId),
      }),
    ).rejects.toThrow("No se pudo incorporar");

    await expect(snapshotCounts(localWorkspaceId)).resolves.toEqual({
      nodes: 1,
      contexts: 1,
      relations: 1,
    });
    await expect(localStorage.load()).resolves.toMatchObject({
      migrationStatus: "LOCAL_PENDING",
    });
  });

  it("keeps local intact when sync finishes without confirming remote outbox", async () => {
    const localStorage = createLocalStorage();
    await seedLocalKnowledge();
    const syncNow = vi.fn(async () => undefined);

    await expect(
      incorporateLocalKnowledgeToRemoteAccount({
        localAuthIdentityStorage: localStorage,
        remoteUserId,
        remoteWorkspaceId,
        remoteDeviceId,
        syncNow,
        clock: () => now,
        sleep: async () => undefined,
        idFactory: createSequentialIds("run", remoteContextId, remoteNodeId, remoteRelationId),
      }),
    ).rejects.toMatchObject({
      code: "REMOTE_SYNC_NOT_CONFIRMED",
    });

    expect(syncNow).toHaveBeenCalledTimes(4);
    await expect(snapshotCounts(localWorkspaceId)).resolves.toEqual({
      nodes: 1,
      contexts: 1,
      relations: 1,
    });
    await expect(localStorage.load()).resolves.toMatchObject({
      migrationStatus: "LOCAL_PENDING",
    });
  });

  it("retries verification when the first sync pass leaves migrated outbox pending", async () => {
    const localStorage = createLocalStorage();
    await seedLocalKnowledge();
    const outboxRepository = new IndexedDbSyncOutboxRepository();
    const syncNow = vi.fn(async () => {
      const remoteMutations = await outboxRepository.listByWorkspace(remoteWorkspaceId);
      const localMutations = await outboxRepository.listByWorkspace(localWorkspaceId);
      expect(localMutations).toHaveLength(0);
      if (syncNow.mock.calls.length >= 2) {
        await outboxRepository.remove(
          remoteMutations.map((mutation) => mutation.mutationId),
        );
      }
    });

    await expect(
      incorporateLocalKnowledgeToRemoteAccount({
        localAuthIdentityStorage: localStorage,
        remoteUserId,
        remoteWorkspaceId,
        remoteDeviceId,
        syncNow,
        clock: () => now,
        sleep: async () => undefined,
        idFactory: createSequentialIds("run", remoteContextId, remoteNodeId, remoteRelationId),
      }),
    ).resolves.toMatchObject({
      migrated: { captures: 1, concepts: 1, relations: 1 },
      cleaned: { captures: 1, concepts: 1, relations: 1 },
    });

    expect(syncNow).toHaveBeenCalledTimes(2);
    await expect(snapshotCounts(localWorkspaceId)).resolves.toEqual({
      nodes: 0,
      contexts: 0,
      relations: 0,
    });
  });

  it("cleans local workspace only after verified success and does not offer it again", async () => {
    const localStorage = createLocalStorage();
    await seedLocalKnowledge();

    const result = await incorporateLocalKnowledgeToRemoteAccount({
      localAuthIdentityStorage: localStorage,
      remoteUserId,
      remoteWorkspaceId,
      remoteDeviceId,
      syncNow: vi.fn(async () => undefined),
      verifyRemoteSync: async () => undefined,
      clock: () => now,
      idFactory: createSequentialIds("run", remoteContextId, remoteNodeId, remoteRelationId),
    });

    expect(result.cleaned).toEqual({ captures: 1, concepts: 1, relations: 1 });
    await expect(snapshotCounts(localWorkspaceId)).resolves.toEqual({
      nodes: 0,
      contexts: 0,
      relations: 0,
    });
    await expect(localStorage.load()).resolves.toMatchObject({
      active: false,
      migrationStatus: "LOCAL_MIGRATED",
      migratedToUserId: remoteUserId,
      migratedToWorkspaceId: remoteWorkspaceId,
    });
    await expect(
      detectLocalKnowledgeIncorporationOffer({
        localAuthIdentityStorage: localStorage,
      }),
    ).resolves.toBeNull();
  });

  it("surfaces an interrupted migration as retryable without cleaning local data", async () => {
    const localStorage = createLocalStorage({
      migrationStatus: "LOCAL_MIGRATING",
      migrationStartedAt: "2026-08-08T11:00:00.000Z",
    });
    await seedLocalKnowledge();

    await expect(
      detectLocalKnowledgeIncorporationOffer({
        localAuthIdentityStorage: localStorage,
      }),
    ).resolves.toMatchObject({ interrupted: true });
    await expect(snapshotCounts(localWorkspaceId)).resolves.toEqual({
      nodes: 1,
      contexts: 1,
      relations: 1,
    });
  });
});

function createLocalStorage(overrides: Partial<StoredLocalAuthIdentity> = {}) {
  const storage = new InMemoryLocalAuthIdentityStorage();
  void storage.save({
    sessionMode: "local",
    active: false,
    userId: "local-user",
    workspaceId: localWorkspaceId,
    deviceId: localDeviceId,
    sessionId: "local-session",
    migrationStatus: "LOCAL_PENDING",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
  return storage;
}

async function seedLocalKnowledge() {
  const context = createContext({
    id: localContextId,
    workspaceId: localWorkspaceId,
    name: "Mitcom",
    aliases: ["estado de pago"],
    normalizedAliases: ["estado de pago"],
  });
  const node = createNode({
    id: localNodeId,
    workspaceId: localWorkspaceId,
    content: "Captura local importante",
  });
  const relation = createRelation({
    id: localRelationId,
    workspaceId: localWorkspaceId,
    nodeId: node.id,
    contextId: context.id,
  });

  await new IndexedDbContextRepository().save(context);
  await new IndexedDbNodeRepository().create(node);
  await new IndexedDbNodeContextRelationRepository().save(relation);
}

async function seedRemoteEquivalentKnowledge() {
  const context = createContext({
    id: existingContextId,
    workspaceId: remoteWorkspaceId,
    name: "MITCOM",
    aliases: [],
    normalizedAliases: [],
  });
  const node = createNode({
    id: existingNodeId,
    workspaceId: remoteWorkspaceId,
    content: "  captura local importante ",
  });
  const relation = createRelation({
    id: existingRelationId,
    workspaceId: remoteWorkspaceId,
    nodeId: node.id,
    contextId: context.id,
  });

  await new IndexedDbContextRepository().save(context);
  await new IndexedDbNodeRepository().create(node);
  await new IndexedDbNodeContextRelationRepository().save(relation);
}

function createContext(input: Partial<Context>): Context {
  return {
    id: input.id ?? "concept",
    workspaceId: input.workspaceId ?? localWorkspaceId,
    type: "AREA",
    name: input.name ?? "Concepto",
    description: input.description ?? null,
    aliases: input.aliases ?? [],
    normalizedAliases: input.normalizedAliases ?? [],
    version: 1,
    createdAt: "2026-08-08T09:00:00.000Z",
    updatedAt: "2026-08-08T09:30:00.000Z",
    archivedAt: null,
  };
}

function createNode(input: Partial<Node>): Node {
  return {
    id: input.id ?? "node",
    workspaceId: input.workspaceId ?? localWorkspaceId,
    type: "NOTE",
    content: input.content ?? "Contenido",
    status: "ACTIVE",
    organizationStatus: "ORGANIZED",
    metadata: input.metadata ?? {},
    version: 1,
    createdAt: "2026-08-08T10:00:00.000Z",
    contentUpdatedAt: "2026-08-08T10:04:00.000Z",
    updatedAt: "2026-08-08T10:05:00.000Z",
    deletedAt: null,
    createdByDeviceId: localDeviceId,
    lastModifiedByDeviceId: localDeviceId,
  };
}

function createRelation(input: Partial<NodeContextRelation>): NodeContextRelation {
  return {
    id: input.id ?? "relation",
    workspaceId: input.workspaceId ?? localWorkspaceId,
    nodeId: input.nodeId ?? "node",
    contextId: input.contextId ?? "concept",
    relationType: "CONTEXT",
    version: 1,
    createdAt: "2026-08-08T10:06:00.000Z",
  };
}

async function snapshotCounts(workspaceId: string) {
  const [nodes, contexts, relations] = await Promise.all([
    new IndexedDbNodeRepository().listByWorkspace(workspaceId),
    new IndexedDbContextRepository().list({ workspaceId }),
    new IndexedDbNodeContextRelationRepository().listByWorkspace(workspaceId),
  ]);
  return {
    nodes: nodes.length,
    contexts: contexts.length,
    relations: relations.length,
  };
}

function createSequentialIds(...ids: string[]) {
  let index = 0;
  return () => ids[index++] ?? `generated-${index}`;
}
