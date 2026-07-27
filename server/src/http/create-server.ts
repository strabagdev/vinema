import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import {
  pullRequestSchema,
  pushRequestSchema,
} from "@vinema/sync-contracts";
import { isAuthorizedRequest } from "./auth";
import { syncError } from "./errors";
import { processPull, processPush } from "../sync/sync-service";
import type { SyncStore } from "../sync/sync-store";

const DATABASE_HEALTHCHECK_TIMEOUT_MS = 2_000;

export function createVinemaApiServer({
  store,
  apiKey,
  allowedOrigins = parseAllowedOrigins(process.env.VINEMA_ALLOWED_ORIGINS),
}: {
  store: SyncStore;
  apiKey: string;
  allowedOrigins?: string[];
}): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });

  void app.register(cors, {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin not allowed"), false);
    },
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

  app.post("/api/sync/push", async (request, reply) => {
    if (!isAuthorizedRequest(request, apiKey)) {
      return reply
        .status(401)
        .send(syncError("UNAUTHORIZED", "No autorizado."));
    }

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

    const response = await processPush(store, parsed.data);
    return reply.send(response);
  });

  app.get("/api/sync/pull", async (request, reply) => {
    if (!isAuthorizedRequest(request, apiKey)) {
      return reply
        .status(401)
        .send(syncError("UNAUTHORIZED", "No autorizado."));
    }

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

    if (!(await store.workspaceExists(parsed.data.workspaceId))) {
      return reply
        .status(404)
        .send(syncError("WORKSPACE_NOT_FOUND", "El workspace no existe."));
    }

    const response = await processPull(store, parsed.data);
    return reply.send(response);
  });

  app.setErrorHandler((_error, _request, reply) => {
    return reply
      .status(500)
      .send(syncError("INTERNAL_ERROR", "Error interno del servidor."));
  });

  return app;
}

function parseAllowedOrigins(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
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
