import { z } from "zod";

export const MAX_CAPTURE_CONTENT_LENGTH = 50_000;
export const MAX_CONCEPT_LABEL_LENGTH = 200;
export const MAX_PUSH_MUTATIONS = 100;
export const MAX_PULL_LIMIT = 500;
export const MIN_AUTH_PASSWORD_LENGTH = 8;
export const MAX_AUTH_PASSWORD_LENGTH = 512;

const uuidSchema = z.uuid();
const isoDateSchema = z.iso.datetime({ offset: true });
const nullableIsoDateSchema = isoDateSchema.nullable();
const baseMutationSchema = z.object({
  mutationId: uuidSchema,
  entityId: uuidSchema,
  baseVersion: z.number().int().positive().nullable(),
});

export const captureEntitySchema = z.object({
  id: uuidSchema,
  workspaceId: uuidSchema,
  content: z.string().max(MAX_CAPTURE_CONTENT_LENGTH),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  archivedAt: nullableIsoDateSchema.optional(),
  version: z.number().int().positive(),
});

export const conceptEntitySchema = z.object({
  id: uuidSchema,
  workspaceId: uuidSchema,
  label: z.string().min(1).max(MAX_CONCEPT_LABEL_LENGTH),
  normalizedKey: z.string().min(1).max(MAX_CONCEPT_LABEL_LENGTH),
  aliases: z.array(z.string().min(1).max(MAX_CONCEPT_LABEL_LENGTH)).default([]),
  normalizedAliases: z
    .array(z.string().min(1).max(MAX_CONCEPT_LABEL_LENGTH))
    .default([]),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  archivedAt: nullableIsoDateSchema.optional(),
  mergedIntoId: uuidSchema.nullable(),
  version: z.number().int().positive(),
});

export const captureConceptSourceSchema = z.enum([
  "USER_CONFIRMED",
  "MIGRATED",
  "SYSTEM",
]);

export const captureConceptEntitySchema = z.object({
  id: uuidSchema,
  workspaceId: uuidSchema,
  captureId: uuidSchema,
  conceptId: uuidSchema,
  source: captureConceptSourceSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  archivedAt: nullableIsoDateSchema.optional(),
  version: z.number().int().positive(),
});

export const remoteEntitySchema = z.union([
  captureEntitySchema,
  conceptEntitySchema,
  captureConceptEntitySchema,
]);

export const syncEntitySchema = z.discriminatedUnion("entityType", [
  z.object({ entityType: z.literal("capture"), entity: captureEntitySchema }),
  z.object({ entityType: z.literal("concept"), entity: conceptEntitySchema }),
  z.object({
    entityType: z.literal("captureConcept"),
    entity: captureConceptEntitySchema,
  }),
]);

export const syncMutationSchema = z.union([
  baseMutationSchema.extend({
    entityType: z.literal("capture"),
    operation: z.literal("upsert"),
    payload: captureEntitySchema
      .omit({ id: true, workspaceId: true, version: true })
      .extend({ content: z.string().max(MAX_CAPTURE_CONTENT_LENGTH) }),
  }),
  baseMutationSchema.extend({
    entityType: z.literal("capture"),
    operation: z.literal("archive"),
    payload: z.object({
      updatedAt: isoDateSchema,
      archivedAt: isoDateSchema,
    }),
  }),
  baseMutationSchema.extend({
    entityType: z.literal("concept"),
    operation: z.literal("upsert"),
    payload: conceptEntitySchema.omit({
      id: true,
      workspaceId: true,
      version: true,
    }),
  }),
  baseMutationSchema.extend({
    entityType: z.literal("captureConcept"),
    operation: z.literal("upsert"),
    payload: captureConceptEntitySchema.omit({
      id: true,
      workspaceId: true,
      version: true,
    }),
  }),
]);

export const pushRequestSchema = z.object({
  workspaceId: uuidSchema,
  deviceId: uuidSchema,
  mutations: z.array(syncMutationSchema).max(MAX_PUSH_MUTATIONS),
});

export const acceptedMutationSchema = z.object({
  mutationId: uuidSchema,
  entityType: z.enum(["capture", "concept", "captureConcept"]),
  entityId: uuidSchema,
  version: z.number().int().positive(),
});

export const syncConflictSchema = z.object({
  mutationId: uuidSchema,
  entityType: z.enum(["capture", "concept", "captureConcept"]),
  entityId: uuidSchema,
  reason: z.literal("VERSION_CONFLICT"),
  serverEntity: z.unknown(),
});

export const rejectedMutationSchema = z.object({
  mutationId: uuidSchema.optional(),
  entityType: z.enum(["capture", "concept", "captureConcept"]).optional(),
  entityId: uuidSchema.optional(),
  code: z.string(),
  message: z.string(),
});

export const pushResponseSchema = z.object({
  accepted: z.array(acceptedMutationSchema),
  conflicts: z.array(syncConflictSchema),
  rejected: z.array(rejectedMutationSchema),
  serverCursor: z.string(),
});

export const pullRequestSchema = z.object({
  workspaceId: uuidSchema,
  cursor: z
    .string()
    .regex(/^\d+$/)
    .default("0"),
  limit: z.coerce.number().int().positive().max(MAX_PULL_LIMIT).default(100),
});

export const syncChangeSchema = z.object({
  sequence: z.string(),
  entityType: z.enum(["capture", "concept", "captureConcept"]),
  operation: z.enum(["upsert", "archive"]),
  entity: remoteEntitySchema,
});

export const captureEntityResponseSchema = z.object({
  entityType: z.literal("capture"),
  entityId: uuidSchema,
  version: z.number().int().positive(),
  content: z.string().max(MAX_CAPTURE_CONTENT_LENGTH),
  archivedAt: nullableIsoDateSchema.optional(),
  updatedAt: isoDateSchema,
});

export const workspaceKnowledgeResetChangeSchema = z.object({
  sequence: z.string(),
  entityType: z.literal("workspaceKnowledgeReset"),
  operation: z.literal("reset"),
  reset: z.object({
    workspaceId: uuidSchema,
    occurredAt: isoDateSchema,
    resetVersion: z.string(),
  }),
});

export const pullChangeSchema = z.union([
  syncChangeSchema,
  workspaceKnowledgeResetChangeSchema,
]);

export const pullResponseSchema = z.object({
  changes: z.array(pullChangeSchema),
  nextCursor: z.string(),
  hasMore: z.boolean(),
});

export const knowledgeResetRequestSchema = z.object({
  workspaceId: uuidSchema,
  confirmation: z.literal("VACIAR"),
});

export const knowledgeResetResponseSchema = z.object({
  workspaceId: uuidSchema,
  resetVersion: z.string(),
  occurredAt: isoDateSchema,
  deleted: z.object({
    captures: z.number().int().nonnegative(),
    concepts: z.number().int().nonnegative(),
    relations: z.number().int().nonnegative(),
  }),
});

export const syncErrorSchema = z.object({
  error: z.object({
    code: z.enum([
      "UNAUTHORIZED",
      "FORBIDDEN",
      "INVALID_REQUEST",
      "WORKSPACE_NOT_FOUND",
      "VERSION_CONFLICT",
      "ENTITY_NOT_FOUND",
      "PAYLOAD_TOO_LARGE",
      "INTERNAL_ERROR",
    ]),
    message: z.string(),
    details: z.array(z.unknown()).optional(),
  }),
});

export const authenticatedUserSchema = z.object({
  id: uuidSchema,
  email: z.email(),
  displayName: z.string().min(1).max(200).nullable(),
});

export const devicePlatformSchema = z.enum([
  "windows",
  "macos",
  "linux",
  "android",
  "ios",
  "web",
  "unknown",
]);

export const deviceAppTypeSchema = z.enum(["WEB", "PWA", "TAURI", "UNKNOWN"]);

export const registerDeviceRequestSchema = z.object({
  clientDeviceId: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  platform: devicePlatformSchema,
  appType: deviceAppTypeSchema,
  appVersion: z.string().trim().min(1).max(100).optional(),
});

export const deviceSummarySchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  clientDeviceId: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  platform: devicePlatformSchema,
  appType: deviceAppTypeSchema,
  appVersion: z.string().min(1).max(100).nullable(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  lastSeenAt: isoDateSchema,
  revokedAt: nullableIsoDateSchema,
});

export const registerDeviceResponseSchema = z.object({
  device: deviceSummarySchema,
  created: z.boolean(),
});

export const currentDeviceResponseSchema = z.object({
  device: deviceSummarySchema,
});

export const authenticatedSessionSchema = z.object({
  user: authenticatedUserSchema,
  workspaceId: uuidSchema,
  deviceId: uuidSchema,
  device: deviceSummarySchema,
  sessionId: uuidSchema,
  accessToken: z.string().min(1),
  accessTokenExpiresAt: isoDateSchema,
  refreshToken: z.string().min(1),
  refreshTokenExpiresAt: isoDateSchema,
});

export const authTokenPairSchema = z.object({
  accessToken: z.string().min(1),
  accessTokenExpiresAt: isoDateSchema,
  refreshToken: z.string().min(1),
  refreshTokenExpiresAt: isoDateSchema,
});

export const authSessionSummarySchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  deviceId: uuidSchema,
  tokenFamilyId: uuidSchema,
  generation: z.number().int().positive(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  lastUsedAt: nullableIsoDateSchema,
  expiresAt: isoDateSchema,
  revokedAt: nullableIsoDateSchema,
});

export const registerRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(MIN_AUTH_PASSWORD_LENGTH).max(MAX_AUTH_PASSWORD_LENGTH),
  displayName: z.string().trim().min(1).max(200).optional(),
  device: registerDeviceRequestSchema,
});

export const registerResponseSchema = authenticatedSessionSchema;

export const loginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(MAX_AUTH_PASSWORD_LENGTH),
  device: registerDeviceRequestSchema,
});

export const loginResponseSchema = authenticatedSessionSchema;

export const currentSessionResponseSchema = z.object({
  user: authenticatedUserSchema,
  workspaceId: uuidSchema,
  deviceId: uuidSchema,
  sessionId: uuidSchema,
  tokenExpiresAt: isoDateSchema,
});

export const refreshSessionRequestSchema = z.object({
  refreshToken: z.string().trim().min(1),
});

export const refreshSessionResponseSchema = authenticatedSessionSchema;

export const logoutRequestSchema = z.object({
  refreshToken: z.string().trim().min(1),
});

export const logoutResponseSchema = z.object({
  ok: z.literal(true),
});

export const authSessionErrorCodeSchema = z.enum([
  "REFRESH_TOKEN_INVALID",
  "REFRESH_TOKEN_EXPIRED",
  "REFRESH_TOKEN_REVOKED",
  "REFRESH_TOKEN_REUSED",
  "DEVICE_REVOKED",
  "SESSION_NOT_FOUND",
  "SESSION_INVALID",
]);

export const authErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "EMAIL_ALREADY_EXISTS",
  "INVALID_CREDENTIALS",
  "USER_DISABLED",
  "TOKEN_MISSING",
  "TOKEN_INVALID",
  "TOKEN_EXPIRED",
  "REFRESH_TOKEN_INVALID",
  "REFRESH_TOKEN_EXPIRED",
  "REFRESH_TOKEN_REVOKED",
  "REFRESH_TOKEN_REUSED",
  "SESSION_NOT_FOUND",
  "SESSION_INVALID",
  "DEVICE_REVOKED",
  "WORKSPACE_FORBIDDEN",
  "NETWORK_ERROR",
  "SERVER_ERROR",
  "UNEXPECTED_ERROR",
]);

export const authErrorResponseSchema = z.object({
  error: z.object({
    code: authErrorCodeSchema,
    message: z.string(),
    details: z.array(z.unknown()).optional(),
  }),
});

export type CaptureEntity = z.infer<typeof captureEntitySchema>;
export type ConceptEntity = z.infer<typeof conceptEntitySchema>;
export type CaptureConceptEntity = z.infer<typeof captureConceptEntitySchema>;
export type SyncEntity = z.infer<typeof syncEntitySchema>;
export type SyncMutation = z.infer<typeof syncMutationSchema>;
export type PushRequest = z.infer<typeof pushRequestSchema>;
export type PushResponse = z.infer<typeof pushResponseSchema>;
export type PullRequest = z.infer<typeof pullRequestSchema>;
export type PullResponse = z.infer<typeof pullResponseSchema>;
export type CaptureEntityResponse = z.infer<typeof captureEntityResponseSchema>;
export type KnowledgeResetRequest = z.infer<typeof knowledgeResetRequestSchema>;
export type KnowledgeResetResponse = z.infer<typeof knowledgeResetResponseSchema>;
export type SyncConflict = z.infer<typeof syncConflictSchema>;
export type SyncError = z.infer<typeof syncErrorSchema>;
export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;
export type AuthenticatedSession = z.infer<typeof authenticatedSessionSchema>;
export type AuthTokenPair = z.infer<typeof authTokenPairSchema>;
export type AuthSessionSummary = z.infer<typeof authSessionSummarySchema>;
export type DevicePlatform = z.infer<typeof devicePlatformSchema>;
export type DeviceAppType = z.infer<typeof deviceAppTypeSchema>;
export type RegisterDeviceRequest = z.infer<typeof registerDeviceRequestSchema>;
export type RegisterDeviceResponse = z.infer<typeof registerDeviceResponseSchema>;
export type CurrentDeviceResponse = z.infer<typeof currentDeviceResponseSchema>;
export type DeviceSummary = z.infer<typeof deviceSummarySchema>;
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type RegisterResponse = z.infer<typeof registerResponseSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type CurrentSessionResponse = z.infer<typeof currentSessionResponseSchema>;
export type RefreshSessionRequest = z.infer<typeof refreshSessionRequestSchema>;
export type RefreshSessionResponse = z.infer<typeof refreshSessionResponseSchema>;
export type LogoutRequest = z.infer<typeof logoutRequestSchema>;
export type LogoutResponse = z.infer<typeof logoutResponseSchema>;
export type AuthSessionErrorCode = z.infer<typeof authSessionErrorCodeSchema>;
export type AuthErrorCode = z.infer<typeof authErrorCodeSchema>;
export type AuthErrorResponse = z.infer<typeof authErrorResponseSchema>;
