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
    try {
      await store.health();
      return reply.send({
        status: "ok",
        service: "vinema-api",
        database: "connected",
        timestamp: new Date().toISOString(),
      });
    } catch {
      return reply.status(503).send({
        status: "error",
        service: "vinema-api",
        database: "unavailable",
        timestamp: new Date().toISOString(),
      });
    }
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
