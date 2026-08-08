import type { Context } from "@/domain/context/context";
import { normalizeContextNameForComparison } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import { getContentTimestamp } from "@/features/capture/capture-timestamps";

export interface RelatedConcept {
  id: string;
  label: string;
  normalizedLabel: string;
  sharedCaptureCount: number;
  lastSharedActivityAt: string;
  sharedCaptureIds: string[];
}

export interface ConceptNeighborhood {
  center: Context;
  relatedConcepts: RelatedConcept[];
}

export function deriveConceptNeighborhood({
  currentContextId,
  contexts,
  relations,
  nodes,
  limit = 8,
}: {
  currentContextId: string;
  contexts: Context[];
  relations: NodeContextRelation[];
  nodes: Node[];
  limit?: number;
}): ConceptNeighborhood | null {
  const center = contexts.find((context) => context.id === currentContextId);

  if (!center) {
    return null;
  }

  const contextsById = new Map(contexts.map((context) => [context.id, context]));
  const activeNodesById = new Map(
    nodes
      .filter((node) => node.deletedAt === null)
      .map((node) => [node.id, node]),
  );
  const nodeIdsForCenter = new Set(
    relations
      .filter((relation) => relation.contextId === currentContextId)
      .map((relation) => relation.nodeId)
      .filter((nodeId) => activeNodesById.has(nodeId)),
  );
  const relatedByNormalizedLabel = new Map<string, RelatedConcept>();

  for (const relation of relations) {
    if (
      relation.contextId === currentContextId ||
      !nodeIdsForCenter.has(relation.nodeId)
    ) {
      continue;
    }

    const context = contextsById.get(relation.contextId);
    const node = activeNodesById.get(relation.nodeId);

    if (!context || !node) {
      continue;
    }

    const normalizedLabel = normalizeContextNameForComparison(context.name);

    if (!normalizedLabel) {
      continue;
    }

    const existing = relatedByNormalizedLabel.get(normalizedLabel);
    const activityAt = getContentTimestamp(node);

    if (!existing) {
      relatedByNormalizedLabel.set(normalizedLabel, {
        id: context.id,
        label: context.name,
        normalizedLabel,
        sharedCaptureCount: 1,
        lastSharedActivityAt: activityAt,
        sharedCaptureIds: [node.id],
      });
      continue;
    }

    if (!existing.sharedCaptureIds.includes(node.id)) {
      existing.sharedCaptureIds.push(node.id);
      existing.sharedCaptureCount += 1;
    }

    if (Date.parse(activityAt) > Date.parse(existing.lastSharedActivityAt)) {
      existing.lastSharedActivityAt = activityAt;
    }
  }

  return {
    center,
    relatedConcepts: Array.from(relatedByNormalizedLabel.values())
      .sort(compareRelatedConcepts)
      .slice(0, Math.max(0, limit)),
  };
}

function compareRelatedConcepts(first: RelatedConcept, second: RelatedConcept) {
  if (second.sharedCaptureCount !== first.sharedCaptureCount) {
    return second.sharedCaptureCount - first.sharedCaptureCount;
  }

  const activityDelta =
    Date.parse(second.lastSharedActivityAt) -
    Date.parse(first.lastSharedActivityAt);

  if (activityDelta !== 0) {
    return activityDelta;
  }

  return first.label.localeCompare(second.label);
}
