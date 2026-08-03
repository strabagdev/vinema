import {
  pullRequestSchema,
  pullResponseSchema,
  pushRequestSchema,
  pushResponseSchema,
  syncErrorSchema,
  type PullRequest,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  type SyncError,
} from "@vinema/sync-contracts";
import type { AccessTokenProvider } from "@/features/auth/access-token-provider";

export const DEFAULT_SYNC_CLIENT_TIMEOUT_MS = 10_000;

export type SyncClientErrorCode =
  | "AUTH_ERROR"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "ABORTED"
  | "VERSION_CONFLICT"
  | "SERVER_ERROR"
  | "INVALID_RESPONSE"
  | "INVALID_REQUEST"
  | "UNKNOWN_ERROR";

export type SyncClientErrorOptions = {
  code: SyncClientErrorCode;
  message: string;
  status?: number;
  details?: unknown;
  cause?: unknown;
};

export class SyncClientError extends Error {
  readonly code: SyncClientErrorCode;
  readonly status: number | undefined;
  readonly details: unknown;

  constructor({ code, message, status, details, cause }: SyncClientErrorOptions) {
    super(message, { cause });
    this.name = "SyncClientError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type SyncHealthResponse = {
  status: "ok";
  service?: string;
  database?: "connected" | "unavailable";
  timestamp?: string;
};

export type SyncClient = {
  health(input?: SyncClientRequestOptions): Promise<SyncHealthResponse>;
  push(input: SyncClientPushInput): Promise<PushResponse>;
  pull(input: SyncClientPullInput): Promise<PullResponse>;
};

export type SyncClientConfig = {
  baseUrl: string;
  accessToken?: string | null;
  accessTokenProvider?: AccessTokenProvider;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
};

export type SyncClientRequestOptions = {
  signal?: AbortSignal;
};

export type SyncClientPushInput = PushRequest & SyncClientRequestOptions;
export type SyncClientPullInput = {
  workspaceId: PullRequest["workspaceId"];
  cursor?: PullRequest["cursor"];
  limit?: PullRequest["limit"];
} & SyncClientRequestOptions;

type RequestOptions = RequestInit & {
  signal?: AbortSignal;
};

export function createSyncClient({
  baseUrl,
  accessToken,
  accessTokenProvider,
  timeoutMs = DEFAULT_SYNC_CLIENT_TIMEOUT_MS,
  fetchFn = fetch,
}: SyncClientConfig): SyncClient {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  return {
    async health(input = {}) {
      const response = await request({
        fetchFn,
        timeoutMs,
        url: buildUrl(normalizedBaseUrl, "/api/health"),
        signal: input.signal,
      });
      const body = await readJson(response);

      return parseHealthResponse(body);
    },

    async push(input) {
      const token = resolveAccessToken(accessToken, accessTokenProvider);
      const { signal, ...requestBody } = input;
      const parsedInput = pushRequestSchema.safeParse(requestBody);

      if (!parsedInput.success) {
        throw new SyncClientError({
          code: "INVALID_REQUEST",
          message: "La solicitud push no cumple el contrato de sincronizacion.",
          details: parsedInput.error.issues,
        });
      }

      const response = await request({
        fetchFn,
        timeoutMs,
        url: buildUrl(normalizedBaseUrl, "/api/sync/push"),
        signal,
        init: {
          method: "POST",
          headers: authorizedJsonHeaders(token),
          body: JSON.stringify(parsedInput.data),
        },
      });
      const body = await readJson(response);
      const parsed = pushResponseSchema.safeParse(body);

      if (!parsed.success) {
        throw invalidResponse(parsed.error.issues);
      }

      return parsed.data;
    },

    async pull(input) {
      const token = resolveAccessToken(accessToken, accessTokenProvider);
      const { signal, ...queryInput } = input;
      const parsedInput = pullRequestSchema.safeParse(queryInput);

      if (!parsedInput.success) {
        throw new SyncClientError({
          code: "INVALID_REQUEST",
          message: "La solicitud pull no cumple el contrato de sincronizacion.",
          details: parsedInput.error.issues,
        });
      }

      const url = buildPullUrl(normalizedBaseUrl, queryInput);
      const response = await request({
        fetchFn,
        timeoutMs,
        url,
        signal,
        init: {
          method: "GET",
          headers: authorizationHeaders(token),
        },
      });
      const body = await readJson(response);
      const parsed = pullResponseSchema.safeParse(body);

      if (!parsed.success) {
        throw invalidResponse(parsed.error.issues);
      }

      return parsed.data;
    },
  };
}

async function request({
  fetchFn,
  timeoutMs,
  url,
  signal,
  init,
}: {
  fetchFn: typeof fetch;
  timeoutMs: number;
  url: URL;
  signal?: AbortSignal;
  init?: RequestOptions;
}) {
  if (typeof fetchFn !== "function") {
    throw new SyncClientError({
      code: "NETWORK_ERROR",
      message: "Fetch no esta disponible para sincronizar.",
    });
  }

  const controller = new AbortController();
  let timedOut = false;
  let externallyAborted = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abortFromExternalSignal = () => {
    externallyAborted = true;
    controller.abort(signal?.reason);
  };

  if (signal?.aborted) {
    clearTimeout(timeout);
    throw new SyncClientError({
      code: "ABORTED",
      message: "La solicitud de sincronizacion fue cancelada.",
    });
  }

  signal?.addEventListener("abort", abortFromExternalSignal, { once: true });

  try {
    const response = await fetchFn(url, {
      ...init,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw await httpError(response);
    }

    return response;
  } catch (error) {
    if (error instanceof SyncClientError) {
      throw error;
    }

    if (timedOut) {
      throw new SyncClientError({
        code: "TIMEOUT",
        message: "La solicitud de sincronizacion excedio el tiempo limite.",
        cause: error,
      });
    }

    if (externallyAborted) {
      throw new SyncClientError({
        code: "ABORTED",
        message: "La solicitud de sincronizacion fue cancelada.",
        cause: error,
      });
    }

    if (error instanceof TypeError) {
      throw new SyncClientError({
        code: "NETWORK_ERROR",
        message: "No se pudo conectar con la API de sincronizacion.",
        cause: error,
      });
    }

    throw new SyncClientError({
      code: "UNKNOWN_ERROR",
      message: "La solicitud de sincronizacion fallo.",
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromExternalSignal);
  }
}

async function httpError(response: Response) {
  const body = await readJson(response).catch(() => null);
  const parsed = syncErrorSchema.safeParse(body);
  const apiError: SyncError["error"] | null = parsed.success
    ? parsed.data.error
    : null;
  const code = mapHttpErrorCode(response.status, apiError?.code);

  return new SyncClientError({
    code,
    status: response.status,
    message: apiError?.message ?? defaultErrorMessage(code),
    details: apiError?.details ?? body,
  });
}

function mapHttpErrorCode(
  status: number,
  apiCode?: SyncError["error"]["code"],
): SyncClientErrorCode {
  if (status === 401 || status === 403 || apiCode === "UNAUTHORIZED" || apiCode === "FORBIDDEN") {
    return "AUTH_ERROR";
  }

  if (status === 409 || apiCode === "VERSION_CONFLICT") {
    return "VERSION_CONFLICT";
  }

  if (status >= 500) {
    return "SERVER_ERROR";
  }

  if (apiCode === "INVALID_REQUEST") {
    return "INVALID_REQUEST";
  }

  return "UNKNOWN_ERROR";
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch (error) {
    throw invalidResponse(undefined, error);
  }
}

function parseHealthResponse(body: unknown): SyncHealthResponse {
  if (!body || typeof body !== "object") {
    throw invalidResponse();
  }

  const candidate = body as Partial<SyncHealthResponse>;

  if (candidate.status !== "ok") {
    throw invalidResponse();
  }

  if (
    candidate.database !== undefined &&
    candidate.database !== "connected" &&
    candidate.database !== "unavailable"
  ) {
    throw invalidResponse();
  }

  return candidate as SyncHealthResponse;
}

function invalidResponse(details?: unknown, cause?: unknown) {
  return new SyncClientError({
    code: "INVALID_RESPONSE",
    message: "La API de sincronizacion devolvio una respuesta invalida.",
    details,
    cause,
  });
}

function resolveAccessToken(
  accessToken: string | null | undefined,
  accessTokenProvider: AccessTokenProvider | undefined,
) {
  const token = accessTokenProvider?.getAccessToken() ?? accessToken;
  assertToken(token);
  return token;
}

function assertToken(token: string | null | undefined): asserts token is string {
  if (!token) {
    throw new SyncClientError({
      code: "AUTH_ERROR",
      message: "La credencial de sincronizacion es requerida.",
    });
  }
}

function authorizedJsonHeaders(token: string) {
  return {
    ...authorizationHeaders(token),
    "Content-Type": "application/json",
  };
}

function authorizationHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

function buildPullUrl(
  baseUrl: string,
  input: Omit<SyncClientPullInput, "signal">,
) {
  const url = buildUrl(baseUrl, "/api/sync/pull");
  url.searchParams.set("workspaceId", input.workspaceId);

  if (input.cursor !== undefined) {
    url.searchParams.set("cursor", input.cursor);
  }

  if (input.limit !== undefined) {
    url.searchParams.set("limit", String(input.limit));
  }

  return url;
}

function buildUrl(baseUrl: string, path: string) {
  return new URL(path, `${baseUrl}/`);
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function defaultErrorMessage(code: SyncClientErrorCode) {
  if (code === "AUTH_ERROR") {
    return "La API de sincronizacion rechazo la credencial.";
  }

  if (code === "VERSION_CONFLICT") {
    return "La API de sincronizacion reporto un conflicto de version.";
  }

  if (code === "SERVER_ERROR") {
    return "La API de sincronizacion no pudo procesar la solicitud.";
  }

  return "La solicitud de sincronizacion fallo.";
}
