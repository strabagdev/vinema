import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import type {
  LoginResponse,
  PullResponse,
  PushResponse,
  RegisterResponse,
} from "@vinema/sync-contracts";

loadLocalEnvFile(".env");
loadLocalEnvFile(".env.local");

const apiUrl = process.env.VINEMA_API_URL;

if (!apiUrl) {
  throw new Error("VINEMA_API_URL is required.");
}

const now = new Date().toISOString();
const runLabel = `E2E_AUTH_SYNC_${now.replace(/[^0-9]/g, "")}`;
const deviceId = crypto.randomUUID();
const captureId = crypto.randomUUID();
const conceptId = crypto.randomUUID();
const relationId = crypto.randomUUID();

async function main() {
  const health = await fetch(`${apiUrl}/api/health`);
  assert(health.ok, "health failed");
  const healthBody = (await health.json()) as { database?: string };
  assert(healthBody.database === "connected", "database is not connected");

  const passwordA = `temporary-${crypto.randomUUID()}-password`;
  const passwordB = `temporary-${crypto.randomUUID()}-password`;
  const userA = await register(`${runLabel.toLowerCase()}-a@example.test`, passwordA);
  const userB = await register(`${runLabel.toLowerCase()}-b@example.test`, passwordB);
  const loginA = await login(userA.user.email, passwordA);
  assert(loginA.workspaceId === userA.workspaceId, "login workspace mismatch");

  const session = await getSession(loginA.accessToken);
  assert(session.workspaceId === userA.workspaceId, "session workspace mismatch");

  await expectUnauthorizedRequests(userA.workspaceId);

  const firstPush = await push(userA.accessToken, userA.workspaceId, [
    captureMutation(crypto.randomUUID(), captureId, null),
    conceptMutation(crypto.randomUUID(), conceptId, null),
    relationMutation(crypto.randomUUID(), relationId, captureId, conceptId, null),
  ]);
  assert(firstPush.accepted.length === 3, "initial push did not accept all mutations");

  const pullResponse = await pull(userA.accessToken, userA.workspaceId, "0");
  assert(pullResponse.changes.length >= 3, "pull did not return pushed changes");
  assert(
    pullResponse.changes.some((change) => change.entity.id === captureId),
    "pull did not return the test capture",
  );
  const cursorAfterFirstPush = pullResponse.nextCursor;

  const idempotentPush = await push(userA.accessToken, userA.workspaceId, [
    captureMutation(firstPush.accepted[0]!.mutationId, captureId, null),
  ]);
  assert(idempotentPush.accepted[0]?.version === 1, "idempotency changed version");
  const afterIdempotencyPull = await pull(
    userA.accessToken,
    userA.workspaceId,
    cursorAfterFirstPush,
  );
  assert(
    afterIdempotencyPull.changes.length === 0,
    "idempotency created duplicate changes",
  );

  const updatePush = await push(userA.accessToken, userA.workspaceId, [
    captureMutation(
      crypto.randomUUID(),
      captureId,
      1,
      `${runLabel} Captura actualizada.`,
    ),
  ]);
  assert(updatePush.accepted[0]?.version === 2, "capture update did not advance version");

  const conflict = await push(userA.accessToken, userA.workspaceId, [
    captureMutation(crypto.randomUUID(), captureId, 1, "Conflicto esperado."),
  ]);
  assert(conflict.conflicts.length === 1, "conflict was not reported");
  assert(conflict.accepted.length === 0, "conflict mutation was accepted");

  await expectForbiddenWorkspace(userA.accessToken, userB.workspaceId);
  const bPull = await pull(userB.accessToken, userB.workspaceId, "0");
  assert(
    bPull.changes.every((change) => change.entity.workspaceId === userB.workspaceId),
    "user B saw user A workspace data",
  );

  console.log("Sync API authenticated integration test passed.");
}

function loadLocalEnvFile(path: string) {
  if (!existsSync(path)) {
    return;
  }

  const variables = parseEnv(readFileSync(path, "utf8"));

  for (const [key, value] of Object.entries(variables)) {
    process.env[key] = value;
  }
}

async function register(email: string, password: string): Promise<RegisterResponse> {
  const response = await fetch(`${apiUrl}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      displayName: "Vinema E2E",
    }),
  });

  assert(response.status === 201, `register failed with ${response.status}`);
  return response.json() as Promise<RegisterResponse>;
}

async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${apiUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: email.toUpperCase(),
      password: "invalid-on-purpose",
    }),
  });
  assert(response.status === 401, "invalid login did not fail");

  const valid = await fetch(`${apiUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.toUpperCase(), password }),
  });
  assert(valid.ok, `valid login failed with ${valid.status}`);
  return valid.json() as Promise<LoginResponse>;
}

async function getSession(accessToken: string) {
  const response = await fetch(`${apiUrl}/auth/session`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  assert(response.ok, `session failed with ${response.status}`);
  return response.json() as Promise<{ workspaceId: string }>;
}

async function push(
  accessToken: string,
  workspaceId: string,
  mutations: unknown[],
): Promise<PushResponse> {
  const response = await fetch(`${apiUrl}/api/sync/push`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ workspaceId, deviceId, mutations }),
  });

  assert(response.ok, `push failed with ${response.status}`);
  return response.json() as Promise<PushResponse>;
}

async function pull(
  accessToken: string,
  workspaceId: string,
  cursor: string,
): Promise<PullResponse> {
  const response = await fetch(
    `${apiUrl}/api/sync/pull?workspaceId=${workspaceId}&cursor=${cursor}&limit=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  assert(response.ok, `pull failed with ${response.status}`);
  return response.json() as Promise<PullResponse>;
}

async function expectUnauthorizedRequests(workspaceId: string) {
  const withoutKey = await fetch(`${apiUrl}/api/sync/push`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, deviceId, mutations: [] }),
  });
  assert(withoutKey.status === 401, "push without token did not fail with 401");

  const wrongKey = await fetch(
    `${apiUrl}/api/sync/pull?workspaceId=${workspaceId}&cursor=0&limit=1`,
    { headers: { Authorization: "Bearer E2E_WRONG_TOKEN" } },
  );
  assert(wrongKey.status === 401, "pull with wrong token did not fail with 401");
}

async function expectForbiddenWorkspace(accessToken: string, workspaceId: string) {
  const forbiddenPush = await fetch(`${apiUrl}/api/sync/push`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ workspaceId, deviceId, mutations: [] }),
  });
  assert(forbiddenPush.status === 403, "cross-workspace push was not forbidden");

  const forbiddenPull = await fetch(
    `${apiUrl}/api/sync/pull?workspaceId=${workspaceId}&cursor=0&limit=1`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  assert(forbiddenPull.status === 403, "cross-workspace pull was not forbidden");
}

function captureMutation(
  mutationId: string,
  entityId: string,
  baseVersion: number | null,
  content = `${runLabel} Captura de prueba autenticada.`,
) {
  return {
    mutationId,
    entityType: "capture",
    operation: "upsert",
    entityId,
    baseVersion,
    payload: { content, createdAt: now, updatedAt: new Date().toISOString(), archivedAt: null },
  };
}

function conceptMutation(mutationId: string, entityId: string, baseVersion: number | null) {
  return {
    mutationId,
    entityType: "concept",
    operation: "upsert",
    entityId,
    baseVersion,
    payload: {
      label: `${runLabel} Auth Sync`,
      normalizedKey: runLabel.toLowerCase(),
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      mergedIntoId: null,
    },
  };
}

function relationMutation(
  mutationId: string,
  entityId: string,
  captureId: string,
  conceptId: string,
  baseVersion: number | null,
) {
  return {
    mutationId,
    entityType: "captureConcept",
    operation: "upsert",
    entityId,
    baseVersion,
    payload: {
      captureId,
      conceptId,
      source: "USER_CONFIRMED",
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    },
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
