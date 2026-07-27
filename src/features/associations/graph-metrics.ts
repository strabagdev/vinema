import type { NodeContextRelation } from "@/domain/context/node-context-relation";

export type AssociationPair = {
  nodeId: string;
  relatedNodeId: string;
};

export function normalizeAssociationPair(
  firstNodeId: string,
  secondNodeId: string,
): AssociationPair {
  return firstNodeId.localeCompare(secondNodeId) <= 0
    ? { nodeId: firstNodeId, relatedNodeId: secondNodeId }
    : { nodeId: secondNodeId, relatedNodeId: firstNodeId };
}

export function getCaptureAssociationRelations(
  relations: NodeContextRelation[],
) {
  return relations.filter(
    (relation) =>
      relation.relationType === "CAPTURE_ASSOCIATION" && !!relation.relatedNodeId,
  );
}

export function getCaptureNeighbors(
  relations: NodeContextRelation[],
  nodeId: string,
) {
  const neighbors = new Set<string>();

  for (const relation of getCaptureAssociationRelations(relations)) {
    if (relation.nodeId === nodeId) {
      neighbors.add(relation.relatedNodeId ?? relation.contextId);
    } else if ((relation.relatedNodeId ?? relation.contextId) === nodeId) {
      neighbors.add(relation.nodeId);
    }
  }

  return Array.from(neighbors).sort();
}

export function getSharedNeighbors(
  relations: NodeContextRelation[],
  firstNodeId: string,
  secondNodeId: string,
) {
  const firstNeighbors = new Set(getCaptureNeighbors(relations, firstNodeId));

  return getCaptureNeighbors(relations, secondNodeId)
    .filter((neighborId) => firstNeighbors.has(neighborId))
    .sort();
}

export function countDirectRelations(
  relations: NodeContextRelation[],
  nodeId: string,
) {
  return getCaptureNeighbors(relations, nodeId).length;
}

export function countSharedNeighbors(
  relations: NodeContextRelation[],
  firstNodeId: string,
  secondNodeId: string,
) {
  return getSharedNeighbors(relations, firstNodeId, secondNodeId).length;
}

export function calculateNormalizedDegree(
  relations: NodeContextRelation[],
  nodeId: string,
  totalCaptures: number,
) {
  if (totalCaptures <= 1) {
    return 0;
  }

  return countDirectRelations(relations, nodeId) / (totalCaptures - 1);
}

export function detectLocalCenters(
  relations: NodeContextRelation[],
  nodeIds: string[],
  threshold = 0.5,
) {
  return nodeIds
    .map((nodeId) => ({
      nodeId,
      degree: countDirectRelations(relations, nodeId),
      normalizedDegree: calculateNormalizedDegree(
        relations,
        nodeId,
        nodeIds.length,
      ),
    }))
    .filter((candidate) => candidate.normalizedDegree >= threshold)
    .sort((a, b) => {
      if (b.normalizedDegree !== a.normalizedDegree) {
        return b.normalizedDegree - a.normalizedDegree;
      }

      return a.nodeId.localeCompare(b.nodeId);
    });
}
