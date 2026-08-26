import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import { getContentTimestamp } from "@/features/capture/capture-timestamps";
import {
  deriveConceptRelationships,
  type RelationshipEvidence,
  type RelationshipStrength,
} from "@/features/exploration/concept-relationships";
import { deriveCaptureEmergentIdentity } from "@/features/identity/capture-emergent-identity";
import { getCapturePreview } from "@/features/node/node-display";
import type { PersonalEvidence } from "@/features/cognition/personal-evidence";

export interface ConceptProfile {
  concept: {
    id: string;
    canonicalLabel: string;
    aliases: string[];
  };
  memoryCount: number;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
  relatedConcepts: ConceptProfileRelation[];
  representativeMemories: ConceptProfileMemory[];
  activity: ConceptActivitySummary;
}

export interface ConceptProfileRelation {
  conceptId: string;
  label: string;
  sharedMemoryCount: number;
  firstSharedAt: Date | null;
  lastSharedAt: Date | null;
  recentSharedMemoryCount: number;
  monthlySpread: number;
  strength: RelationshipStrength;
  evidence: RelationshipEvidence[];
}

export interface ConceptProfileMemory {
  nodeId: string;
  excerpt: string;
  createdAt: Date;
  identityLabels: string[];
}

export interface ConceptActivitySummary {
  total: number;
  last7Days: number;
  last30Days: number;
  monthlyBuckets: Array<{
    month: string;
    count: number;
  }>;
}

const DEFAULT_REPRESENTATIVE_LIMIT = 5;
const DEFAULT_RELATED_LIMIT = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

export function deriveConceptProfile({
  currentContextId,
  contexts,
  relations,
  nodes,
  now = new Date(),
  representativeLimit = DEFAULT_REPRESENTATIVE_LIMIT,
  relatedLimit = DEFAULT_RELATED_LIMIT,
  personalEvidence,
}: {
  currentContextId: string;
  contexts: Context[];
  relations: NodeContextRelation[];
  nodes: Node[];
  now?: Date;
  representativeLimit?: number;
  relatedLimit?: number;
  personalEvidence?: PersonalEvidence;
}): ConceptProfile | null {
  void personalEvidence;
  const concept = contexts.find((context) => context.id === currentContextId);

  if (!concept) {
    return null;
  }

  const activeNodesById = new Map(
    nodes
      .filter((node) => node.deletedAt === null)
      .map((node) => [node.id, node]),
  );
  const relationNodeIds = unique(
    relations
      .filter((relation) => relation.contextId === currentContextId)
      .map((relation) => relation.nodeId),
  );
  const memories = relationNodeIds
    .map((nodeId) => activeNodesById.get(nodeId) ?? null)
    .filter((node): node is Node => node !== null)
    .sort(compareNodesByTimestampAsc);
  const relatedConcepts = deriveRelatedConcepts({
    currentContextId,
    contexts,
    relations,
    nodes,
    limit: relatedLimit,
  });
  const representativeMemories = deriveRepresentativeMemories({
    currentContextId,
    contexts,
    relations,
    memories,
    limit: representativeLimit,
  });
  const activity = deriveConceptActivity({ memories, now });

  return {
    concept: {
      id: concept.id,
      canonicalLabel: concept.name,
      aliases: concept.aliases ?? [],
    },
    memoryCount: memories.length,
    firstSeenAt: toDateOrNull(memories[0] ? getContentTimestamp(memories[0]) : null),
    lastSeenAt: toDateOrNull(
      memories.at(-1) ? getContentTimestamp(memories.at(-1) as Node) : null,
    ),
    relatedConcepts,
    representativeMemories,
    activity,
  };
}

export function deriveRelatedConcepts({
  currentContextId,
  contexts,
  relations,
  nodes,
  limit = DEFAULT_RELATED_LIMIT,
}: {
  currentContextId: string;
  contexts: Context[];
  relations: NodeContextRelation[];
  nodes: Node[];
  limit?: number;
}): ConceptProfileRelation[] {
  return deriveConceptRelationships({
    sourceConceptId: currentContextId,
    contexts,
    relations,
    nodes,
    limit,
  }).map((relationship) => ({
    conceptId: relationship.targetConceptId,
    label: relationship.targetLabel,
    sharedMemoryCount: relationship.sharedMemoryCount,
    firstSharedAt: relationship.firstSharedAt,
    lastSharedAt: relationship.lastSharedAt,
    recentSharedMemoryCount: relationship.recentSharedMemoryCount,
    monthlySpread: relationship.monthlySpread,
    strength: relationship.strength,
    evidence: relationship.evidence,
  }));
}

export function deriveRepresentativeMemories({
  currentContextId,
  contexts,
  relations,
  memories,
  limit = DEFAULT_REPRESENTATIVE_LIMIT,
}: {
  currentContextId: string;
  contexts: Context[];
  relations: NodeContextRelation[];
  memories: Node[];
  limit?: number;
}): ConceptProfileMemory[] {
  if (memories.length === 0 || limit <= 0) {
    return [];
  }

  const byId = new Map(memories.map((node) => [node.id, node]));
  const newest = [...memories].sort(compareNodesByTimestampDesc)[0];
  const oldest = [...memories].sort(compareNodesByTimestampAsc)[0];
  const rich = [...memories].sort((first, second) => {
    const relationDelta =
      countAcceptedConcepts(second.id, currentContextId, relations) -
      countAcceptedConcepts(first.id, currentContextId, relations);

    if (relationDelta !== 0) {
      return relationDelta;
    }

    return compareNodesByTimestampDesc(first, second);
  });
  const temporal = pickTemporalSpread(memories, limit);
  const selected: Node[] = [];
  const usedExcerpts = new Set<string>();

  for (const node of [newest, oldest, ...rich, ...temporal]) {
    if (!node || !byId.has(node.id) || selected.some((item) => item.id === node.id)) {
      continue;
    }

    const excerptKey = getCapturePreview(node.content, { maxLength: 96 }).toLocaleLowerCase();

    if (usedExcerpts.has(excerptKey)) {
      continue;
    }

    selected.push(node);
    usedExcerpts.add(excerptKey);

    if (selected.length >= limit) {
      break;
    }
  }

  return selected.map((node) => {
    const identity = deriveCaptureEmergentIdentity({
      contexts,
      relations,
      nodeId: node.id,
      maxVisibleConcepts: 4,
    });

    return {
      nodeId: node.id,
      excerpt: getCapturePreview(node.content, { maxLength: 190 }),
      createdAt: new Date(getContentTimestamp(node)),
      identityLabels: identity.concepts.map((concept) => concept.label),
    };
  });
}

export function deriveConceptActivity({
  memories,
  now = new Date(),
}: {
  memories: Node[];
  now?: Date;
}): ConceptActivitySummary {
  const timestamps = memories
    .map((node) => Date.parse(getContentTimestamp(node)))
    .filter(Number.isFinite);
  const nowMs = now.getTime();
  const monthCounts = new Map<string, number>();

  for (const timestamp of timestamps) {
    const date = new Date(timestamp);
    const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);
  }

  return {
    total: memories.length,
    last7Days: timestamps.filter((timestamp) => nowMs - timestamp <= 7 * DAY_MS)
      .length,
    last30Days: timestamps.filter((timestamp) => nowMs - timestamp <= 30 * DAY_MS)
      .length,
    monthlyBuckets: Array.from(monthCounts.entries())
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([month, count]) => ({ month, count })),
  };
}

function countAcceptedConcepts(
  nodeId: string,
  currentContextId: string,
  relations: NodeContextRelation[],
) {
  return unique(
    relations
      .filter((relation) => relation.nodeId === nodeId)
      .filter((relation) => relation.contextId !== currentContextId)
      .filter((relation) => relation.relationType !== "CAPTURE_ASSOCIATION")
      .map((relation) => relation.contextId),
  ).length;
}

function pickTemporalSpread(memories: Node[], limit: number) {
  if (memories.length <= limit) {
    return memories;
  }

  const sorted = [...memories].sort(compareNodesByTimestampAsc);
  const result: Node[] = [];

  for (let index = 0; index < limit; index += 1) {
    const position = Math.round((index * (sorted.length - 1)) / Math.max(limit - 1, 1));
    result.push(sorted[position]);
  }

  return result;
}

function compareNodesByTimestampAsc(first: Node, second: Node) {
  const delta =
    Date.parse(getContentTimestamp(first)) - Date.parse(getContentTimestamp(second));

  return delta || first.id.localeCompare(second.id);
}

function compareNodesByTimestampDesc(first: Node, second: Node) {
  const delta =
    Date.parse(getContentTimestamp(second)) - Date.parse(getContentTimestamp(first));

  return delta || first.id.localeCompare(second.id);
}

function toDateOrNull(value: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}
