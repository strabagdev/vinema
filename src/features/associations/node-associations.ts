import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { NodeContextRelationRepository } from "@/domain/context/node-context-relation-repository";
import { normalizeAssociationPair } from "@/features/associations/graph-metrics";

export async function attachCaptureAssociation(
  repository: NodeContextRelationRepository,
  input: {
    workspaceId: string;
    nodeId: string;
    relatedNodeId: string;
  },
): Promise<NodeContextRelation> {
  if (input.nodeId === input.relatedNodeId) {
    throw new Error("Una captura no puede asociarse consigo misma.");
  }

  const pair = normalizeAssociationPair(input.nodeId, input.relatedNodeId);
  const existingRelation = await repository.getByNodeAndContext(
    pair.nodeId,
    pair.relatedNodeId,
  );

  if (existingRelation) {
    return existingRelation;
  }

  return repository.save({
    id: crypto.randomUUID(),
    workspaceId: input.workspaceId,
    nodeId: pair.nodeId,
    contextId: pair.relatedNodeId,
    relationType: "CAPTURE_ASSOCIATION",
    relatedNodeId: pair.relatedNodeId,
    version: 1,
    createdAt: new Date().toISOString(),
  });
}

export async function attachCaptureAssociations(
  repository: NodeContextRelationRepository,
  input: {
    workspaceId: string;
    nodeId: string;
    relatedNodeIds: string[];
  },
) {
  const uniqueRelatedIds = Array.from(new Set(input.relatedNodeIds)).filter(
    (relatedNodeId) => relatedNodeId !== input.nodeId,
  );
  const persisted: NodeContextRelation[] = [];
  const failed: string[] = [];

  for (const relatedNodeId of uniqueRelatedIds) {
    try {
      persisted.push(
        await attachCaptureAssociation(repository, {
          workspaceId: input.workspaceId,
          nodeId: input.nodeId,
          relatedNodeId,
        }),
      );
    } catch {
      failed.push(relatedNodeId);
    }
  }

  return { persisted, failed };
}

export async function listAssociatedCaptureIds(
  repository: NodeContextRelationRepository,
  input: { workspaceId: string; nodeId: string },
) {
  const relations = await repository.listByWorkspace(input.workspaceId);
  const associatedIds = new Set<string>();

  for (const relation of relations) {
    if (relation.relationType !== "CAPTURE_ASSOCIATION") {
      continue;
    }

    const relatedNodeId = relation.relatedNodeId ?? relation.contextId;

    if (relation.nodeId === input.nodeId) {
      associatedIds.add(relatedNodeId);
    } else if (relatedNodeId === input.nodeId) {
      associatedIds.add(relation.nodeId);
    }
  }

  return Array.from(associatedIds).sort();
}
