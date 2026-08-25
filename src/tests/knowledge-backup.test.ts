import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import type { Workspace } from "@/domain/workspace/workspace";
import {
  KNOWLEDGE_BACKUP_FORMAT,
  KNOWLEDGE_BACKUP_VERSION,
  buildKnowledgeBackup,
  createKnowledgeBackupFileName,
  exportKnowledgeBackup,
  KnowledgeBackupValidationError,
  KnowledgeRestoreConflictError,
  parseKnowledgeBackupJson,
  restoreKnowledgeBackup,
  serializeKnowledgeBackup,
} from "@/features/knowledge-backup/knowledge-backup";
import { IndexedDbSyncOutboxRepository } from "@/features/sync/sync-outbox-repository";
import { createLocalSyncRepositorySet } from "@/infrastructure/repositories";
import {
  resetVinemaDbConnectionForTests,
  resetVinemaDbNameForTests,
  setVinemaDbNameForTests,
} from "@/infrastructure/storage/vinema-db";
import { InMemoryContextRepository } from "@/tests/fakes/in-memory-context-repository";
import { InMemoryNodeContextRelationRepository } from "@/tests/fakes/in-memory-node-context-relation-repository";
import { InMemoryNodeRepository } from "@/tests/fakes/in-memory-node-repository";

const workspace: Workspace = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Personal",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const otherWorkspace: Workspace = {
  ...workspace,
  id: "22222222-2222-4222-8222-222222222222",
};
const nodeId = "33333333-3333-4333-8333-333333333333";
const contextId = "44444444-4444-4444-8444-444444444444";
const relationId = "55555555-5555-4555-8555-555555555555";
const otherNodeId = "66666666-6666-4666-8666-666666666666";
const otherContextId = "77777777-7777-4777-8777-777777777777";
const otherRelationId = "88888888-8888-4888-8888-888888888888";
const equivalentContextId = "99999999-9999-4999-8999-999999999999";
const localDeviceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sourceDeviceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("knowledge backup", () => {
  it("exports versioned knowledge without sessions, devices or tokens", () => {
    const backup = backupFixture();
    const serialized = serializeKnowledgeBackup(backup);

    expect(backup).toMatchObject({
      format: "vinema-memory-backup",
      version: 2,
      summary: {
        captures: 1,
        concepts: 1,
        relations: 1,
        archivedCaptures: 0,
        archivedConcepts: 0,
      },
    });
    expect(backup.memory.captures[0].content).toBe("Reunion con Mitcom");
    expect(backup.memory.concepts[0].normalizedLabel).toBe("reuniones");
    expect(backup.memory.concepts[0]).toMatchObject({
      aliases: ["Meetings"],
      normalizedAliases: ["meetings"],
    });
    expect(backup.integrity.checksum).toMatch(/^fnv1a32:/);
    expect(serialized).not.toMatch(/accessToken|refreshToken|session|deviceName/i);
  });

  it("creates the expected readable file name", () => {
    expect(
      createKnowledgeBackupFileName(new Date("2026-08-01T09:07:00.000Z")),
    ).toMatch(/^vinema-memory-2026-08-01-\d{4}\.json$/);
  });

  it("accepts a valid JSON backup and rejects invalid files", () => {
    const backup = backupFixture();

    expect(parseKnowledgeBackupJson(serializeKnowledgeBackup(backup))).toEqual(
      backup,
    );
    expect(() => parseKnowledgeBackupJson("{")).toThrow(
      KnowledgeBackupValidationError,
    );
    expect(() =>
      parseKnowledgeBackupJson(
        JSON.stringify({
          ...backup,
          memory: {
            ...backup.memory,
            relations: [{ ...backup.memory.relations[0], nodeId: "missing" }],
          },
        }),
      ),
    ).toThrow(KnowledgeBackupValidationError);
  });

  it("continues accepting legacy v1 backups as partial memory backups", () => {
    const backup = legacyBackupFixture();

    expect(parseKnowledgeBackupJson(JSON.stringify(backup))).toEqual(backup);
  });

  it("rejects backups that contain sensitive fields", () => {
    const backup = backupFixture();

    expect(() =>
      parseKnowledgeBackupJson(
        JSON.stringify({
          ...backup,
          accessToken: "secret",
        }),
      ),
    ).toThrow(KnowledgeBackupValidationError);
  });

  it("exports only the requested workspace", async () => {
    const repositories = {
      nodeRepository: new InMemoryNodeRepository([
        nodeFixture(),
        nodeFixture({ id: otherNodeId, workspaceId: otherWorkspace.id }),
      ]),
      contextRepository: new InMemoryContextRepository([
        contextFixture(),
        contextFixture({ id: otherContextId, workspaceId: otherWorkspace.id }),
      ]),
      relationRepository: new InMemoryNodeContextRelationRepository([
        relationFixture(),
        relationFixture({
          id: otherRelationId,
          workspaceId: otherWorkspace.id,
          nodeId: otherNodeId,
          contextId: otherContextId,
        }),
      ]),
    };

    const backup = await exportKnowledgeBackup({
      workspace,
      repositories,
      now: () => "2026-01-02T00:00:00.000Z",
    });

    expect(backup.summary).toMatchObject({ captures: 1, concepts: 1, relations: 1 });
    expect(backup.memory.captures.map((node) => node.workspaceId)).toEqual([
      workspace.id,
    ]);
  });

  it("restores idempotently and does not duplicate equivalent concepts or relations", async () => {
    const existingContext = contextFixture({
      id: equivalentContextId,
      name: "Reuniones",
      aliases: ["Meetings"],
      normalizedAliases: ["meetings"],
    });
    const repositories = {
      nodeRepository: new InMemoryNodeRepository(),
      contextRepository: new InMemoryContextRepository([existingContext]),
      relationRepository: new InMemoryNodeContextRelationRepository(),
    };

    const first = await restoreKnowledgeBackup({
      backup: backupFixture(),
      workspace,
      deviceId: localDeviceId,
      repositories,
    });
    const second = await restoreKnowledgeBackup({
      backup: backupFixture(),
      workspace,
      deviceId: localDeviceId,
      repositories,
    });

    expect(first).toMatchObject({
      createdNodes: 1,
      createdContexts: 0,
      createdRelations: 1,
    });
    expect(second).toMatchObject({
      createdNodes: 0,
      createdContexts: 0,
      createdRelations: 0,
    });
    await expect(
      repositories.contextRepository.list({
        workspaceId: workspace.id,
        includeArchived: true,
      }),
    ).resolves.toHaveLength(1);
    await expect(
      repositories.relationRepository.listByWorkspace(workspace.id),
    ).resolves.toHaveLength(1);
  });

  it("aborts restore before applying when conflicts exist", async () => {
    const repositories = {
      nodeRepository: new InMemoryNodeRepository([
        nodeFixture({ content: "Contenido local distinto" }),
      ]),
      contextRepository: new InMemoryContextRepository(),
      relationRepository: new InMemoryNodeContextRelationRepository(),
    };

    await expect(
      restoreKnowledgeBackup({
        backup: backupFixture(),
        workspace,
        deviceId: localDeviceId,
        repositories,
      }),
    ).rejects.toThrow(KnowledgeRestoreConflictError);

    await expect(
      repositories.contextRepository.list({
        workspaceId: workspace.id,
        includeArchived: true,
      }),
    ).resolves.toHaveLength(0);
    await expect(
      repositories.relationRepository.listByWorkspace(workspace.id),
    ).resolves.toHaveLength(0);
  });

  it("rejects restore from another workspace", async () => {
    await expect(
      restoreKnowledgeBackup({
        backup: buildKnowledgeBackup({
          workspace: otherWorkspace,
          nodes: [nodeFixture({ workspaceId: otherWorkspace.id })],
          contexts: [contextFixture({ workspaceId: otherWorkspace.id })],
          relations: [
            relationFixture({ workspaceId: otherWorkspace.id }),
          ],
          exportedAt: "2026-01-02T00:00:00.000Z",
        }),
        workspace,
        deviceId: localDeviceId,
        repositories: {
          nodeRepository: new InMemoryNodeRepository(),
          contextRepository: new InMemoryContextRepository(),
          relationRepository: new InMemoryNodeContextRelationRepository(),
        },
      }),
    ).rejects.toThrow(KnowledgeBackupValidationError);
  });
});

describe("knowledge restore sync integration", () => {
  let dbName = "";

  beforeEach(async () => {
    dbName = `vinema-backup-${crypto.randomUUID()}`;
    await setVinemaDbNameForTests(dbName);
  });

  afterEach(async () => {
    await resetVinemaDbConnectionForTests();
    await resetVinemaDbNameForTests();
    await deleteDB(dbName).catch(() => undefined);
  });

  it("restores through sync-aware repositories and enqueues outbox mutations", async () => {
    const repositories = createLocalSyncRepositorySet({
      workspaceId: workspace.id,
      deviceId: localDeviceId,
    });
    const syncNow = vi.fn(async () => undefined);

    await restoreKnowledgeBackup({
      backup: backupFixture(),
      workspace,
      deviceId: localDeviceId,
      repositories: {
        nodeRepository: repositories.nodeRepository,
        contextRepository: repositories.contextRepository,
        relationRepository: repositories.nodeContextRelationRepository,
      },
      syncNow,
    });

    const pending = await new IndexedDbSyncOutboxRepository().listPending(
      workspace.id,
      10,
    );

    expect(syncNow).toHaveBeenCalledTimes(1);
    expect(pending.map((record) => record.mutation.entityType).sort()).toEqual([
      "capture",
      "captureConcept",
      "concept",
    ]);
  });
});

function backupFixture() {
  return buildKnowledgeBackup({
    workspace,
    nodes: [nodeFixture()],
    contexts: [contextFixture()],
    relations: [relationFixture()],
    exportedAt: "2026-01-02T00:00:00.000Z",
  });
}

function legacyBackupFixture() {
  const memory = backupFixture();

  return {
    format: KNOWLEDGE_BACKUP_FORMAT,
    version: KNOWLEDGE_BACKUP_VERSION,
    exportedAt: memory.exportedAt,
    workspace: {
      id: workspace.id,
      name: workspace.name,
    },
    knowledge: {
      nodes: memory.memory.captures,
      contexts: memory.memory.concepts,
      relations: memory.memory.relations,
    },
    summary: {
      nodes: memory.summary.captures,
      contexts: memory.summary.concepts,
      relations: memory.summary.relations,
    },
  };
}

function nodeFixture(overrides: Partial<Node> = {}): Node {
  return {
    id: nodeId,
    workspaceId: workspace.id,
    type: "NOTE",
    content: "Reunion con Mitcom",
    status: "ACTIVE",
    organizationStatus: "ORGANIZED",
    metadata: {
      source: "manual",
      accessToken: "must-not-export",
    },
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    contentUpdatedAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
    restoredAt: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    createdByDeviceId: sourceDeviceId,
    lastModifiedByDeviceId: sourceDeviceId,
    ...overrides,
  };
}

function contextFixture(overrides: Partial<Context> = {}): Context {
  return {
    id: contextId,
    workspaceId: workspace.id,
    type: "AREA",
    name: "Reuniones",
    description: null,
    aliases: ["Meetings"],
    normalizedAliases: ["meetings"],
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}

function relationFixture(
  overrides: Partial<NodeContextRelation> = {},
): NodeContextRelation {
  return {
    id: relationId,
    workspaceId: workspace.id,
    nodeId,
    contextId,
    relationType: "CONTEXT",
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}
