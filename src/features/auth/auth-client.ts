import {
  authErrorResponseSchema,
  currentSessionResponseSchema,
  loginRequestSchema,
  loginResponseSchema,
  registerRequestSchema,
  registerResponseSchema,
  type AuthErrorCode,
  type CurrentSessionResponse,
  type LoginRequest,
  type LoginResponse,
  type RegisterRequest,
  type RegisterResponse,
} from "@vinema/sync-contracts";

export class AuthClientError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
    public readonly status?: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AuthClientError";
  }
}

export type AuthClient = {
  register(input: RegisterRequest, options?: AuthClientOptions): Promise<RegisterResponse>;
  login(input: LoginRequest, options?: AuthClientOptions): Promise<LoginResponse>;
  getSession(
    accessToken: string,
    options?: AuthClientOptions,
  ): Promise<CurrentSessionResponse>;
};

export type AuthClientOptions = {
  signal?: AbortSignal;
};

export type AuthClientConfig = {
  baseUrl: string;
  fetchFn?: typeof fetch;
  logger?: {
    warn?(message: string, context?: Record<string, unknown>): void;
  };
};

export function createAuthClient({
  baseUrl,
  fetchFn = fetch,
  logger,
}: AuthClientConfig): AuthClient {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  return {
    async register(input, options = {}) {
      const parsed = registerRequestSchema.safeParse(input);
      if (!parsed.success) {
        throw new AuthClientError(
          "VALIDATION_ERROR",
          "La solicitud de registro no es valida.",
          undefined,
          parsed.error.issues,
        );
      }

      const body = await requestJson(fetchFn, buildUrl(normalizedBaseUrl, "/auth/register"), {
        method: "POST",
        signal: options.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const response = registerResponseSchema.safeParse(body);
      if (!response.success) {
        logger?.warn?.("auth register invalid response");
        throw new AuthClientError("UNEXPECTED_ERROR", "Respuesta invalida.");
      }

      return response.data;
    },

    async login(input, options = {}) {
      const parsed = loginRequestSchema.safeParse(input);
      if (!parsed.success) {
        throw new AuthClientError(
          "VALIDATION_ERROR",
          "La solicitud de login no es valida.",
          undefined,
          parsed.error.issues,
        );
      }

      const body = await requestJson(fetchFn, buildUrl(normalizedBaseUrl, "/auth/login"), {
        method: "POST",
        signal: options.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const response = loginResponseSchema.safeParse(body);
      if (!response.success) {
        logger?.warn?.("auth login invalid response");
        throw new AuthClientError("UNEXPECTED_ERROR", "Respuesta invalida.");
      }

      return response.data;
    },

    async getSession(accessToken, options = {}) {
      const body = await requestJson(fetchFn, buildUrl(normalizedBaseUrl, "/auth/session"), {
        method: "GET",
        signal: options.signal,
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const response = currentSessionResponseSchema.safeParse(body);
      if (!response.success) {
        logger?.warn?.("auth session invalid response");
        throw new AuthClientError("UNEXPECTED_ERROR", "Respuesta invalida.");
      }

      return response.data;
    },
  };
}

async function requestJson(
  fetchFn: typeof fetch,
  url: URL,
  init: RequestInit,
) {
  let response: Response;
  try {
    response = await fetchFn(url, init);
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new AuthClientError(
      "NETWORK_ERROR",
      "No se pudo conectar con la API de autenticacion.",
    );
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = authErrorResponseSchema.safeParse(body);
    if (parsed.success) {
      throw new AuthClientError(
        parsed.data.error.code,
        parsed.data.error.message,
        response.status,
        parsed.data.error.details,
      );
    }

    throw new AuthClientError(
      response.status >= 500 ? "SERVER_ERROR" : "UNEXPECTED_ERROR",
      "La solicitud de autenticacion fallo.",
      response.status,
    );
  }

  return body;
}

function normalizeBaseUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url;
}

function buildUrl(baseUrl: URL, path: string) {
  return new URL(`${baseUrl.pathname}${path}`, baseUrl);
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
