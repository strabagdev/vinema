import {
  type PullResponse,
  type PushResponse,
} from "@vinema/sync-contracts";

const apiUrl = process.env.VINEMA_API_URL;
const apiKey = process.env.VINEMA_SYNC_API_KEY;
const workspaceId = process.env.VINEMA_TEST_WORKSPACE_ID;

if (!apiUrl || !apiKey || !workspaceId) {
  throw new Error(
    "VINEMA_API_URL, VINEMA_SYNC_API_KEY and VINEMA_TEST_WORKSPACE_ID are required.",
  );
}

const now = new Date().toISOString();
const runLabel = `E2E_RAILWAY_${now.replace(/[^0-9]/g, "")}`;
const deviceId = crypto.randomUUID();
const captureId = crypto.randomUUID();
const conceptId = crypto.randomUUID();
const relationId = crypto.randomUUID();
const captureMutationId = crypto.randomUUID();
const conceptMutationId = crypto.randomUUID();
const relationMutationId = crypto.randomUUID();
const captureUpdateMutationId = crypto.randomUUID();
const captureArchiveMutationId = crypto.randomUUID();
const conceptArchiveMutationId = crypto.randomUUID();
const relationArchiveMutationId = crypto.randomUUID();

async function main() {
  const health = await fetch(`${apiUrl}/api/health`);
  assert(health.ok, "health failed");
  const healthBody = (await health.json()) as { database?: string };
  assert(healthBody.database === "connected", "database is not connected");

  await expectUnauthorizedRequests();

  const firstPush = await push([
    {
      mutationId: captureMutationId,
      entityType: "capture",
      operation: "upsert",
      entityId: captureId,
      baseVersion: null,
      payload: {
        content: `${runLabel} Captura de prueba de sincronizacion Vinema.`,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      },
    },
    {
      mutationId: conceptMutationId,
      entityType: "concept",
      operation: "upsert",
      entityId: conceptId,
      baseVersion: null,
      payload: {
        label: `${runLabel} Prueba Sync`,
        normalizedKey: runLabel.toLowerCase(),
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        mergedIntoId: null,
      },
    },
    {
      mutationId: relationMutationId,
      entityType: "captureConcept",
      operation: "upsert",
      entityId: relationId,
      baseVersion: null,
      payload: {
        captureId,
        conceptId,
        source: "USER_CONFIRMED",
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      },
    },
  ]);
  assert(firstPush.accepted.length === 3, "initial push did not accept all mutations");

  const pullResponse = await pull("0");
  assert(pullResponse.changes.length >= 3, "pull did not return pushed changes");
  assert(
    pullResponse.changes.some((change) => change.entity.id === captureId),
    "pull did not return the test capture",
  );
  const cursorAfterFirstPush = pullResponse.nextCursor;

  const idempotentPush = await push([
    {
      mutationId: captureMutationId,
      entityType: "capture",
      operation: "upsert",
      entityId: captureId,
      baseVersion: null,
      payload: {
        content: `${runLabel} Captura de prueba de sincronizacion Vinema.`,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      },
    },
  ]);
  assert(idempotentPush.accepted[0]?.version === 1, "idempotency changed version");
  const afterIdempotencyPull = await pull(cursorAfterFirstPush);
  assert(
    afterIdempotencyPull.changes.length === 0,
    "idempotency created duplicate changes",
  );

  const updatePush = await push([
    {
      mutationId: captureUpdateMutationId,
      entityType: "capture",
      operation: "upsert",
      entityId: captureId,
      baseVersion: 1,
      payload: {
        content: `${runLabel} Captura de prueba de sincronizacion Vinema actualizada.`,
        createdAt: now,
        updatedAt: new Date().toISOString(),
        archivedAt: null,
      },
    },
  ]);
  assert(updatePush.accepted[0]?.version === 2, "capture update did not advance version");

  const conflict = await push([
    {
      mutationId: crypto.randomUUID(),
      entityType: "capture",
      operation: "upsert",
      entityId: captureId,
      baseVersion: 1,
      payload: {
        content: "Conflicto esperado.",
        createdAt: now,
        updatedAt: new Date().toISOString(),
        archivedAt: null,
      },
    },
  ]);
  assert(conflict.conflicts.length === 1, "conflict was not reported");
  assert(conflict.accepted.length === 0, "conflict mutation was accepted");
  assert(
    conflict.conflicts[0]?.reason === "VERSION_CONFLICT",
    "conflict reason was not VERSION_CONFLICT",
  );
  assert(
    getServerEntityVersion(conflict.conflicts[0]?.serverEntity) === 2,
    "conflict did not return the current server entity",
  );

  await archiveTestRecords();

  console.log("Sync API Railway integration test passed.");
}

async function push(mutations: unknown[]): Promise<PushResponse> {
  const response = await fetch(`${apiUrl}/api/sync/push`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ workspaceId, deviceId, mutations }),
  });

  assert(response.ok, `push failed with ${response.status}`);
  return response.json() as Promise<PushResponse>;
}

async function pull(cursor: string): Promise<PullResponse> {
  const response = await fetch(
    `${apiUrl}/api/sync/pull?workspaceId=${workspaceId}&cursor=${cursor}&limit=100`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );

  assert(response.ok, `pull failed with ${response.status}`);
  return response.json() as Promise<PullResponse>;
}

async function expectUnauthorizedRequests() {
  const withoutKey = await fetch(`${apiUrl}/api/sync/push`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, deviceId, mutations: [] }),
  });
  assert(withoutKey.status === 401, "push without API key did not fail with 401");

  const wrongKey = await fetch(
    `${apiUrl}/api/sync/pull?workspaceId=${workspaceId}&cursor=0&limit=1`,
    { headers: { Authorization: "Bearer E2E_RAILWAY_WRONG_KEY" } },
  );
  assert(wrongKey.status === 401, "pull with wrong API key did not fail with 401");
}

async function archiveTestRecords() {
  const archivedAt = new Date().toISOString();
  const archivePush = await push([
    {
      mutationId: relationArchiveMutationId,
      entityType: "captureConcept",
      operation: "upsert",
      entityId: relationId,
      baseVersion: 1,
      payload: {
        captureId,
        conceptId,
        source: "USER_CONFIRMED",
        createdAt: now,
        updatedAt: archivedAt,
        archivedAt,
      },
    },
    {
      mutationId: conceptArchiveMutationId,
      entityType: "concept",
      operation: "upsert",
      entityId: conceptId,
      baseVersion: 1,
      payload: {
        label: `${runLabel} Prueba Sync`,
        normalizedKey: runLabel.toLowerCase(),
        createdAt: now,
        updatedAt: archivedAt,
        archivedAt,
        mergedIntoId: null,
      },
    },
    {
      mutationId: captureArchiveMutationId,
      entityType: "capture",
      operation: "upsert",
      entityId: captureId,
      baseVersion: 2,
      payload: {
        content: `${runLabel} Captura de prueba de sincronizacion Vinema actualizada.`,
        createdAt: now,
        updatedAt: archivedAt,
        archivedAt,
      },
    },
  ]);

  assert(archivePush.accepted.length === 3, "test records were not archived");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function getServerEntityVersion(serverEntity: unknown) {
  if (
    typeof serverEntity === "object" &&
    serverEntity !== null &&
    "version" in serverEntity &&
    typeof serverEntity.version === "number"
  ) {
    return serverEntity.version;
  }

  return null;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
