import type { Context } from "@/domain/context/context";
import { normalizeContextNameForComparison } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import { getContentTimestamp } from "@/features/capture/capture-timestamps";

export type BehavioralPatternKind =
  | "RECURRENT_PAIR"
  | "EMERGING_RELATIONSHIP"
  | "DECLINING_RELATIONSHIP"
  | "STABLE_RELATIONSHIP"
  | "RECURRING_CLUSTER";

export type BehavioralPatternStrength = "WEAK" | "MEDIUM" | "STRONG";

export interface BehavioralPattern {
  id: string;
  kind: BehavioralPatternKind;
  conceptIds: string[];
  strength: BehavioralPatternStrength;
  firstObservedAt: Date | null;
  lastObservedAt: Date | null;
  evidenceNodeIds: string[];
  metrics: {
    totalOccurrences: number;
    recentOccurrences: number;
    previousOccurrences: number;
    monthlySpread: number;
  };
}

export interface DeriveBehavioralPatternsOptions {
  contexts: Context[];
  relations: NodeContextRelation[];
  nodes: Node[];
  now?: Date;
  recentWindowDays?: number;
  maxPatterns?: number;
}

interface BehavioralMemory {
  nodeId: string;
  timestamp: number;
  conceptIds: string[];
}

interface ConceptRecord {
  context: Context;
  normalizedLabel: string;
  identityLabels: Set<string>;
}

interface PatternBucket {
  conceptIds: string[];
  memories: Map<string, BehavioralMemory>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RECENT_WINDOW_DAYS = 60;
const DEFAULT_MAX_PATTERNS = 24;
const MIN_PAIR_OCCURRENCES = 3;
const MIN_CLUSTER_OCCURRENCES = 2;
const MAX_CLUSTER_SIZE = 5;

export function deriveBehavioralPatterns({
  contexts,
  relations,
  nodes,
  now = new Date(),
  recentWindowDays = DEFAULT_RECENT_WINDOW_DAYS,
  maxPatterns = DEFAULT_MAX_PATTERNS,
}: DeriveBehavioralPatternsOptions): BehavioralPattern[] {
  if (maxPatterns <= 0) {
    return [];
  }

  const memories = getBehavioralMemories({ contexts, relations, nodes });

  if (memories.length === 0) {
    return [];
  }

  return [
    ...deriveRelationshipBehavior({ memories, now, recentWindowDays }),
    ...deriveRecurringClusters({ memories, now, recentWindowDays }),
  ]
    .sort(compareBehavioralPatterns)
    .slice(0, maxPatterns);
}

export function deriveRelationshipBehavior({
  memories,
  now = new Date(),
  recentWindowDays = DEFAULT_RECENT_WINDOW_DAYS,
}: {
  memories: BehavioralMemory[];
  now?: Date;
  recentWindowDays?: number;
}): BehavioralPattern[] {
  const buckets = new Map<string, PatternBucket>();

  for (const memory of memories) {
    for (const conceptIds of combinations(memory.conceptIds, 2)) {
      addMemoryToBucket(buckets, conceptIds, memory);
    }
  }

  const patterns: BehavioralPattern[] = [];

  for (const bucket of buckets.values()) {
    const metrics = calculateMetrics({
      memories: Array.from(bucket.memories.values()),
      now,
      recentWindowDays,
    });

    if (metrics.totalOccurrences < MIN_PAIR_OCCURRENCES) {
      continue;
    }

    patterns.push(
      createPattern({
        kind: "RECURRENT_PAIR",
        bucket,
        metrics,
      }),
    );

    if (isEmerging(metrics)) {
      patterns.push(createPattern({ kind: "EMERGING_RELATIONSHIP", bucket, metrics }));
    }

    if (isDeclining(metrics)) {
      patterns.push(createPattern({ kind: "DECLINING_RELATIONSHIP", bucket, metrics }));
    }

    if (isStable(metrics)) {
      patterns.push(createPattern({ kind: "STABLE_RELATIONSHIP", bucket, metrics }));
    }
  }

  return patterns;
}

export function deriveRecurringClusters({
  memories,
  now = new Date(),
  recentWindowDays = DEFAULT_RECENT_WINDOW_DAYS,
}: {
  memories: BehavioralMemory[];
  now?: Date;
  recentWindowDays?: number;
}): BehavioralPattern[] {
  const buckets = new Map<string, PatternBucket>();

  for (const memory of memories) {
    const maxSize = Math.min(MAX_CLUSTER_SIZE, memory.conceptIds.length);

    for (let size = 3; size <= maxSize; size += 1) {
      for (const conceptIds of combinations(memory.conceptIds, size)) {
        addMemoryToBucket(buckets, conceptIds, memory);
      }
    }
  }

  return Array.from(buckets.values())
    .map((bucket) => {
      const metrics = calculateMetrics({
        memories: Array.from(bucket.memories.values()),
        now,
        recentWindowDays,
      });

      if (metrics.totalOccurrences < MIN_CLUSTER_OCCURRENCES) {
        return null;
      }

      return createPattern({ kind: "RECURRING_CLUSTER", bucket, metrics });
    })
    .filter((pattern): pattern is BehavioralPattern => pattern !== null);
}

export function describeBehavioralPattern(
  pattern: BehavioralPattern,
  conceptsById: Map<string, Context>,
) {
  const labels = pattern.conceptIds
    .map((conceptId) => conceptsById.get(conceptId)?.name ?? conceptId)
    .join(" + ");

  switch (pattern.kind) {
    case "RECURRENT_PAIR":
      return `Aparece frecuentemente junto a ${labels}.`;
    case "EMERGING_RELATIONSHIP":
      return `La relación ha aumentado recientemente: ${labels}.`;
    case "DECLINING_RELATIONSHIP":
      return `La actividad compartida ha disminuido: ${labels}.`;
    case "STABLE_RELATIONSHIP":
      return `La relación se mantiene estable: ${labels}.`;
    case "RECURRING_CLUSTER":
      return `Grupo recurrente observado: ${labels}.`;
  }
}

function getBehavioralMemories({
  contexts,
  relations,
  nodes,
}: {
  contexts: Context[];
  relations: NodeContextRelation[];
  nodes: Node[];
}): BehavioralMemory[] {
  const activeNodesById = new Map(
    nodes
      .filter((node) => node.deletedAt === null)
      .map((node) => [node.id, node]),
  );
  const conceptRecords = getConceptRecords(contexts);
  const conceptIdsByNodeId = getAcceptedConceptIdsByNodeId({
    relations,
    activeNodesById,
    conceptRecords,
  });
  const memories: BehavioralMemory[] = [];

  for (const [nodeId, conceptIds] of conceptIdsByNodeId.entries()) {
    const node = activeNodesById.get(nodeId);

    if (!node || conceptIds.length < 2) {
      continue;
    }

    const timestamp = Date.parse(getContentTimestamp(node));

    if (!Number.isFinite(timestamp)) {
      continue;
    }

    memories.push({
      nodeId,
      timestamp,
      conceptIds: [...conceptIds].sort(),
    });
  }

  return memories.sort((first, second) => first.timestamp - second.timestamp || first.nodeId.localeCompare(second.nodeId));
}

function getConceptRecords(contexts: Context[]) {
  const byId = new Map<string, ConceptRecord>();

  for (const context of contexts) {
    const normalizedLabel = normalizeContextNameForComparison(context.name);

    if (!normalizedLabel) {
      continue;
    }

    byId.set(context.id, {
      context,
      normalizedLabel,
      identityLabels: new Set(
        [context.name, ...(context.aliases ?? []), ...(context.normalizedAliases ?? [])]
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
  const identityLabelsByNodeId = new Map<string, Set<string>>();

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

    const usedLabels = identityLabelsByNodeId.get(relation.nodeId) ?? new Set<string>();
    const overlaps = Array.from(conceptRecord.identityLabels).some((label) =>
      usedLabels.has(label),
    );

    if (overlaps) {
      continue;
    }

    for (const label of conceptRecord.identityLabels) {
      usedLabels.add(label);
    }

    identityLabelsByNodeId.set(relation.nodeId, usedLabels);
    conceptIdsByNodeId.set(relation.nodeId, [
      ...(conceptIdsByNodeId.get(relation.nodeId) ?? []),
      relation.contextId,
    ]);
  }

  return conceptIdsByNodeId;
}

function addMemoryToBucket(
  buckets: Map<string, PatternBucket>,
  conceptIds: string[],
  memory: BehavioralMemory,
) {
  const sortedConceptIds = [...conceptIds].sort();
  const key = sortedConceptIds.join("+");
  const bucket =
    buckets.get(key) ??
    ({
      conceptIds: sortedConceptIds,
      memories: new Map(),
    } satisfies PatternBucket);

  bucket.memories.set(memory.nodeId, memory);
  buckets.set(key, bucket);
}

function calculateMetrics({
  memories,
  now,
  recentWindowDays,
}: {
  memories: BehavioralMemory[];
  now: Date;
  recentWindowDays: number;
}) {
  const nowMs = now.getTime();
  const recentStart = nowMs - recentWindowDays * DAY_MS;
  const previousStart = recentStart - recentWindowDays * DAY_MS;
  const timestamps = memories.map((memory) => memory.timestamp);
  const monthlySpread = new Set(
    timestamps.map((timestamp) => {
      const date = new Date(timestamp);
      return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`;
    }),
  ).size;

  return {
    totalOccurrences: memories.length,
    recentOccurrences: timestamps.filter((timestamp) => timestamp >= recentStart && timestamp <= nowMs).length,
    previousOccurrences: timestamps.filter((timestamp) => timestamp >= previousStart && timestamp < recentStart).length,
    monthlySpread,
    firstObservedAt: timestamps[0] ? new Date(Math.min(...timestamps)) : null,
    lastObservedAt: timestamps[0] ? new Date(Math.max(...timestamps)) : null,
    evidenceNodeIds: memories
      .sort((first, second) => second.timestamp - first.timestamp || first.nodeId.localeCompare(second.nodeId))
      .map((memory) => memory.nodeId)
      .slice(0, 5),
  };
}

function createPattern({
  kind,
  bucket,
  metrics,
}: {
  kind: BehavioralPatternKind;
  bucket: PatternBucket;
  metrics: ReturnType<typeof calculateMetrics>;
}): BehavioralPattern {
  return {
    id: createPatternId(kind, bucket.conceptIds),
    kind,
    conceptIds: bucket.conceptIds,
    strength: calculatePatternStrength(metrics),
    firstObservedAt: metrics.firstObservedAt,
    lastObservedAt: metrics.lastObservedAt,
    evidenceNodeIds: metrics.evidenceNodeIds,
    metrics: {
      totalOccurrences: metrics.totalOccurrences,
      recentOccurrences: metrics.recentOccurrences,
      previousOccurrences: metrics.previousOccurrences,
      monthlySpread: metrics.monthlySpread,
    },
  };
}

function createPatternId(kind: BehavioralPatternKind, conceptIds: string[]) {
  return `behavior:${kind.toLocaleLowerCase("en-US")}:${conceptIds.join("+")}`;
}

function calculatePatternStrength(metrics: ReturnType<typeof calculateMetrics>) {
  if (
    metrics.totalOccurrences >= 6 ||
    (metrics.totalOccurrences >= 4 && metrics.monthlySpread >= 3)
  ) {
    return "STRONG";
  }

  if (metrics.totalOccurrences >= 3 || metrics.monthlySpread >= 2) {
    return "MEDIUM";
  }

  return "WEAK";
}

function isEmerging(metrics: ReturnType<typeof calculateMetrics>) {
  return (
    metrics.totalOccurrences >= MIN_PAIR_OCCURRENCES &&
    metrics.recentOccurrences >= 2 &&
    metrics.recentOccurrences >= Math.max(2, metrics.previousOccurrences * 2)
  );
}

function isDeclining(metrics: ReturnType<typeof calculateMetrics>) {
  return (
    metrics.totalOccurrences >= MIN_PAIR_OCCURRENCES &&
    metrics.previousOccurrences >= 2 &&
    metrics.recentOccurrences * 2 <= metrics.previousOccurrences
  );
}

function isStable(metrics: ReturnType<typeof calculateMetrics>) {
  return (
    metrics.totalOccurrences >= 4 &&
    metrics.monthlySpread >= 3 &&
    metrics.recentOccurrences > 0 &&
    metrics.previousOccurrences > 0 &&
    metrics.recentOccurrences * 2 >= metrics.previousOccurrences &&
    metrics.previousOccurrences * 2 >= metrics.recentOccurrences
  );
}

function combinations(values: string[], size: number): string[][] {
  if (size <= 0 || values.length < size) {
    return [];
  }

  const result: string[][] = [];

  function visit(start: number, current: string[]) {
    if (current.length === size) {
      result.push(current);
      return;
    }

    for (let index = start; index <= values.length - (size - current.length); index += 1) {
      visit(index + 1, [...current, values[index]]);
    }
  }

  visit(0, []);

  return result;
}

function compareBehavioralPatterns(first: BehavioralPattern, second: BehavioralPattern) {
  const kindDelta = kindRank(first.kind) - kindRank(second.kind);

  if (kindDelta !== 0) {
    return kindDelta;
  }

  const strengthDelta = strengthRank(second.strength) - strengthRank(first.strength);

  if (strengthDelta !== 0) {
    return strengthDelta;
  }

  if (second.metrics.totalOccurrences !== first.metrics.totalOccurrences) {
    return second.metrics.totalOccurrences - first.metrics.totalOccurrences;
  }

  if (second.metrics.monthlySpread !== first.metrics.monthlySpread) {
    return second.metrics.monthlySpread - first.metrics.monthlySpread;
  }

  return first.id.localeCompare(second.id);
}

function kindRank(kind: BehavioralPatternKind) {
  return [
    "RECURRENT_PAIR",
    "EMERGING_RELATIONSHIP",
    "DECLINING_RELATIONSHIP",
    "STABLE_RELATIONSHIP",
    "RECURRING_CLUSTER",
  ].indexOf(kind);
}

function strengthRank(strength: BehavioralPatternStrength) {
  return strength === "STRONG" ? 3 : strength === "MEDIUM" ? 2 : 1;
}
