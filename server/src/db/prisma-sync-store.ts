import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  CaptureEntity,
  ConceptEntity,
  PushResponse,
  SyncMutation,
} from "@vinema/sync-contracts";
import type {
  StoredEntity,
  StoredSyncChange,
  SyncEntityType,
  SyncOperation,
  SyncStore,
} from "../sync/sync-store";

const ENTITY_TYPE = {
  capture: "CAPTURE",
  concept: "CONCEPT",
  captureConcept: "CAPTURE_CONCEPT",
} as const;

const OPERATION = {
  upsert: "UPSERT",
  archive: "ARCHIVE",
} as const;

const RESET_MARKER_ENTITY_TYPE = "CAPTURE";
const RESET_MARKER_OPERATION = "ARCHIVE";
const RESET_MARKER_ENTITY_VERSION = 0;

export class PrismaSyncStore implements SyncStore {
  constructor(private readonly prisma: PrismaClient) {}

  async health(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }

  async workspaceExists(workspaceId: string): Promise<boolean> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    });

    return workspace !== null;
  }

  async getLatestCursor(workspaceId: string): Promise<string> {
    const latest = await this.prisma.syncChange.findFirst({
      where: { workspaceId },
      orderBy: { sequence: "desc" },
      select: { sequence: true },
    });

    return latest?.sequence.toString() ?? "0";
  }

  async getLatestKnowledgeReset(
    workspaceId: string,
  ): Promise<{ resetVersion: string; occurredAt: string } | null> {
    const latest = await this.prisma.syncChange.findFirst({
      where: {
        workspaceId,
        entityType: RESET_MARKER_ENTITY_TYPE,
        entityId: workspaceId,
        operation: RESET_MARKER_OPERATION,
        entityVersion: RESET_MARKER_ENTITY_VERSION,
      },
      orderBy: { sequence: "desc" },
      select: { sequence: true, changedAt: true },
    });

    return latest
      ? {
        resetVersion: latest.sequence.toString(),
        occurredAt: latest.changedAt.toISOString(),
      }
      : null;
  }

  async getProcessedMutation(
    workspaceId: string,
    mutationId: string,
  ): Promise<PushResponse | null> {
    const processed = await this.prisma.processedMutation.findUnique({
      where: { mutationId },
    });

    if (!processed || processed.workspaceId !== workspaceId) {
      return null;
    }

    return processed.response as PushResponse;
  }

  async getEntity(
    workspaceId: string,
    entityType: SyncEntityType,
    entityId: string,
  ): Promise<StoredEntity | null> {
    if (entityType === "capture") {
      const capture = await this.prisma.capture.findUnique({ where: { id: entityId } });

      if (!capture || capture.workspaceId !== workspaceId) {
        return null;
      }

      return { entityType, entity: toCaptureEntity(capture) };
    }

    if (entityType === "concept") {
      const concept = await this.prisma.concept.findUnique({ where: { id: entityId } });

      if (!concept || concept.workspaceId !== workspaceId) {
        return null;
      }

      return { entityType, entity: toConceptEntity(concept) };
    }

    const captureConcept = await this.prisma.captureConcept.findUnique({
      where: { id: entityId },
      include: { capture: true },
    });

    if (!captureConcept || captureConcept.capture.workspaceId !== workspaceId) {
      return null;
    }

    return {
      entityType,
      entity: {
        id: captureConcept.id,
        workspaceId,
        captureId: captureConcept.captureId,
        conceptId: captureConcept.conceptId,
        source: captureConcept.source,
        createdAt: captureConcept.createdAt.toISOString(),
        updatedAt: captureConcept.updatedAt.toISOString(),
        archivedAt: captureConcept.archivedAt?.toISOString() ?? null,
        version: captureConcept.version,
      },
    };
  }

  async applyMutation(input: {
    workspaceId: string;
    mutation: SyncMutation;
  }): Promise<{ version: number; operation: SyncOperation; serverCursor: string }> {
    return this.prisma.$transaction(async (tx) => {
      const { version, archived } = await applyEntityMutation(
        tx as PrismaClient,
        input.workspaceId,
        input.mutation,
      );
      const operation: SyncOperation = archived ? "archive" : "upsert";

      const change = await tx.syncChange.create({
        data: {
          workspaceId: input.workspaceId,
          entityType: ENTITY_TYPE[input.mutation.entityType],
          entityId: input.mutation.entityId,
          operation: OPERATION[operation],
          entityVersion: version,
        },
      });
      const serverCursor = change.sequence.toString();
      const response: PushResponse = {
        accepted: [
          {
            mutationId: input.mutation.mutationId,
            entityType: input.mutation.entityType,
            entityId: input.mutation.entityId,
            version,
          },
        ],
        conflicts: [],
        rejected: [],
        serverCursor,
      };

      await tx.processedMutation.create({
        data: {
          workspaceId: input.workspaceId,
          mutationId: input.mutation.mutationId,
          response: JSON.parse(JSON.stringify(response)) as Prisma.InputJsonValue,
        },
      });

      return { version, operation, serverCursor };
    });
  }

  async listChanges(input: {
    workspaceId: string;
    cursor: string;
    limit: number;
  }): Promise<StoredSyncChange[]> {
    const changes = await this.prisma.syncChange.findMany({
      where: {
        workspaceId: input.workspaceId,
        sequence: { gt: BigInt(input.cursor) },
      },
      orderBy: { sequence: "asc" },
      take: input.limit,
    });

    return changes.map((change) => {
      if (
        change.entityType === RESET_MARKER_ENTITY_TYPE &&
        change.operation === RESET_MARKER_OPERATION &&
        change.entityId === input.workspaceId &&
        change.entityVersion === RESET_MARKER_ENTITY_VERSION
      ) {
        return {
          sequence: change.sequence.toString(),
          entityType: "workspaceKnowledgeReset",
          entityId: input.workspaceId,
          operation: "reset",
          occurredAt: change.changedAt.toISOString(),
        };
      }

      return {
        sequence: change.sequence.toString(),
        entityType: fromPrismaEntityType(change.entityType),
        entityId: change.entityId,
        operation: change.operation === "ARCHIVE" ? "archive" : "upsert",
      };
    });
  }

  async resetKnowledge(input: {
    workspaceId: string;
    occurredAt?: Date;
  }): Promise<{
    workspaceId: string;
    resetVersion: string;
    occurredAt: string;
    deleted: { captures: number; concepts: number; relations: number };
  }> {
    const occurredAt = input.occurredAt ?? new Date();

    return this.prisma.$transaction(async (tx) => {
      const relationResult = await tx.captureConcept.deleteMany({
        where: {
          OR: [
            { capture: { workspaceId: input.workspaceId } },
            { concept: { workspaceId: input.workspaceId } },
          ],
        },
      });
      const captureResult = await tx.capture.deleteMany({
        where: { workspaceId: input.workspaceId },
      });
      const conceptResult = await tx.concept.deleteMany({
        where: { workspaceId: input.workspaceId },
      });
      const change = await tx.syncChange.create({
        data: {
          workspaceId: input.workspaceId,
          entityType: RESET_MARKER_ENTITY_TYPE,
          entityId: input.workspaceId,
          operation: RESET_MARKER_OPERATION,
          entityVersion: RESET_MARKER_ENTITY_VERSION,
          changedAt: occurredAt,
        },
      });

      return {
        workspaceId: input.workspaceId,
        resetVersion: change.sequence.toString(),
        occurredAt: occurredAt.toISOString(),
        deleted: {
          captures: captureResult.count,
          concepts: conceptResult.count,
          relations: relationResult.count,
        },
      };
    });
  }
}

async function applyEntityMutation(
  tx: PrismaClient,
  workspaceId: string,
  mutation: SyncMutation,
) {
  if (mutation.entityType === "capture") {
    const version = mutation.baseVersion === null ? 1 : mutation.baseVersion + 1;

    if (mutation.operation === "archive") {
      const capture = await tx.capture.update({
        where: { id: mutation.entityId },
        data: {
          updatedAt: mutation.payload.updatedAt,
          archivedAt: mutation.payload.archivedAt,
          version,
        },
      });

      return { version: capture.version, archived: true };
    }

    const capture = await tx.capture.upsert({
      where: { id: mutation.entityId },
      create: {
        id: mutation.entityId,
        workspaceId,
        content: mutation.payload.content,
        createdAt: mutation.payload.createdAt,
        updatedAt: mutation.payload.updatedAt,
        archivedAt: mutation.payload.archivedAt,
        version,
      },
      update: {
        content: mutation.payload.content,
        updatedAt: mutation.payload.updatedAt,
        archivedAt: mutation.payload.archivedAt,
        version,
      },
    });

    return { version: capture.version, archived: Boolean(capture.archivedAt) };
  }

  if (mutation.entityType === "concept") {
    const version = mutation.baseVersion === null ? 1 : mutation.baseVersion + 1;
    const concept = await tx.concept.upsert({
      where: { id: mutation.entityId },
      create: {
        id: mutation.entityId,
        workspaceId,
        label: mutation.payload.label,
        normalizedKey: mutation.payload.normalizedKey,
        aliases: mutation.payload.aliases,
        normalizedAliases: mutation.payload.normalizedAliases,
        createdAt: mutation.payload.createdAt,
        updatedAt: mutation.payload.updatedAt,
        archivedAt: mutation.payload.archivedAt,
        mergedIntoId: mutation.payload.mergedIntoId,
        version,
      },
      update: {
        label: mutation.payload.label,
        normalizedKey: mutation.payload.normalizedKey,
        aliases: mutation.payload.aliases,
        normalizedAliases: mutation.payload.normalizedAliases,
        updatedAt: mutation.payload.updatedAt,
        archivedAt: mutation.payload.archivedAt,
        mergedIntoId: mutation.payload.mergedIntoId,
        version,
      },
    });

    return { version: concept.version, archived: Boolean(concept.archivedAt) };
  }

  const capture = await tx.capture.findUnique({
    where: { id: mutation.payload.captureId },
  });
  const concept = await tx.concept.findUnique({
    where: { id: mutation.payload.conceptId },
  });

  if (!capture || !concept || capture.workspaceId !== workspaceId || concept.workspaceId !== workspaceId) {
    throw new Error("La relacion cruza workspaces o entidades inexistentes.");
  }

  const version = mutation.baseVersion === null ? 1 : mutation.baseVersion + 1;
  const relation = await tx.captureConcept.upsert({
    where: { id: mutation.entityId },
    create: {
      id: mutation.entityId,
      captureId: mutation.payload.captureId,
      conceptId: mutation.payload.conceptId,
      source: mutation.payload.source,
      createdAt: mutation.payload.createdAt,
      updatedAt: mutation.payload.updatedAt,
      archivedAt: mutation.payload.archivedAt,
      version,
    },
    update: {
      source: mutation.payload.source,
      updatedAt: mutation.payload.updatedAt,
      archivedAt: mutation.payload.archivedAt,
      version,
    },
  });

  return { version: relation.version, archived: Boolean(relation.archivedAt) };
}

function toCaptureEntity(capture: {
  id: string;
  workspaceId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  version: number;
}): CaptureEntity {
  return {
    id: capture.id,
    workspaceId: capture.workspaceId,
    content: capture.content,
    createdAt: capture.createdAt.toISOString(),
    updatedAt: capture.updatedAt.toISOString(),
    archivedAt: capture.archivedAt?.toISOString() ?? null,
    version: capture.version,
  };
}

function toConceptEntity(concept: {
  id: string;
  workspaceId: string;
  label: string;
  normalizedKey: string;
  aliases: string[];
  normalizedAliases: string[];
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  mergedIntoId: string | null;
  version: number;
}): ConceptEntity {
  return {
    id: concept.id,
    workspaceId: concept.workspaceId,
    label: concept.label,
    normalizedKey: concept.normalizedKey,
    aliases: concept.aliases,
    normalizedAliases: concept.normalizedAliases,
    createdAt: concept.createdAt.toISOString(),
    updatedAt: concept.updatedAt.toISOString(),
    archivedAt: concept.archivedAt?.toISOString() ?? null,
    mergedIntoId: concept.mergedIntoId,
    version: concept.version,
  };
}

function fromPrismaEntityType(entityType: string): SyncEntityType {
  if (entityType === "CAPTURE") {
    return "capture";
  }

  if (entityType === "CONCEPT") {
    return "concept";
  }

  return "captureConcept";
}
