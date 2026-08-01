import {
  knowledgeResetRequestSchema,
  knowledgeResetResponseSchema,
  syncErrorSchema,
  type KnowledgeResetResponse,
} from "@vinema/sync-contracts";
import type { AccessTokenProvider } from "@/features/auth/access-token-provider";
import { SyncClientError } from "@/features/sync/sync-client";

export type KnowledgeResetClient = {
  reset(input: {
    workspaceId: string;
    confirmation: "VACIAR";
    signal?: AbortSignal;
  }): Promise<KnowledgeResetResponse>;
};

export function createKnowledgeResetClient({
  baseUrl,
  accessTokenProvider,
  fetchFn = fetch,
}: {
  baseUrl: string;
  accessTokenProvider: AccessTokenProvider;
  fetchFn?: typeof fetch;
}): KnowledgeResetClient {
  const normalizedBase = baseUrl.trim().replace(/\/+$/, "");

  return {
    async reset(input) {
      const parsedInput = knowledgeResetRequestSchema.safeParse(input);
      if (!parsedInput.success) {
        throw new SyncClientError({
          code: "INVALID_REQUEST",
          message: "La solicitud de vaciado no es valida.",
          details: parsedInput.error.issues,
        });
      }

      const token = accessTokenProvider.getAccessToken();
      if (!token) {
        throw new SyncClientError({
          code: "AUTH_ERROR",
          message: "La sesion no esta disponible.",
        });
      }

      const response = await fetchFn(`${normalizedBase}/api/knowledge/reset`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(parsedInput.data),
        signal: input.signal,
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        const parsedError = syncErrorSchema.safeParse(body);
        throw new SyncClientError({
          code:
            response.status === 401 || response.status === 403
              ? "AUTH_ERROR"
              : "SERVER_ERROR",
          message:
            parsedError.success
              ? parsedError.data.error.message
              : "No se pudo vaciar el conocimiento remoto.",
          status: response.status,
          details: parsedError.success ? parsedError.data.error.details : body,
        });
      }

      const parsed = knowledgeResetResponseSchema.safeParse(body);
      if (!parsed.success) {
        throw new SyncClientError({
          code: "INVALID_RESPONSE",
          message: "La respuesta de vaciado no cumple el contrato.",
          details: parsed.error.issues,
        });
      }

      return parsed.data;
    },
  };
}
