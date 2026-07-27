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

export function mapLocalNodeToCaptureMutation(input: {
  mutationId: string;
  node: Node;
  baseVersion: number | null;
}): SyncMutation {
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
  return {
    mutationId: input.mutationId,
    entityType: "concept",
    operation: "upsert",
    entityId: input.context.id,
    baseVersion: input.baseVersion,
    payload: {
      label: input.context.name,
      normalizedKey: createConceptEquivalenceKey(input.context.name),
      createdAt: input.context.createdAt,
      updatedAt: input.context.updatedAt,
      archivedAt: input.context.archivedAt,
      mergedIntoId: input.mergedIntoId ?? null,
    },
  };
}

export function mapLocalRelationToCaptureConceptMutation(input: {
  mutationId: string;
  relation: NodeContextRelation;
  baseVersion: number | null;
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
      updatedAt: input.relation.createdAt,
      archivedAt: null,
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
    status: capture.archivedAt ? "ARCHIVED" : "ACTIVE",
    organizationStatus: "ORGANIZED",
    metadata: {},
    version: capture.version,
    createdAt: capture.createdAt,
    contentUpdatedAt: capture.updatedAt,
    archivedAt: capture.archivedAt,
    restoredAt: null,
    updatedAt: capture.updatedAt,
    deletedAt: null,
    createdByDeviceId: deviceId,
    lastModifiedByDeviceId: deviceId,
  };
}

export function mapRemoteConceptToLocalContext(concept: ConceptEntity): Context {
  return {
    id: concept.id,
    workspaceId: concept.workspaceId,
    type: "AREA",
    name: concept.label,
    description: concept.mergedIntoId
      ? `Fusionado en ${concept.mergedIntoId}.`
      : null,
    createdAt: concept.createdAt,
    updatedAt: concept.updatedAt,
    archivedAt: concept.archivedAt,
  };
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
    createdAt: relation.createdAt,
  };
}
