import {
  authErrorResponseSchema,
  currentSessionResponseSchema,
  currentDeviceResponseSchema,
  loginRequestSchema,
  loginResponseSchema,
  logoutRequestSchema,
  logoutResponseSchema,
  refreshSessionRequestSchema,
  refreshSessionResponseSchema,
  registerRequestSchema,
  registerResponseSchema,
  type AuthErrorCode,
  type CurrentSessionResponse,
  type CurrentDeviceResponse,
  type LoginRequest,
  type LoginResponse,
  type LogoutRequest,
  type LogoutResponse,
  type RefreshSessionRequest,
  type RefreshSessionResponse,
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
  refresh(
    input: RefreshSessionRequest,
    options?: AuthClientOptions,
  ): Promise<RefreshSessionResponse>;
  logout(input: LogoutRequest, options?: AuthClientOptions): Promise<LogoutResponse>;
  getSession(
    accessToken: string,
    options?: AuthClientOptions,
  ): Promise<CurrentSessionResponse>;
  getCurrentDevice(
    accessToken: string,
    options?: AuthClientOptions,
  ): Promise<CurrentDeviceResponse>;
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

      const body = await requestJson(
        fetchFn,
        buildUrl(normalizedBaseUrl, "/auth/register"),
        {
          method: "POST",
          signal: options.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        },
        logger,
      );
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

      const body = await requestJson(
        fetchFn,
        buildUrl(normalizedBaseUrl, "/auth/login"),
        {
          method: "POST",
          signal: options.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        },
        logger,
      );
      const response = loginResponseSchema.safeParse(body);
      if (!response.success) {
        logger?.warn?.("auth login invalid response");
        throw new AuthClientError("UNEXPECTED_ERROR", "Respuesta invalida.");
      }

      return response.data;
    },

    async refresh(input, options = {}) {
      const parsed = refreshSessionRequestSchema.safeParse(input);
      if (!parsed.success) {
        throw new AuthClientError(
          "VALIDATION_ERROR",
          "La solicitud de refresh no es valida.",
          undefined,
          parsed.error.issues,
        );
      }

      const body = await requestJson(
        fetchFn,
        buildUrl(normalizedBaseUrl, "/auth/refresh"),
        {
          method: "POST",
          signal: options.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        },
        logger,
      );
      const response = refreshSessionResponseSchema.safeParse(body);
      if (!response.success) {
        logger?.warn?.("auth refresh invalid response");
        throw new AuthClientError("UNEXPECTED_ERROR", "Respuesta invalida.");
      }

      return response.data;
    },

    async logout(input, options = {}) {
      const parsed = logoutRequestSchema.safeParse(input);
      if (!parsed.success) {
        throw new AuthClientError(
          "VALIDATION_ERROR",
          "La solicitud de logout no es valida.",
          undefined,
          parsed.error.issues,
        );
      }

      const body = await requestJson(
        fetchFn,
        buildUrl(normalizedBaseUrl, "/auth/logout"),
        {
          method: "POST",
          signal: options.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        },
        logger,
      );
      const response = logoutResponseSchema.safeParse(body);
      if (!response.success) {
        logger?.warn?.("auth logout invalid response");
        throw new AuthClientError("UNEXPECTED_ERROR", "Respuesta invalida.");
      }

      return response.data;
    },

    async getSession(accessToken, options = {}) {
      const body = await requestJson(
        fetchFn,
        buildUrl(normalizedBaseUrl, "/auth/session"),
        {
          method: "GET",
          signal: options.signal,
          headers: { Authorization: `Bearer ${accessToken}` },
        },
        logger,
      );
      const response = currentSessionResponseSchema.safeParse(body);
      if (!response.success) {
        logger?.warn?.("auth session invalid response");
        throw new AuthClientError("UNEXPECTED_ERROR", "Respuesta invalida.");
      }

      return response.data;
    },

    async getCurrentDevice(accessToken, options = {}) {
      const body = await requestJson(
        fetchFn,
        buildUrl(normalizedBaseUrl, "/auth/device"),
        {
          method: "GET",
          signal: options.signal,
          headers: { Authorization: `Bearer ${accessToken}` },
        },
        logger,
      );
      const response = currentDeviceResponseSchema.safeParse(body);
      if (!response.success) {
        logger?.warn?.("auth device invalid response");
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
  logger: AuthClientConfig["logger"],
) {
  let response: Response;
  try {
    response = await fetchFn(url, init);
  } catch (error) {
    logger?.warn?.("auth request network failure", {
      url: safeUrlForLog(url),
      error: error instanceof Error ? error.name : "Unknown",
    });
    throw new AuthClientError(
      "NETWORK_ERROR",
      "No se pudo establecer conexion con la API.",
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

    logger?.warn?.("auth request failed without valid error body", {
      url: safeUrlForLog(url),
      status: response.status,
    });
    throw new AuthClientError(
      response.status >= 500 ? "SERVER_ERROR" : "UNEXPECTED_ERROR",
      "La solicitud de autenticacion fallo.",
      response.status,
    );
  }

  return body;
}

function normalizeBaseUrl(baseUrl: string) {
  const value = baseUrl.trim();
  if (!value) {
    throw new AuthClientError("VALIDATION_ERROR", "La URL de la API no es valida.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new AuthClientError(
      "VALIDATION_ERROR",
      "La URL de la API no es valida.",
      undefined,
      error,
    );
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AuthClientError("VALIDATION_ERROR", "La URL de la API no es valida.");
  }

  if (url.hostname === "auth") {
    throw new AuthClientError("VALIDATION_ERROR", "La URL de la API no es valida.");
  }

  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";

  return url.toString().replace(/\/+$/, "");
}

function buildUrl(baseUrl: string, path: string) {
  const normalizedBase = baseUrl.trim().replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${normalizedBase}${normalizedPath}`);

  if (url.hostname === "auth") {
    throw new AuthClientError("VALIDATION_ERROR", "La URL de la API no es valida.");
  }

  return url;
}

function safeUrlForLog(url: URL) {
  return `${url.origin}${url.pathname}`;
}
