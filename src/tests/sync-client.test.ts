import { describe, expect, it, vi } from "vitest";
import { createSyncClient } from "@/features/sync/sync-client";
import type { PushRequest } from "@vinema/sync-contracts";

const baseUrl = "https://api.example.test/";
const accessToken = "test-token";
const workspaceId = "11111111-1111-4111-8111-111111111111";
const deviceId = "22222222-2222-4222-8222-222222222222";
const captureId = "33333333-3333-4333-8333-333333333333";
const mutationId = "44444444-4444-4444-8444-444444444444";
const now = "2026-07-29T12:00:00.000Z";

describe("sync client", () => {
  it("checks health and validates the health response", async () => {
    const fetchFn = mockFetch(jsonResponse({
      status: "ok",
      service: "vinema-api",
      database: "connected",
      timestamp: now,
    }));
    const client = createSyncClient({ baseUrl, accessToken, fetchFn });

    await expect(client.health()).resolves.toMatchObject({
      status: "ok",
      database: "connected",
    });
    expect(fetchFn).toHaveBeenCalledWith(
      new URL("https://api.example.test/api/health"),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("pushes mutations with authorization and JSON headers", async () => {
    const fetchFn = mockFetch(jsonResponse({
      accepted: [
        {
          mutationId,
          entityType: "capture",
          entityId: captureId,
          version: 1,
        },
      ],
      conflicts: [],
      rejected: [],
      serverCursor: "1",
    }));
    const client = createSyncClient({ baseUrl, accessToken, fetchFn });
    const input = makePushRequest();

    await expect(client.push(input)).resolves.toMatchObject({
      accepted: [{ mutationId, entityId: captureId, version: 1 }],
      serverCursor: "1",
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchFn.mock.calls[0] ?? [];
    expect(fetchFn).toHaveBeenCalledWith(
      new URL("https://api.example.test/api/sync/push"),
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
      }),
    );
    expect(JSON.parse(String(requestInit?.body))).toEqual(input);
  });

  it("pulls changes with authorization and the expected query string", async () => {
    const fetchFn = mockFetch(jsonResponse({
      changes: [],
      nextCursor: "12",
      hasMore: false,
    }));
    const client = createSyncClient({ baseUrl, accessToken, fetchFn });

    await expect(
      client.pull({ workspaceId, cursor: "10", limit: 25 }),
    ).resolves.toMatchObject({ nextCursor: "12", hasMore: false });

    expect(fetchFn).toHaveBeenCalledWith(
      new URL(
        "https://api.example.test/api/sync/pull?workspaceId=11111111-1111-4111-8111-111111111111&cursor=10&limit=25",
      ),
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer test-token" },
      }),
    );
  });

  it("omits cursor when pulling without one", async () => {
    const fetchFn = mockFetch(jsonResponse({
      changes: [],
      nextCursor: "0",
      hasMore: false,
    }));
    const client = createSyncClient({ baseUrl, accessToken, fetchFn });

    await client.pull({ workspaceId, limit: 100 });

    expect(fetchFn.mock.calls[0]?.[0].toString()).toBe(
      "https://api.example.test/api/sync/pull?workspaceId=11111111-1111-4111-8111-111111111111&limit=100",
    );
  });

  it("times out requests without retrying", async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    const client = createSyncClient({
      baseUrl,
      accessToken,
      fetchFn,
      timeoutMs: 50,
    });

    const promise = client.health();
    const expectation = expect(promise).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(50);

    await expectation;
    expect(fetchFn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("distinguishes external abort from timeout", async () => {
    const controller = new AbortController();
    const fetchFn = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    const client = createSyncClient({ baseUrl, accessToken, fetchFn });
    const promise = client.health({ signal: controller.signal });

    controller.abort();

    await expect(promise).rejects.toMatchObject({ code: "ABORTED" });
  });

  it("maps network errors without retrying", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed"));
    const client = createSyncClient({ baseUrl, accessToken, fetchFn });

    await expect(client.health()).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("classifies missing fetch as a network error without issuing a request", async () => {
    const client = createSyncClient({
      baseUrl,
      accessToken,
      fetchFn: undefined as unknown as typeof fetch,
    });

    await expect(client.health()).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });

  it("maps 401 and 403 to auth errors", async () => {
    const client401 = createSyncClient({
      baseUrl,
      accessToken,
      fetchFn: mockFetch(apiErrorResponse(401, "UNAUTHORIZED")),
    });
    const client403 = createSyncClient({
      baseUrl,
      accessToken,
      fetchFn: mockFetch(apiErrorResponse(403, "FORBIDDEN")),
    });

    await expect(client401.push(makePushRequest())).rejects.toMatchObject({
      code: "AUTH_ERROR",
      status: 401,
    });
    await expect(client403.push(makePushRequest())).rejects.toMatchObject({
      code: "AUTH_ERROR",
      status: 403,
    });
  });

  it("maps HTTP 409 VERSION_CONFLICT", async () => {
    const client = createSyncClient({
      baseUrl,
      accessToken,
      fetchFn: mockFetch(apiErrorResponse(409, "VERSION_CONFLICT")),
    });

    await expect(client.push(makePushRequest())).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
      status: 409,
    });
  });

  it("keeps normal VERSION_CONFLICT payloads as push responses", async () => {
    const fetchFn = mockFetch(jsonResponse({
      accepted: [],
      conflicts: [
        {
          mutationId,
          entityType: "capture",
          entityId: captureId,
          reason: "VERSION_CONFLICT",
          serverEntity: null,
        },
      ],
      rejected: [],
      serverCursor: "3",
    }));
    const client = createSyncClient({ baseUrl, accessToken, fetchFn });

    await expect(client.push(makePushRequest())).resolves.toMatchObject({
      conflicts: [{ reason: "VERSION_CONFLICT" }],
      accepted: [],
    });
  });

  it("maps 500 responses to server errors", async () => {
    const client = createSyncClient({
      baseUrl,
      accessToken,
      fetchFn: mockFetch(apiErrorResponse(500, "INTERNAL_ERROR")),
    });

    await expect(client.pull({ workspaceId })).rejects.toMatchObject({
      code: "SERVER_ERROR",
      status: 500,
    });
  });

  it("rejects invalid JSON and invalid response shapes", async () => {
    const invalidJsonClient = createSyncClient({
      baseUrl,
      accessToken,
      fetchFn: mockFetch(new Response("not json", { status: 200 })),
    });
    const invalidShapeClient = createSyncClient({
      baseUrl,
      accessToken,
      fetchFn: mockFetch(jsonResponse({ status: "broken" })),
    });

    await expect(invalidJsonClient.health()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
    await expect(invalidShapeClient.health()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("requires a token for push and pull without calling fetch", async () => {
    const fetchFn = mockFetch(jsonResponse({}));
    const client = createSyncClient({ baseUrl, fetchFn });

    await expect(client.push(makePushRequest())).rejects.toMatchObject({
      code: "AUTH_ERROR",
    });
    await expect(client.pull({ workspaceId })).rejects.toMatchObject({
      code: "AUTH_ERROR",
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("validates pull limit through the shared contract before fetching", async () => {
    const fetchFn = mockFetch(jsonResponse({}));
    const client = createSyncClient({ baseUrl, accessToken, fetchFn });

    await expect(client.pull({ workspaceId, limit: 501 })).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

function mockFetch(response: Response) {
  return vi.fn<typeof fetch>().mockResolvedValue(response);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function apiErrorResponse(
  status: number,
  code:
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "VERSION_CONFLICT"
    | "INTERNAL_ERROR",
) {
  return jsonResponse(
    {
      error: {
        code,
        message: "API error",
      },
    },
    status,
  );
}

function makePushRequest(): PushRequest {
  return {
    workspaceId,
    deviceId,
    mutations: [
      {
        mutationId,
        entityType: "capture",
        operation: "upsert",
        entityId: captureId,
        baseVersion: null,
        payload: {
          content: "Captura local",
          createdAt: now,
          updatedAt: now,
          archivedAt: null,
        },
      },
    ],
  };
}
