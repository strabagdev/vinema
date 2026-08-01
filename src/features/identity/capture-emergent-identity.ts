import type { Context } from "@/domain/context/context";
import { normalizeContextNameForComparison } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";

export interface CaptureIdentityConcept {
  id: string;
  label: string;
  normalizedLabel: string;
}

export interface CaptureEmergentIdentity {
  concepts: CaptureIdentityConcept[];
  displayText: string | null;
  hiddenCount: number;
  visibleConcepts: CaptureIdentityConcept[];
}

export type DeriveCaptureEmergentIdentityInput = {
  contexts: Context[];
  relations: NodeContextRelation[];
  maxVisibleConcepts?: number;
  nodeId?: string;
};

const DEFAULT_MAX_VISIBLE_CONCEPTS = 3;

export function deriveCaptureEmergentIdentity({
  contexts,
  relations,
  maxVisibleConcepts = DEFAULT_MAX_VISIBLE_CONCEPTS,
  nodeId,
}: DeriveCaptureEmergentIdentityInput): CaptureEmergentIdentity {
  const contextsById = new Map(contexts.map((context) => [context.id, context]));
  const candidates = relations
    .filter((relation) => !nodeId || relation.nodeId === nodeId)
    .map((relation) => ({
      context: contextsById.get(relation.contextId) ?? null,
      relation,
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        context: Context;
        relation: NodeContextRelation;
      } => candidate.context !== null && candidate.context.archivedAt === null,
    )
    .sort(compareIdentityCandidates);

  const conceptsByNormalizedLabel = new Map<string, CaptureIdentityConcept>();

  for (const { context } of candidates) {
    const normalizedLabel = normalizeContextNameForComparison(context.name);

    if (!normalizedLabel || conceptsByNormalizedLabel.has(normalizedLabel)) {
      continue;
    }

    conceptsByNormalizedLabel.set(normalizedLabel, {
      id: context.id,
      label: context.name,
      normalizedLabel,
    });
  }

  const concepts = Array.from(conceptsByNormalizedLabel.values());
  const visibleLimit = Math.max(0, maxVisibleConcepts);
  const visibleConcepts = concepts.slice(0, visibleLimit);
  const hiddenCount = Math.max(0, concepts.length - visibleConcepts.length);
  const displayText =
    visibleConcepts.length > 0
      ? [
          visibleConcepts.map((concept) => concept.label).join(" · "),
          hiddenCount > 0 ? `+${hiddenCount}` : "",
        ]
          .filter(Boolean)
          .join(" · ")
      : null;

  return {
    concepts,
    displayText,
    hiddenCount,
    visibleConcepts,
  };
}

function compareIdentityCandidates(
  first: { context: Context; relation: NodeContextRelation },
  second: { context: Context; relation: NodeContextRelation },
) {
  const firstCreatedAt = Date.parse(first.relation.createdAt);
  const secondCreatedAt = Date.parse(second.relation.createdAt);

  if (firstCreatedAt !== secondCreatedAt) {
    return firstCreatedAt - secondCreatedAt;
  }

  const labelOrder = first.context.name.localeCompare(second.context.name);

  if (labelOrder !== 0) {
    return labelOrder;
  }

  return first.context.id.localeCompare(second.context.id);
}
