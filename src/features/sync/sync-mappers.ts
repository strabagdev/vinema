import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import type {
  CaptureConceptEntity,
  CaptureEntity,
  ConceptEntity,
  SyncMutation,
} from "@vinema/sync-contracts";
import { createConceptEquivalenceKey } from "@/features/associations/concept-label-normalization";
import { normalizeContextAliases } from "@/features/concepts/concept-identity";

export function mapLocalNodeToCaptureMutation(input: {
  mutationId: string;
  node: Node;
  baseVersion: number | null;
  operation?: "upsert" | "archive";
}): SyncMutation {
  if (input.operation === "archive") {
    return {
      mutationId: input.mutationId,
      entityType: "capture",
      operation: "archive",
      entityId: input.node.id,
      baseVersion: input.baseVersion,
      payload: {
        updatedAt: input.node.updatedAt,
        archivedAt: input.node.archivedAt ?? input.node.updatedAt,
      },
    };
  }

  return {
    mutationId: input.mutationId,
    entityType: "capture",
    operation: "upsert",
    entityId: input.node.id,
    baseVersion: input.baseVersion,
    payload: {
      content: input.node.content,
      createdAt: input.node.createdAt,
      updatedAt: input.node.updatedAt,
      archivedAt: input.node.archivedAt ?? null,
    },
  };
}

export function mapLocalContextToConceptMutation(input: {
  mutationId: string;
  context: Context;
  baseVersion: number | null;
  mergedIntoId?: string | null;
}): SyncMutation {
  const context = normalizeContextAliases(input.context);

  return {
    mutationId: input.mutationId,
    entityType: "concept",
    operation: "upsert",
    entityId: context.id,
    baseVersion: input.baseVersion,
    payload: {
      label: context.name,
      normalizedKey: createConceptEquivalenceKey(context.name),
      aliases: context.aliases ?? [],
      normalizedAliases: context.normalizedAliases ?? [],
      createdAt: context.createdAt,
      updatedAt: context.updatedAt,
      mergedIntoId: input.mergedIntoId ?? null,
    },
  };
}

export function mapLocalRelationToCaptureConceptMutation(input: {
  mutationId: string;
  relation: NodeContextRelation;
  baseVersion: number | null;
  updatedAt?: string;
  archivedAt?: string | null;
}): SyncMutation {
  return {
    mutationId: input.mutationId,
    entityType: "captureConcept",
    operation: "upsert",
    entityId: input.relation.id,
    baseVersion: input.baseVersion,
    payload: {
      captureId: input.relation.nodeId,
      conceptId: input.relation.contextId,
      source: "USER_CONFIRMED",
      createdAt: input.relation.createdAt,
      updatedAt: input.updatedAt ?? input.relation.createdAt,
      archivedAt: input.archivedAt ?? null,
    },
  };
}

export function mapRemoteCaptureToLocalNode(
  capture: CaptureEntity,
  deviceId: string,
): Node {
  return {
    id: capture.id,
    workspaceId: capture.workspaceId,
    type: "NOTE",
    content: capture.content,
    status: "ACTIVE",
    organizationStatus: "ORGANIZED",
    metadata: {},
    version: capture.version,
    createdAt: capture.createdAt,
    contentUpdatedAt: capture.updatedAt,
    archivedAt: capture.archivedAt ?? null,
    updatedAt: capture.updatedAt,
    deletedAt: null,
    createdByDeviceId: deviceId,
    lastModifiedByDeviceId: deviceId,
  };
}

export function mapRemoteConceptToLocalContext(concept: ConceptEntity): Context {
  return normalizeContextAliases({
    id: concept.id,
    workspaceId: concept.workspaceId,
    type: "AREA",
    name: concept.label,
    description: concept.mergedIntoId
      ? `Fusionado en ${concept.mergedIntoId}.`
      : null,
    version: concept.version,
    createdAt: concept.createdAt,
    updatedAt: concept.updatedAt,
    archivedAt: null,
    aliases: concept.aliases,
    normalizedAliases: concept.normalizedAliases,
  });
}

export function mapRemoteCaptureConceptToLocalRelation(
  relation: CaptureConceptEntity,
): NodeContextRelation {
  return {
    id: relation.id,
    workspaceId: relation.workspaceId,
    nodeId: relation.captureId,
    contextId: relation.conceptId,
    relationType: "CONTEXT",
    version: relation.version,
    createdAt: relation.createdAt,
  };
}
