import { describe, expect, it } from "vitest";
import { createVinemaApiServer } from "../../server/src/http/create-server";
import { InMemorySyncStore } from "../../server/src/testing/in-memory-sync-store";
import { processPush } from "../../server/src/sync/sync-service";
import { mapLocalContextToConceptMutation, mapLocalNodeToCaptureMutation, mapLocalRelationToCaptureConceptMutation, mapRemoteCaptureToLocalNode, mapRemoteConceptToLocalContext } from "@/features/sync/sync-mappers";
import type { Context } from "@/domain/context/context";
import type { Node } from "@/domain/node/node";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";

const apiKey = "test-secret";
const workspaceId = "11111111-1111-4111-8111-111111111111";
const otherWorkspaceId = "22222222-2222-4222-8222-222222222222";
const deviceId = "33333333-3333-4333-8333-333333333333";
const now = "2026-07-26T18:00:00.000Z";

describe("Vinema sync API", () => {
  it("responds health with database status and no credentials", async () => {
    const store = new InMemorySyncStore([workspaceId]);
    const app = createVinemaApiServer({ store, apiKey });
    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      service: "vinema-api",
      database: "connected",
    });
    expect(response.body).not.toContain("DATABASE_URL");

    store.failHealth = true;
    const failed = await app.inject({ method: "GET", url: "/api/health" });
    expect(failed.statusCode).toBe(200);
    expect(failed.json()).toMatchObject({
      status: "ok",
      service: "vinema-api",
      database: "unavailable",
    });
    expect(failed.body).not.toContain("postgresql://");
  });

  it("protects push and pull with the temporary bearer token", async () => {
    const app = createVinemaApiServer({
      store: new InMemorySyncStore([workspaceId]),
      apiKey,
    });

    await expect(
      app.inject({
        method: "POST",
        url: "/api/sync/push",
        payload: { workspaceId, deviceId, mutations: [] },
      }),
    ).resolves.toMatchObject({ statusCode: 401 });
    await expect(
      app.inject({
        method: "GET",
        url: `/api/sync/pull?workspaceId=${workspaceId}&cursor=0&limit=1`,
      }),
    ).resolves.toMatchObject({ statusCode: 401 });
    await expect(
      app.inject({
        method: "GET",
        url: `/api/sync/pull?workspaceId=${workspaceId}`,
        headers: { Authorization: "Bearer wrong" },
      }),
    ).resolves.toMatchObject({ statusCode: 401 });
  });

  it("allows the deployed web origin and auth headers through CORS", async () => {
    const app = createVinemaApiServer({
      store: new InMemorySyncStore([workspaceId]),
      apiKey,
    });

    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/sync/push",
      headers: {
        Origin: "https://vinema-web.up.railway.app",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "https://vinema-web.up.railway.app",
    );
    expect(response.headers["access-control-allow-headers"]).toContain(
      "Authorization",
    );
  });

  it("allows configured web origins through auth CORS preflight", async () => {
    const app = createVinemaApiServer({
      store: new InMemorySyncStore([workspaceId]),
      apiKey,
    });

    for (const origin of [
      "https://vinema-web.up.railway.app",
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3456",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:3456",
    ]) {
      const response = await app.inject({
        method: "OPTIONS",
        url: "/auth/register",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type",
        },
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers["access-control-allow-origin"]).toBe(origin);
      expect(response.headers["access-control-allow-headers"]).toContain(
        "Content-Type",
      );
    }
  });

  it("does not open CORS to unexpected browser origins", async () => {
    const app = createVinemaApiServer({
      store: new InMemorySyncStore([workspaceId]),
      apiKey,
    });

    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/sync/push",
      headers: {
        Origin: "https://example.invalid",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("creates a capture with client id, version, SyncChange and ProcessedMutation", async () => {
    const store = new InMemorySyncStore([workspaceId]);
    const app = createVinemaApiServer({ store, apiKey });
    const mutation = captureMutation({
      mutationId: "44444444-4444-4444-8444-444444444444",
      entityId: "55555555-5555-4555-8555-555555555555",
      baseVersion: null,
    });
    const response = await push(app, [mutation]);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      accepted: [
        {
          mutationId: mutation.mutationId,
          entityType: "capture",
          entityId: mutation.entityId,
          version: 1,
        },
      ],
      conflicts: [],
      rejected: [],
      serverCursor: "1",
    });
    expect(store.captures.get(mutation.entityId)).toMatchObject({
      id: mutation.entityId,
      version: 1,
    });
    expect(store.changes).toHaveLength(1);
    expect(store.processedMutations.size).toBe(1);
  });

  it("updates captures, increments version and reports stale baseVersion conflicts", async () => {
    const store = new InMemorySyncStore([workspaceId]);
    const captureId = "55555555-5555-4555-8555-555555555555";
    await processPush(store, {
      workspaceId,
      deviceId,
      mutations: [
        captureMutation({
          mutationId: "44444444-4444-4444-8444-444444444444",
          entityId: captureId,
          baseVersion: null,
        }),
      ],
    });
    const update = await processPush(store, {
      workspaceId,
      deviceId,
      mutations: [
        captureMutation({
          mutationId: "66666666-6666-4666-8666-666666666666",
          entityId: captureId,
          baseVersion: 1,
          content: "Texto actualizado",
        }),
      ],
    });
    const conflict = await processPush(store, {
      workspaceId,
      deviceId,
      mutations: [
        captureMutation({
          mutationId: "77777777-7777-4777-8777-777777777777",
          entityId: captureId,
          baseVersion: 1,
          content: "Texto en conflicto",
        }),
      ],
    });

    expect(update.accepted[0]).toMatchObject({ version: 2 });
    expect(conflict.conflicts).toHaveLength(1);
    expect(store.captures.get(captureId)?.content).toBe("Texto actualizado");
    expect(store.changes).toHaveLength(2);
  });

  it("is idempotent for repeated mutationId", async () => {
    const store = new InMemorySyncStore([workspaceId]);
    const mutation = captureMutation({
      mutationId: "44444444-4444-4444-8444-444444444444",
      entityId: "55555555-5555-4555-8555-555555555555",
      baseVersion: null,
    });

    const first = await processPush(store, { workspaceId, deviceId, mutations: [mutation] });
    const second = await processPush(store, { workspaceId, deviceId, mutations: [mutation] });

    expect(second).toEqual(first);
    expect(store.changes).toHaveLength(1);
    expect(store.captures.get(mutation.entityId)?.version).toBe(1);
  });

  it("creates concepts, relations, archives without physical deletion and rejects cross-workspace relations", async () => {
    const store = new InMemorySyncStore([workspaceId, otherWorkspaceId]);
    const captureId = "55555555-5555-4555-8555-555555555555";
    const conceptId = "66666666-6666-4666-8666-666666666666";
    const relationId = "77777777-7777-4777-8777-777777777777";
    const otherConceptId = "88888888-8888-4888-8888-888888888888";

    await processPush(store, {
      workspaceId,
      deviceId,
      mutations: [
        captureMutation({
          mutationId: "11111111-aaaa-4aaa-8aaa-111111111111",
          entityId: captureId,
          baseVersion: null,
        }),
        conceptMutation({
          mutationId: "22222222-aaaa-4aaa-8aaa-222222222222",
          entityId: conceptId,
          baseVersion: null,
        }),
      ],
    });
    await processPush(store, {
      workspaceId: otherWorkspaceId,
      deviceId,
      mutations: [
        conceptMutation({
          mutationId: "33333333-aaaa-4aaa-8aaa-333333333333",
          entityId: otherConceptId,
          baseVersion: null,
        }),
      ],
    });
    const relation = await processPush(store, {
      workspaceId,
      deviceId,
      mutations: [
        relationMutation({
          mutationId: "44444444-aaaa-4aaa-8aaa-444444444444",
          entityId: relationId,
          captureId,
          conceptId,
          baseVersion: null,
        }),
      ],
    });
    const crossWorkspace = await processPush(store, {
      workspaceId,
      deviceId,
      mutations: [
        relationMutation({
          mutationId: "55555555-aaaa-4aaa-8aaa-555555555555",
          entityId: "99999999-9999-4999-8999-999999999999",
          captureId,
          conceptId: otherConceptId,
          baseVersion: null,
        }),
      ],
    });
    const archived = await processPush(store, {
      workspaceId,
      deviceId,
      mutations: [
        conceptMutation({
          mutationId: "66666666-aaaa-4aaa-8aaa-666666666666",
          entityId: conceptId,
          baseVersion: 1,
          archivedAt: now,
        }),
      ],
    });

    expect(relation.accepted[0]).toMatchObject({ entityType: "captureConcept" });
    expect(crossWorkspace.rejected[0]).toMatchObject({ code: "INVALID_REQUEST" });
    expect(archived.accepted[0]).toMatchObject({ version: 2 });
    expect(store.concepts.get(conceptId)?.archivedAt).toBe(now);
  });

  it("pulls incrementally with string cursors, pagination and workspace isolation", async () => {
    const store = new InMemorySyncStore([workspaceId, otherWorkspaceId]);
    const app = createVinemaApiServer({ store, apiKey });

    await processPush(store, {
      workspaceId,
      deviceId,
      mutations: [
        captureMutation({
          mutationId: "11111111-bbbb-4bbb-8bbb-111111111111",
          entityId: "55555555-5555-4555-8555-555555555555",
          baseVersion: null,
        }),
        conceptMutation({
          mutationId: "22222222-bbbb-4bbb-8bbb-222222222222",
          entityId: "66666666-6666-4666-8666-666666666666",
          baseVersion: null,
        }),
      ],
    });
    await processPush(store, {
      workspaceId: otherWorkspaceId,
      deviceId,
      mutations: [
        captureMutation({
          mutationId: "33333333-bbbb-4bbb-8bbb-333333333333",
          entityId: "77777777-7777-4777-8777-777777777777",
          baseVersion: null,
        }),
      ],
    });

    const firstPage = await app.inject({
      method: "GET",
      url: `/api/sync/pull?workspaceId=${workspaceId}&cursor=0&limit=1`,
      headers: authHeaders(),
    });
    const secondPage = await app.inject({
      method: "GET",
      url: `/api/sync/pull?workspaceId=${workspaceId}&cursor=${firstPage.json().nextCursor}&limit=10`,
      headers: authHeaders(),
    });

    expect(firstPage.json()).toMatchObject({ hasMore: true });
    expect(typeof firstPage.json().changes[0].sequence).toBe("string");
    expect(secondPage.json().changes).toHaveLength(1);
    expect(
      [firstPage.json(), secondPage.json()]
        .flatMap((response) => response.changes)
        .every((change) =>
          change.entityType === "workspaceKnowledgeReset"
            ? change.reset.workspaceId === workspaceId
            : change.entity.workspaceId === workspaceId,
        ),
    ).toBe(true);
  });

  it("resets workspace knowledge behind auth, keeps workspace, and emits pull reset event", async () => {
    const store = new InMemorySyncStore([workspaceId, otherWorkspaceId]);
    const app = createVinemaApiServer({ store, apiKey });
    const captureId = "55555555-5555-4555-8555-555555555555";
    const conceptId = "66666666-6666-4666-8666-666666666666";
    const relationId = "77777777-7777-4777-8777-777777777777";

    await processPush(store, {
      workspaceId,
      deviceId,
      mutations: [
        captureMutation({
          mutationId: "11111111-eeee-4eee-8eee-111111111111",
          entityId: captureId,
          baseVersion: null,
        }),
        conceptMutation({
          mutationId: "22222222-eeee-4eee-8eee-222222222222",
          entityId: conceptId,
          baseVersion: null,
        }),
        relationMutation({
          mutationId: "33333333-eeee-4eee-8eee-333333333333",
          entityId: relationId,
          captureId,
          conceptId,
          baseVersion: null,
        }),
      ],
    });

    const unauthorized = await app.inject({
      method: "POST",
      url: "/api/knowledge/reset",
      payload: { workspaceId, confirmation: "VACIAR" },
    });
    const wrongConfirmation = await app.inject({
      method: "POST",
      url: "/api/knowledge/reset",
      headers: authHeaders(),
      payload: { workspaceId, confirmation: "BORRAR" },
    });
    const reset = await app.inject({
      method: "POST",
      url: "/api/knowledge/reset",
      headers: authHeaders(),
      payload: { workspaceId, confirmation: "VACIAR" },
    });
    const secondReset = await app.inject({
      method: "POST",
      url: "/api/knowledge/reset",
      headers: authHeaders(),
      payload: { workspaceId, confirmation: "VACIAR" },
    });
    const pullReset = await app.inject({
      method: "GET",
      url: `/api/sync/pull?workspaceId=${workspaceId}&cursor=3&limit=10`,
      headers: authHeaders(),
    });

    expect(unauthorized.statusCode).toBe(401);
    expect(wrongConfirmation.statusCode).toBe(400);
    expect(reset.statusCode).toBe(200);
    expect(reset.json()).toMatchObject({
      workspaceId,
      deleted: {
        captures: 1,
        concepts: 1,
        relations: 1,
      },
    });
    expect(secondReset.statusCode).toBe(200);
    expect(secondReset.json().deleted).toEqual({
      captures: 0,
      concepts: 0,
      relations: 0,
    });
    expect(store.workspaces.has(workspaceId)).toBe(true);
    expect(store.captures.size).toBe(0);
    expect(store.concepts.size).toBe(0);
    expect(store.captureConcepts.size).toBe(0);
    expect(pullReset.json().changes).toContainEqual(
      expect.objectContaining({
        entityType: "workspaceKnowledgeReset",
        operation: "reset",
        reset: expect.objectContaining({ workspaceId }),
      }),
    );
  });

  it("validates invalid uuid, invalid dates, content length, batch size and unknown entities", async () => {
    const app = createVinemaApiServer({
      store: new InMemorySyncStore([workspaceId]),
      apiKey,
    });
    const invalidUuid = await app.inject({
      method: "POST",
      url: "/api/sync/push",
      headers: authHeaders(),
      payload: { workspaceId: "bad", deviceId, mutations: [] },
    });
    const invalidDate = await push(app, [
      captureMutation({
        mutationId: "11111111-cccc-4ccc-8ccc-111111111111",
        entityId: "55555555-5555-4555-8555-555555555555",
        baseVersion: null,
        createdAt: "bad-date",
      }),
    ]);
    const tooLarge = await push(app, [
      captureMutation({
        mutationId: "22222222-cccc-4ccc-8ccc-222222222222",
        entityId: "55555555-5555-4555-8555-555555555555",
        baseVersion: null,
        content: "x".repeat(50_001),
      }),
    ]);
    const tooMany = await app.inject({
      method: "POST",
      url: "/api/sync/push",
      headers: authHeaders(),
      payload: {
        workspaceId,
        deviceId,
        mutations: Array.from({ length: 101 }, (_, index) =>
          captureMutation({
            mutationId: crypto.randomUUID(),
            entityId: crypto.randomUUID(),
            baseVersion: null,
            content: String(index),
          }),
        ),
      },
    });
    const unknownEntity = await app.inject({
      method: "POST",
      url: "/api/sync/push",
      headers: authHeaders(),
      payload: {
        workspaceId,
        deviceId,
        mutations: [{ entityType: "unknown" }],
      },
    });

    expect(invalidUuid.statusCode).toBe(400);
    expect(invalidDate.statusCode).toBe(400);
    expect(tooLarge.statusCode).toBe(400);
    expect(tooMany.statusCode).toBe(400);
    expect(unknownEntity.statusCode).toBe(400);
  });

  it("maps local and remote entities without requests", () => {
    const node = makeNode();
    const context = makeContext();
    const relation = makeRelation(node.id, context.id);

    expect(
      mapLocalNodeToCaptureMutation({
        mutationId: "11111111-dddd-4ddd-8ddd-111111111111",
        node,
        baseVersion: null,
      }),
    ).toMatchObject({ entityType: "capture", entityId: node.id });
    expect(
      mapLocalContextToConceptMutation({
        mutationId: "22222222-dddd-4ddd-8ddd-222222222222",
        context,
        baseVersion: null,
      }),
    ).toMatchObject({ entityType: "concept", entityId: context.id });
    expect(
      mapLocalRelationToCaptureConceptMutation({
        mutationId: "33333333-dddd-4ddd-8ddd-333333333333",
        relation,
        baseVersion: null,
      }),
    ).toMatchObject({ entityType: "captureConcept", entityId: relation.id });
    expect(mapRemoteCaptureToLocalNode({
      id: node.id,
      workspaceId,
      content: "Remoto",
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      version: 2,
    }, deviceId)).toMatchObject({ id: node.id, content: "Remoto", version: 2 });
    expect(mapRemoteConceptToLocalContext({
      id: context.id,
      workspaceId,
      label: "Rare Carbon",
      normalizedKey: "carbon|rare",
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      mergedIntoId: null,
      version: 1,
    })).toMatchObject({ id: context.id, name: "Rare Carbon" });
  });
});

function authHeaders() {
  return { Authorization: `Bearer ${apiKey}` };
}

function push(app: ReturnType<typeof createVinemaApiServer>, mutations: unknown[]) {
  return app.inject({
    method: "POST",
    url: "/api/sync/push",
    headers: authHeaders(),
    payload: { workspaceId, deviceId, mutations },
  });
}

function captureMutation({
  mutationId,
  entityId,
  baseVersion,
  content = "Texto de captura",
  createdAt = now,
  archivedAt = null,
}: {
  mutationId: string;
  entityId: string;
  baseVersion: number | null;
  content?: string;
  createdAt?: string;
  archivedAt?: string | null;
}) {
  return {
    mutationId,
    entityType: "capture" as const,
    operation: "upsert" as const,
    entityId,
    baseVersion,
    payload: {
      content,
      createdAt,
      updatedAt: now,
      archivedAt,
    },
  };
}

function conceptMutation({
  mutationId,
  entityId,
  baseVersion,
  archivedAt = null,
}: {
  mutationId: string;
  entityId: string;
  baseVersion: number | null;
  archivedAt?: string | null;
}) {
  return {
    mutationId,
    entityType: "concept" as const,
    operation: "upsert" as const,
    entityId,
    baseVersion,
    payload: {
      label: "Rare Carbon",
      normalizedKey: "carbon|rare",
      createdAt: now,
      updatedAt: now,
      archivedAt,
      mergedIntoId: null,
    },
  };
}

function relationMutation({
  mutationId,
  entityId,
  captureId,
  conceptId,
  baseVersion,
}: {
  mutationId: string;
  entityId: string;
  captureId: string;
  conceptId: string;
  baseVersion: number | null;
}) {
  return {
    mutationId,
    entityType: "captureConcept" as const,
    operation: "upsert" as const,
    entityId,
    baseVersion,
    payload: {
      captureId,
      conceptId,
      source: "USER_CONFIRMED" as const,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    },
  };
}

function makeNode(): Node {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    workspaceId,
    type: "NOTE",
    content: "Texto local",
    status: "ACTIVE",
    organizationStatus: "ORGANIZED",
    metadata: {},
    version: 1,
    createdAt: now,
    contentUpdatedAt: now,
    archivedAt: null,
    restoredAt: null,
    updatedAt: now,
    deletedAt: null,
    createdByDeviceId: deviceId,
    lastModifiedByDeviceId: deviceId,
  };
}

function makeContext(): Context {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    workspaceId,
    type: "AREA",
    name: "Rare Carbon",
    description: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
}

function makeRelation(nodeId: string, contextId: string): NodeContextRelation {
  return {
    id: "77777777-7777-4777-8777-777777777777",
    workspaceId,
    nodeId,
    contextId,
    version: 1,
    createdAt: now,
  };
}
