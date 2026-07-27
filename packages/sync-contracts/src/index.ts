import { z } from "zod";

export const MAX_CAPTURE_CONTENT_LENGTH = 50_000;
export const MAX_CONCEPT_LABEL_LENGTH = 200;
export const MAX_PUSH_MUTATIONS = 100;
export const MAX_PULL_LIMIT = 500;

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
  archivedAt: nullableIsoDateSchema,
  version: z.number().int().positive(),
});

export const conceptEntitySchema = z.object({
  id: uuidSchema,
  workspaceId: uuidSchema,
  label: z.string().min(1).max(MAX_CONCEPT_LABEL_LENGTH),
  normalizedKey: z.string().min(1).max(MAX_CONCEPT_LABEL_LENGTH),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  archivedAt: nullableIsoDateSchema,
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
  archivedAt: nullableIsoDateSchema,
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

export const syncMutationSchema = z.discriminatedUnion("entityType", [
  baseMutationSchema.extend({
    entityType: z.literal("capture"),
    operation: z.literal("upsert"),
    payload: captureEntitySchema
      .omit({ id: true, workspaceId: true, version: true })
      .extend({ content: z.string().max(MAX_CAPTURE_CONTENT_LENGTH) }),
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

export const pullResponseSchema = z.object({
  changes: z.array(syncChangeSchema),
  nextCursor: z.string(),
  hasMore: z.boolean(),
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

export type CaptureEntity = z.infer<typeof captureEntitySchema>;
export type ConceptEntity = z.infer<typeof conceptEntitySchema>;
export type CaptureConceptEntity = z.infer<typeof captureConceptEntitySchema>;
export type SyncEntity = z.infer<typeof syncEntitySchema>;
export type SyncMutation = z.infer<typeof syncMutationSchema>;
export type PushRequest = z.infer<typeof pushRequestSchema>;
export type PushResponse = z.infer<typeof pushResponseSchema>;
export type PullRequest = z.infer<typeof pullRequestSchema>;
export type PullResponse = z.infer<typeof pullResponseSchema>;
export type SyncConflict = z.infer<typeof syncConflictSchema>;
export type SyncError = z.infer<typeof syncErrorSchema>;
