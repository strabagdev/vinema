import type { Context } from "@/domain/context/context";
import { normalizeContextNameForComparison } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import { getContentTimestamp } from "@/features/capture/capture-timestamps";
import { deriveCaptureEmergentIdentity } from "@/features/identity/capture-emergent-identity";
import { getCapturePreview } from "@/features/node/node-display";

export type RelationshipStrength = "WEAK" | "MEDIUM" | "STRONG";

export interface DerivedConceptRelationship {
  sourceConceptId: string;
  targetConceptId: string;
  sourceLabel: string;
  targetLabel: string;
  sharedMemoryCount: number;
  firstSharedAt: Date | null;
  lastSharedAt: Date | null;
  recentSharedMemoryCount: number;
  monthlySpread: number;
  strength: RelationshipStrength;
  score: number;
  evidence: RelationshipEvidence[];
}

export interface RelationshipEvidence {
  nodeId: string;
  excerpt: string;
  createdAt: Date;
  identityLabels: string[];
}

export interface ConceptGraphNeighborhood {
  center: ConceptGraphNode;
  nodes: ConceptGraphNode[];
  edges: ConceptGraphEdge[];
}

export interface ConceptGraphNode {
  conceptId: string;
  label: string;
  memoryCount: number;
}

export interface ConceptGraphEdge {
  sourceId: string;
  targetId: string;
  strength: RelationshipStrength;
  sharedMemoryCount: number;
}

const DEFAULT_RELATIONSHIP_LIMIT = 8;
const DEFAULT_EVIDENCE_LIMIT = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export function deriveConceptRelationships({
  sourceConceptId,
  contexts,
  relations,
  nodes,
  now = new Date(),
  limit = DEFAULT_RELATIONSHIP_LIMIT,
}: {
  sourceConceptId: string;
  contexts: Context[];
  relations: NodeContextRelation[];
  nodes: Node[];
  now?: Date;
  limit?: number;
}): DerivedConceptRelationship[] {
  const source = contexts.find((context) => context.id === sourceConceptId);

  if (!source || source.archivedAt !== null || limit <= 0) {
    return [];
  }

  const activeNodesById = getActiveNodesById(nodes);
  const conceptRecords = getConceptRecords(contexts);
  const sourceRecord = conceptRecords.byId.get(sourceConceptId);

  if (!sourceRecord) {
    return [];
  }

  const acceptedConceptIdsByNodeId = getAcceptedConceptIdsByNodeId({
    relations,
    activeNodesById,
    conceptRecords,
  });
  const globalMemoryCounts = countGlobalConceptMemories(acceptedConceptIdsByNodeId);
  const buckets = new Map<string, RelationshipBucket>();

  for (const [nodeId, conceptIds] of acceptedConceptIdsByNodeId.entries()) {
    if (!conceptIds.includes(sourceConceptId)) {
      continue;
    }

    const node = activeNodesById.get(nodeId);

    if (!node) {
      continue;
    }

    for (const targetConceptId of conceptIds) {
      if (targetConceptId === sourceConceptId) {
        continue;
      }

      const targetRecord = conceptRecords.byId.get(targetConceptId);

      if (!targetRecord || targetRecord.context.archivedAt !== null) {
        continue;
      }

      if (sourceRecord.identityLabels.has(targetRecord.normalizedLabel)) {
        continue;
      }

      const bucket =
        buckets.get(targetConceptId) ??
        createRelationshipBucket({
          source,
          target: targetRecord.context,
          targetConceptId,
        });

      bucket.nodes.set(nodeId, node);
      bucket.conceptsPerMemory.set(nodeId, conceptIds.length);
      buckets.set(targetConceptId, bucket);
    }
  }

  return Array.from(buckets.values())
    .map((bucket) =>
      materializeRelationship({
        bucket,
        contexts,
        relations,
        now,
        activeNodeCount: activeNodesById.size,
        targetGlobalMemoryCount: globalMemoryCounts.get(bucket.targetConceptId) ?? 0,
      }),
    )
    .sort(compareRelationships)
    .slice(0, Math.max(0, limit));
}

export function calculateRelationshipStrength({
  sharedMemoryCount,
  recentSharedMemoryCount,
  monthlySpread,
  averageConceptsPerMemory,
  firstSharedAt,
  lastSharedAt,
  genericConceptFrequency = 0,
}: {
  sharedMemoryCount: number;
  recentSharedMemoryCount: number;
  monthlySpread: number;
  averageConceptsPerMemory: number;
  firstSharedAt: Date | null;
  lastSharedAt: Date | null;
  genericConceptFrequency?: number;
}): { score: number; strength: RelationshipStrength } {
  if (sharedMemoryCount <= 0) {
    return { score: 0, strength: "WEAK" };
  }

  const countSignal = Math.min(0.42, Math.log2(sharedMemoryCount + 1) * 0.15);
  const recentSignal = Math.min(0.16, recentSharedMemoryCount * 0.045);
  const spreadSignal = Math.min(0.16, Math.max(0, monthlySpread - 1) * 0.055);
  const specificitySignal =
    averageConceptsPerMemory <= 3
      ? 0.14
      : averageConceptsPerMemory <= 5
        ? 0.08
        : -0.1;
  const durationDays =
    firstSharedAt && lastSharedAt
      ? Math.max(0, lastSharedAt.getTime() - firstSharedAt.getTime()) / DAY_MS
      : 0;
  const durationSignal = durationDays >= 90 ? 0.12 : durationDays >= 30 ? 0.08 : 0;
  const genericPenalty = Math.max(0, genericConceptFrequency - 0.35) * 0.45;
  const score = clamp01(
    countSignal +
      recentSignal +
      spreadSignal +
      specificitySignal +
      durationSignal -
      genericPenalty,
  );

  if (score >= 0.72) {
    return { score, strength: "STRONG" };
  }

  if (score >= 0.45) {
    return { score, strength: "MEDIUM" };
  }

  return { score, strength: "WEAK" };
}

export function selectRelationshipEvidence({
  nodes,
  contexts,
  relations,
  conceptsPerMemory,
  limit = DEFAULT_EVIDENCE_LIMIT,
}: {
  nodes: Node[];
  contexts: Context[];
  relations: NodeContextRelation[];
  conceptsPerMemory?: Map<string, number>;
  limit?: number;
}): RelationshipEvidence[] {
  if (nodes.length === 0 || limit <= 0) {
    return [];
  }

  const sorted = [...nodes].sort(compareNodesByTimestampAsc);
  const newest = [...sorted].reverse()[0];
  const oldest = sorted[0];
  const specific = [...sorted].sort((first, second) => {
    const firstCount = conceptsPerMemory?.get(first.id) ?? 1;
    const secondCount = conceptsPerMemory?.get(second.id) ?? 1;

    if (firstCount !== secondCount) {
      return firstCount - secondCount;
    }

    return compareNodesByTimestampDesc(first, second);
  })[0];
  const middle = sorted[Math.floor(sorted.length / 2)];
  const selected: Node[] = [];

  for (const node of [newest, oldest, specific, middle]) {
    if (!node || selected.some((item) => item.id === node.id)) {
      continue;
    }

    selected.push(node);

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
      excerpt: getCapturePreview(node.content, { maxLength: 170 }),
      createdAt: new Date(getContentTimestamp(node)),
      identityLabels: identity.concepts.map((concept) => concept.label),
    };
  });
}

export function deriveConceptGraphNeighborhood({
  currentConceptId,
  contexts,
  relations,
  nodes,
  now = new Date(),
  limit = DEFAULT_RELATIONSHIP_LIMIT,
}: {
  currentConceptId: string;
  contexts: Context[];
  relations: NodeContextRelation[];
  nodes: Node[];
  now?: Date;
  limit?: number;
}): ConceptGraphNeighborhood | null {
  const center = contexts.find((context) => context.id === currentConceptId);

  if (!center || center.archivedAt !== null) {
    return null;
  }

  const relationships = deriveConceptRelationships({
    sourceConceptId: currentConceptId,
    contexts,
    relations,
    nodes,
    now,
    limit,
  });
  const memoryCounts = countMemoriesByConcept({ contexts, relations, nodes });
  const graphNodes: ConceptGraphNode[] = [
    {
      conceptId: center.id,
      label: center.name,
      memoryCount: memoryCounts.get(center.id) ?? 0,
    },
    ...relationships.map((relationship) => ({
      conceptId: relationship.targetConceptId,
      label: relationship.targetLabel,
      memoryCount: memoryCounts.get(relationship.targetConceptId) ?? 0,
    })),
  ];

  return {
    center: graphNodes[0],
    nodes: graphNodes,
    edges: relationships.map((relationship) => ({
      sourceId: relationship.sourceConceptId,
      targetId: relationship.targetConceptId,
      strength: relationship.strength,
      sharedMemoryCount: relationship.sharedMemoryCount,
    })),
  };
}

function materializeRelationship({
  bucket,
  contexts,
  relations,
  now,
  activeNodeCount,
  targetGlobalMemoryCount,
}: {
  bucket: RelationshipBucket;
  contexts: Context[];
  relations: NodeContextRelation[];
  now: Date;
  activeNodeCount: number;
  targetGlobalMemoryCount: number;
}): DerivedConceptRelationship {
  const sharedNodes = Array.from(bucket.nodes.values()).sort(compareNodesByTimestampAsc);
  const timestamps = sharedNodes
    .map((node) => Date.parse(getContentTimestamp(node)))
    .filter(Number.isFinite)
    .sort((first, second) => first - second);
  const firstSharedAt = timestamps[0] ? new Date(timestamps[0]) : null;
  const lastSharedAt = timestamps.at(-1) ? new Date(timestamps.at(-1) as number) : null;
  const recentCutoff = now.getTime() - 30 * DAY_MS;
  const recentSharedMemoryCount = timestamps.filter(
    (timestamp) => timestamp >= recentCutoff,
  ).length;
  const monthlySpread = new Set(
    timestamps.map((timestamp) => {
      const date = new Date(timestamp);
      return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`;
    }),
  ).size;
  const averageConceptsPerMemory =
    Array.from(bucket.conceptsPerMemory.values()).reduce(
      (total, count) => total + count,
      0,
    ) / Math.max(bucket.conceptsPerMemory.size, 1);
  const { score, strength } = calculateRelationshipStrength({
    sharedMemoryCount: sharedNodes.length,
    recentSharedMemoryCount,
    monthlySpread,
    averageConceptsPerMemory,
    firstSharedAt,
    lastSharedAt,
    genericConceptFrequency:
      activeNodeCount >= 10 ? targetGlobalMemoryCount / activeNodeCount : 0,
  });

  return {
    sourceConceptId: bucket.sourceConceptId,
    targetConceptId: bucket.targetConceptId,
    sourceLabel: bucket.sourceLabel,
    targetLabel: bucket.targetLabel,
    sharedMemoryCount: sharedNodes.length,
    firstSharedAt,
    lastSharedAt,
    recentSharedMemoryCount,
    monthlySpread,
    strength,
    score,
    evidence: selectRelationshipEvidence({
      nodes: sharedNodes,
      contexts,
      relations,
      conceptsPerMemory: bucket.conceptsPerMemory,
    }),
  };
}

function getConceptRecords(contexts: Context[]) {
  const byId = new Map<string, ConceptRecord>();

  for (const context of contexts) {
    if (context.archivedAt !== null) {
      continue;
    }

    const normalizedLabel = normalizeContextNameForComparison(context.name);

    if (!normalizedLabel) {
      continue;
    }

    byId.set(context.id, {
      context,
      normalizedLabel,
      identityLabels: new Set(
        [context.name, ...(context.aliases ?? [])]
          .map((label) => normalizeContextNameForComparison(label))
          .filter(Boolean),
      ),
    });
  }

  return { byId };
}

function getAcceptedConceptIdsByNodeId({
  relations,
  activeNodesById,
  conceptRecords,
}: {
  relations: NodeContextRelation[];
  activeNodesById: Map<string, Node>;
  conceptRecords: ReturnType<typeof getConceptRecords>;
}) {
  const conceptIdsByNodeId = new Map<string, string[]>();
  const normalizedLabelsByNodeId = new Map<string, Set<string>>();

  for (const relation of relations) {
    if (
      relation.relationType === "CAPTURE_ASSOCIATION" ||
      !activeNodesById.has(relation.nodeId)
    ) {
      continue;
    }

    const conceptRecord = conceptRecords.byId.get(relation.contextId);

    if (!conceptRecord) {
      continue;
    }

    const usedLabels =
      normalizedLabelsByNodeId.get(relation.nodeId) ?? new Set<string>();

    if (usedLabels.has(conceptRecord.normalizedLabel)) {
      continue;
    }

    usedLabels.add(conceptRecord.normalizedLabel);
    normalizedLabelsByNodeId.set(relation.nodeId, usedLabels);
    conceptIdsByNodeId.set(relation.nodeId, [
      ...(conceptIdsByNodeId.get(relation.nodeId) ?? []),
      relation.contextId,
    ]);
  }

  return conceptIdsByNodeId;
}

function countGlobalConceptMemories(conceptIdsByNodeId: Map<string, string[]>) {
  const counts = new Map<string, number>();

  for (const conceptIds of conceptIdsByNodeId.values()) {
    for (const conceptId of conceptIds) {
      counts.set(conceptId, (counts.get(conceptId) ?? 0) + 1);
    }
  }

  return counts;
}

function countMemoriesByConcept({
  contexts,
  relations,
  nodes,
}: {
  contexts: Context[];
  relations: NodeContextRelation[];
  nodes: Node[];
}) {
  const activeNodesById = getActiveNodesById(nodes);
  const conceptRecords = getConceptRecords(contexts);
  const conceptIdsByNodeId = getAcceptedConceptIdsByNodeId({
    relations,
    activeNodesById,
    conceptRecords,
  });

  return countGlobalConceptMemories(conceptIdsByNodeId);
}

function getActiveNodesById(nodes: Node[]) {
  return new Map(
    nodes
      .filter((node) => node.status === "ACTIVE" && node.deletedAt === null)
      .map((node) => [node.id, node]),
  );
}

function createRelationshipBucket({
  source,
  target,
  targetConceptId,
}: {
  source: Context;
  target: Context;
  targetConceptId: string;
}): RelationshipBucket {
  return {
    sourceConceptId: source.id,
    targetConceptId,
    sourceLabel: source.name,
    targetLabel: target.name,
    nodes: new Map(),
    conceptsPerMemory: new Map(),
  };
}

function compareRelationships(
  first: DerivedConceptRelationship,
  second: DerivedConceptRelationship,
) {
  if (second.strength !== first.strength) {
    return strengthRank(second.strength) - strengthRank(first.strength);
  }

  if (second.sharedMemoryCount !== first.sharedMemoryCount) {
    return second.sharedMemoryCount - first.sharedMemoryCount;
  }

  if (second.score !== first.score) {
    return second.score - first.score;
  }

  const activityDelta =
    (second.lastSharedAt?.getTime() ?? 0) - (first.lastSharedAt?.getTime() ?? 0);

  if (activityDelta !== 0) {
    return activityDelta;
  }

  return first.targetLabel.localeCompare(second.targetLabel);
}

function strengthRank(strength: RelationshipStrength) {
  return strength === "STRONG" ? 3 : strength === "MEDIUM" ? 2 : 1;
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

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

interface ConceptRecord {
  context: Context;
  normalizedLabel: string;
  identityLabels: Set<string>;
}

interface RelationshipBucket {
  sourceConceptId: string;
  targetConceptId: string;
  sourceLabel: string;
  targetLabel: string;
  nodes: Map<string, Node>;
  conceptsPerMemory: Map<string, number>;
}
