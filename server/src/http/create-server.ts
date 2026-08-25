import cors from "@fastify/cors";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { z } from "zod";
import {
  captureEntityResponseSchema,
  currentSessionResponseSchema,
  currentDeviceResponseSchema,
  loginRequestSchema,
  loginResponseSchema,
  logoutRequestSchema,
  logoutResponseSchema,
  knowledgeResetRequestSchema,
  knowledgeResetResponseSchema,
  pullRequestSchema,
  pushRequestSchema,
  refreshSessionRequestSchema,
  refreshSessionResponseSchema,
  registerRequestSchema,
  registerResponseSchema,
  syncInventoryRequestSchema,
  syncInventoryResponseSchema,
  syncEntityResponseSchema,
} from "@vinema/sync-contracts";
import { AuthError, authErrorResponse } from "../auth/auth-errors";
import type { AuthTokenConfig } from "../auth/auth-config";
import type { IdentityService } from "../auth/identity-service";
import { getAuthContext, isAuthorizedTestApiKey } from "./auth";
import { syncError } from "./errors";
import { processPull, processPush } from "../sync/sync-service";
import type { SyncStore } from "../sync/sync-store";

const DATABASE_HEALTHCHECK_TIMEOUT_MS = 2_000;
const DEFAULT_ALLOWED_ORIGINS = [
  "https://vinema-web.up.railway.app",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3456",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3456",
];
const TAURI_ALLOWED_ORIGINS = [
  "http://tauri.localhost",
  "https://tauri.localhost",
  "tauri://localhost",
];

export function createVinemaApiServer({
  store,
  identityService,
  tokenConfig,
  apiKey,
  allowedOrigins = parseAllowedOrigins(process.env.VINEMA_ALLOWED_ORIGINS),
}: {
  store: SyncStore;
  identityService?: IdentityService;
  tokenConfig?: AuthTokenConfig;
  apiKey?: string;
  allowedOrigins?: string[];
}): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });

  void app.register(cors, {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
  });

  app.get("/api/health", async (_request, reply) => {
    const database = await checkDatabaseHealth(store, app);

    return reply.send({
      status: "ok",
      service: "vinema-api",
      database,
      timestamp: new Date().toISOString(),
    });
  });

  app.post("/auth/register", async (request, reply) => {
    if (!identityService) {
      return reply.status(500).send(authErrorResponse("SERVER_ERROR", "Auth no configurado."));
    }
    const parsed = registerRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send(authErrorResponse("VALIDATION_ERROR", "La solicitud no es valida.", parsed.error.issues));
    }

    try {
      const response = await identityService.register(parsed.data);
      const parsedResponse = registerResponseSchema.parse(response);
      return reply.status(201).send(parsedResponse);
    } catch (error) {
      return sendAuthError(reply, error);
    }
  });

  app.post("/auth/login", async (request, reply) => {
    if (!identityService) {
      return reply.status(500).send(authErrorResponse("SERVER_ERROR", "Auth no configurado."));
    }
    const parsed = loginRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send(authErrorResponse("VALIDATION_ERROR", "La solicitud no es valida.", parsed.error.issues));
    }

    try {
      const response = await identityService.login(parsed.data);
      const parsedResponse = loginResponseSchema.parse(response);
      return reply.send(parsedResponse);
    } catch (error) {
      return sendAuthError(reply, error);
    }
  });

  app.post("/auth/refresh", async (request, reply) => {
    if (!identityService) {
      return reply.status(500).send(authErrorResponse("SERVER_ERROR", "Auth no configurado."));
    }
    const parsed = refreshSessionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send(authErrorResponse("VALIDATION_ERROR", "La solicitud no es valida.", parsed.error.issues));
    }

    try {
      const response = await identityService.refresh(parsed.data);
      const parsedResponse = refreshSessionResponseSchema.parse(response);
      return reply.send(parsedResponse);
    } catch (error) {
      return sendAuthError(reply, error);
    }
  });

  app.post("/auth/logout", async (request, reply) => {
    if (!identityService) {
      return reply.status(500).send(authErrorResponse("SERVER_ERROR", "Auth no configurado."));
    }
    const parsed = logoutRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send(authErrorResponse("VALIDATION_ERROR", "La solicitud no es valida.", parsed.error.issues));
    }

    try {
      const response = await identityService.logout(parsed.data);
      const parsedResponse = logoutResponseSchema.parse(response);
      return reply.send(parsedResponse);
    } catch (error) {
      return sendAuthError(reply, error);
    }
  });

  app.get("/auth/session", async (request, reply) => {
    if (!identityService || !tokenConfig) {
      return reply.status(500).send(authErrorResponse("SERVER_ERROR", "Auth no configurado."));
    }
    try {
      const authContext = getAuthContext(request, tokenConfig);
      const response = await identityService.getCurrentSession(authContext);
      const parsedResponse = currentSessionResponseSchema.parse(response);
      return reply.send(parsedResponse);
    } catch (error) {
      return sendAuthError(reply, error);
    }
  });

  app.get("/auth/device", async (request, reply) => {
    if (!identityService || !tokenConfig) {
      return reply.status(500).send(authErrorResponse("SERVER_ERROR", "Auth no configurado."));
    }
    try {
      const authContext = getAuthContext(request, tokenConfig);
      const response = await identityService.getCurrentDevice(authContext);
      const parsedResponse = currentDeviceResponseSchema.parse(response);
      return reply.send(parsedResponse);
    } catch (error) {
      return sendAuthError(reply, error);
    }
  });

  app.post("/api/sync/push", async (request, reply) => {
    const parsed = pushRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send(
        syncError(
          "INVALID_REQUEST",
          "La solicitud no es valida.",
          parsed.error.issues,
        ),
      );
    }

    const authContext = authorizeSyncRequest({
      request,
      workspaceId: parsed.data.workspaceId,
      tokenConfig,
      apiKey,
    });
    if (authContext instanceof AuthError) {
      return sendAuthError(reply, authContext);
    }

    if (parsed.data.workspaceId !== authContext.workspaceId) {
      return reply
        .status(403)
        .send(authErrorResponse("WORKSPACE_FORBIDDEN", "Workspace no permitido."));
    }

    const response = await processPush(store, parsed.data);
    return reply.send(response);
  });

  app.get("/api/sync/pull", async (request, reply) => {
    const parsed = pullRequestSchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.status(400).send(
        syncError(
          "INVALID_REQUEST",
          "La solicitud no es valida.",
          parsed.error.issues,
        ),
      );
    }

    const authContext = authorizeSyncRequest({
      request,
      workspaceId: parsed.data.workspaceId,
      tokenConfig,
      apiKey,
    });
    if (authContext instanceof AuthError) {
      return sendAuthError(reply, authContext);
    }

    if (parsed.data.workspaceId !== authContext.workspaceId) {
      return reply
        .status(403)
        .send(authErrorResponse("WORKSPACE_FORBIDDEN", "Workspace no permitido."));
    }

    if (!(await store.workspaceExists(parsed.data.workspaceId))) {
      return reply
        .status(404)
        .send(syncError("WORKSPACE_NOT_FOUND", "El workspace no existe."));
    }

    const response = await processPull(store, parsed.data);
    return reply.send(response);
  });

  app.get("/api/sync/inventory", async (request, reply) => {
    const parsed = syncInventoryRequestSchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.status(400).send(
        syncError(
          "INVALID_REQUEST",
          "La solicitud no es valida.",
          parsed.error.issues,
        ),
      );
    }

    const authContext = authorizeSyncRequest({
      request,
      workspaceId: parsed.data.workspaceId,
      tokenConfig,
      apiKey,
    });
    if (authContext instanceof AuthError) {
      return sendAuthError(reply, authContext);
    }

    if (parsed.data.workspaceId !== authContext.workspaceId) {
      return reply
        .status(403)
        .send(authErrorResponse("WORKSPACE_FORBIDDEN", "Workspace no permitido."));
    }

    if (!(await store.workspaceExists(parsed.data.workspaceId))) {
      return reply
        .status(404)
        .send(syncError("WORKSPACE_NOT_FOUND", "El workspace no existe."));
    }

    const response = await store.listInventory(parsed.data);
    return reply.send(syncInventoryResponseSchema.parse(response));
  });

  app.get("/api/sync/entities/capture/:entityId", async (request, reply) => {
    const params = request.params as { entityId?: unknown };
    const query = request.query as { workspaceId?: unknown };
    const parsed = pullRequestSchema.pick({ workspaceId: true }).safeParse(query);

    if (!parsed.success || typeof params.entityId !== "string") {
      return reply.status(400).send(
        syncError(
          "INVALID_REQUEST",
          "La solicitud no es valida.",
          parsed.success ? undefined : parsed.error.issues,
        ),
      );
    }

    const authContext = authorizeSyncRequest({
      request,
      workspaceId: parsed.data.workspaceId,
      tokenConfig,
      apiKey,
    });
    if (authContext instanceof AuthError) {
      return sendAuthError(reply, authContext);
    }

    if (parsed.data.workspaceId !== authContext.workspaceId) {
      return reply
        .status(403)
        .send(authErrorResponse("WORKSPACE_FORBIDDEN", "Workspace no permitido."));
    }

    if (!(await store.workspaceExists(parsed.data.workspaceId))) {
      return reply
        .status(404)
        .send(syncError("WORKSPACE_NOT_FOUND", "El workspace no existe."));
    }

    const stored = await store.getEntity(
      parsed.data.workspaceId,
      "capture",
      params.entityId,
    );

    if (!stored || stored.entityType !== "capture") {
      return reply
        .status(404)
        .send(syncError("ENTITY_NOT_FOUND", "La captura no existe."));
    }

    return reply.send(captureEntityResponseSchema.parse({
      entityType: "capture",
      entityId: stored.entity.id,
      version: stored.entity.version,
      content: stored.entity.content,
      archivedAt: stored.entity.archivedAt,
      updatedAt: stored.entity.updatedAt,
      entity: stored.entity,
    }));
  });

  app.get("/api/sync/entities/:entityType/:entityId", async (request, reply) => {
    const parsedParams = syncEntityParamsSchema.safeParse(request.params);
    const query = request.query as { workspaceId?: unknown };
    const parsed = pullRequestSchema.pick({ workspaceId: true }).safeParse(query);

    if (!parsed.success || !parsedParams.success) {
      return reply.status(400).send(
        syncError(
          "INVALID_REQUEST",
          "La solicitud no es valida.",
          [
            ...(parsed.success ? [] : parsed.error.issues),
            ...(parsedParams.success ? [] : parsedParams.error.issues),
          ],
        ),
      );
    }

    const authContext = authorizeSyncRequest({
      request,
      workspaceId: parsed.data.workspaceId,
      tokenConfig,
      apiKey,
    });
    if (authContext instanceof AuthError) {
      return sendAuthError(reply, authContext);
    }

    if (parsed.data.workspaceId !== authContext.workspaceId) {
      return reply
        .status(403)
        .send(authErrorResponse("WORKSPACE_FORBIDDEN", "Workspace no permitido."));
    }

    if (!(await store.workspaceExists(parsed.data.workspaceId))) {
      return reply
        .status(404)
        .send(syncError("WORKSPACE_NOT_FOUND", "El workspace no existe."));
    }

    const stored = await store.getEntity(
      parsed.data.workspaceId,
      parsedParams.data.entityType,
      parsedParams.data.entityId,
    );

    if (!stored) {
      return reply
        .status(404)
        .send(syncError("ENTITY_NOT_FOUND", "La entidad no existe."));
    }

    return reply.send(syncEntityResponseSchema.parse(stored));
  });

  app.post("/api/knowledge/reset", async (request, reply) => {
    const parsed = knowledgeResetRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send(
        syncError(
          "INVALID_REQUEST",
          "La solicitud no es valida.",
          parsed.error.issues,
        ),
      );
    }

    const authContext = authorizeSyncRequest({
      request,
      workspaceId: parsed.data.workspaceId,
      tokenConfig,
      apiKey,
    });
    if (authContext instanceof AuthError) {
      return sendAuthError(reply, authContext);
    }

    if (parsed.data.workspaceId !== authContext.workspaceId) {
      return reply
        .status(403)
        .send(authErrorResponse("WORKSPACE_FORBIDDEN", "Workspace no permitido."));
    }

    if (!(await store.workspaceExists(parsed.data.workspaceId))) {
      return reply
        .status(404)
        .send(syncError("WORKSPACE_NOT_FOUND", "El workspace no existe."));
    }

    const response = await store.resetKnowledge({
      workspaceId: parsed.data.workspaceId,
    });
    return reply.send(knowledgeResetResponseSchema.parse(response));
  });

  app.setErrorHandler((_error, _request, reply) => {
    return reply
      .status(500)
      .send(syncError("INTERNAL_ERROR", "Error interno del servidor."));
  });

  return app;
}

const syncEntityParamsSchema = z.object({
  entityType: z.enum(["capture", "concept", "captureConcept"]),
  entityId: z.uuid(),
});

function authorizeSyncRequest({
  request,
  workspaceId,
  tokenConfig,
  apiKey,
}: {
  request: FastifyRequest;
  workspaceId: string;
  tokenConfig?: AuthTokenConfig;
  apiKey?: string;
}) {
  if (isAuthorizedTestApiKey(request, apiKey)) {
    return {
      userId: "test-user",
      workspaceId,
      deviceId: "test-device",
      sessionId: "test-session",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      claims: {
        sub: "test-user",
        workspaceId,
        deviceId: "test-device",
        sessionId: "test-session",
        iat: 0,
        exp: 9_999_999_999,
        iss: "test",
        aud: "test",
      },
    };
  }

  if (!tokenConfig) {
    return new AuthError("TOKEN_INVALID", "Token invalido.", 401);
  }

  try {
    return getAuthContext(request, tokenConfig);
  } catch (error) {
    return error instanceof AuthError
      ? error
      : new AuthError("TOKEN_INVALID", "Token invalido.", 401);
  }
}

function sendAuthError(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthError) {
    return reply
      .status(error.statusCode)
      .send(authErrorResponse(error.code, error.message, error.details));
  }

  return reply
    .status(500)
    .send(authErrorResponse("SERVER_ERROR", "Error interno del servidor."));
}

function parseAllowedOrigins(value: string | undefined) {
  const origins = (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return uniqueOrigins([
    ...(origins.length > 0 ? origins : DEFAULT_ALLOWED_ORIGINS),
    ...TAURI_ALLOWED_ORIGINS,
  ]);
}

function uniqueOrigins(origins: string[]) {
  return Array.from(new Set(origins));
}

async function checkDatabaseHealth(
  store: SyncStore,
  app: FastifyInstance,
): Promise<"connected" | "unavailable"> {
  try {
    await withTimeout(store.health(), DATABASE_HEALTHCHECK_TIMEOUT_MS);
    return "connected";
  } catch (error) {
    app.log.error(
      { error: toSafeHealthcheckError(error) },
      "Database healthcheck failed.",
    );
    return "unavailable";
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new Error("Database healthcheck timed out."));
    }, timeoutMs);
  });

  return Promise.race([
    promise.finally(() => {
      clearTimeout(timeout);
    }),
    timeoutPromise,
  ]);
}

function toSafeHealthcheckError(error: unknown) {
  if (!(error instanceof Error)) {
    return { message: "Unknown database healthcheck error." };
  }

  return {
    name: error.name,
    message: error.message.replace(/postgresql:\/\/\S+/g, "[redacted-database-url]"),
  };
}
