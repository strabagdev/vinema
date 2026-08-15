import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import {
  combinations,
  createMemoryEvidenceModel,
  type MemoryEvidenceModel,
  type MemoryEvidenceNode,
  relationshipKey,
  type RelationshipMemorySeries,
} from "@/features/cognition/memory-evidence/memory-evidence-model";

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
  evidenceModel?: MemoryEvidenceModel;
}

interface PatternBucket {
  conceptIds: string[];
  memories: Map<string, MemoryEvidenceNode>;
}

type BehavioralMetrics = Pick<
  RelationshipMemorySeries,
  | "totalCount"
  | "recentCount"
  | "previousCount"
  | "monthlySpread"
  | "firstSeenAt"
  | "latestActivityAt"
  | "sharedEvidenceNodeIds"
>;

export const DEFAULT_BEHAVIORAL_RECENT_WINDOW_DAYS = 60;
const DEFAULT_MAX_PATTERNS = 24;
const MIN_PAIR_OCCURRENCES = 3;
const MIN_CLUSTER_OCCURRENCES = 2;
const MAX_CLUSTER_SIZE = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export function deriveBehavioralPatterns({
  contexts,
  relations,
  nodes,
  now = new Date(),
  recentWindowDays = DEFAULT_BEHAVIORAL_RECENT_WINDOW_DAYS,
  maxPatterns = DEFAULT_MAX_PATTERNS,
  evidenceModel,
}: DeriveBehavioralPatternsOptions): BehavioralPattern[] {
  if (maxPatterns <= 0) {
    return [];
  }

  const model =
    evidenceModel ??
    createMemoryEvidenceModel({
      contexts,
      relations,
      nodes,
      now,
      recentWindowDays,
    });
  const memories = model.evidenceNodes.filter(
    (memory) => memory.conceptIds.length >= 2,
  );

  if (memories.length === 0) {
    return [];
  }

  return [
    ...deriveRelationshipBehavior({
      relationshipSeries: Array.from(model.relationshipSeriesByKey.values()),
    }),
    ...deriveRecurringClusters({ memories, now, recentWindowDays }),
  ]
    .sort(compareBehavioralPatterns)
    .slice(0, maxPatterns);
}

export function deriveRelationshipBehavior({
  relationshipSeries,
}: {
  relationshipSeries: RelationshipMemorySeries[];
}): BehavioralPattern[] {
  const patterns: BehavioralPattern[] = [];

  for (const series of relationshipSeries) {
    if (series.totalCount < MIN_PAIR_OCCURRENCES) {
      continue;
    }

    patterns.push(
      createPattern({
        kind: "RECURRENT_PAIR",
        conceptIds: series.conceptIds,
        metrics: series,
      }),
    );

    if (isEmerging(series)) {
      patterns.push(
        createPattern({
          kind: "EMERGING_RELATIONSHIP",
          conceptIds: series.conceptIds,
          metrics: series,
        }),
      );
    }

    if (isDeclining(series)) {
      patterns.push(
        createPattern({
          kind: "DECLINING_RELATIONSHIP",
          conceptIds: series.conceptIds,
          metrics: series,
        }),
      );
    }

    if (isStable(series)) {
      patterns.push(
        createPattern({
          kind: "STABLE_RELATIONSHIP",
          conceptIds: series.conceptIds,
          metrics: series,
        }),
      );
    }
  }

  return patterns;
}

export function deriveRecurringClusters({
  memories,
  now = new Date(),
  recentWindowDays = DEFAULT_BEHAVIORAL_RECENT_WINDOW_DAYS,
}: {
  memories: MemoryEvidenceNode[];
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

      if (metrics.totalCount < MIN_CLUSTER_OCCURRENCES) {
        return null;
      }

      return createPattern({
        kind: "RECURRING_CLUSTER",
        conceptIds: bucket.conceptIds,
        metrics,
      });
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

function addMemoryToBucket(
  buckets: Map<string, PatternBucket>,
  conceptIds: string[],
  memory: MemoryEvidenceNode,
) {
  const sortedConceptIds = [...conceptIds].sort();
  const key = relationshipKey(sortedConceptIds);
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
  memories: MemoryEvidenceNode[];
  now: Date;
  recentWindowDays: number;
}): BehavioralMetrics {
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
    totalCount: memories.length,
    recentCount: timestamps.filter((timestamp) => timestamp >= recentStart && timestamp <= nowMs).length,
    previousCount: timestamps.filter((timestamp) => timestamp >= previousStart && timestamp < recentStart).length,
    monthlySpread,
    firstSeenAt: timestamps[0] ? new Date(Math.min(...timestamps)) : null,
    latestActivityAt: timestamps[0] ? new Date(Math.max(...timestamps)) : null,
    sharedEvidenceNodeIds: memories
      .sort((first, second) => second.timestamp - first.timestamp || first.nodeId.localeCompare(second.nodeId))
      .map((memory) => memory.nodeId)
      .slice(0, 5),
  };
}

function createPattern({
  kind,
  conceptIds,
  metrics,
}: {
  kind: BehavioralPatternKind;
  conceptIds: string[];
  metrics: BehavioralMetrics;
}): BehavioralPattern {
  return {
    id: createPatternId(kind, conceptIds),
    kind,
    conceptIds,
    strength: calculatePatternStrength(metrics),
    firstObservedAt: metrics.firstSeenAt,
    lastObservedAt: metrics.latestActivityAt,
    evidenceNodeIds: metrics.sharedEvidenceNodeIds,
    metrics: {
      totalOccurrences: metrics.totalCount,
      recentOccurrences: metrics.recentCount,
      previousOccurrences: metrics.previousCount,
      monthlySpread: metrics.monthlySpread,
    },
  };
}

function createPatternId(kind: BehavioralPatternKind, conceptIds: string[]) {
  return `behavior:${kind.toLocaleLowerCase("en-US")}:${conceptIds.join("+")}`;
}

function calculatePatternStrength(metrics: BehavioralMetrics) {
  if (
    metrics.totalCount >= 6 ||
    (metrics.totalCount >= 4 && metrics.monthlySpread >= 3)
  ) {
    return "STRONG";
  }

  if (metrics.totalCount >= 3 || metrics.monthlySpread >= 2) {
    return "MEDIUM";
  }

  return "WEAK";
}

function isEmerging(metrics: BehavioralMetrics) {
  return (
    metrics.totalCount >= MIN_PAIR_OCCURRENCES &&
    metrics.recentCount >= 2 &&
    metrics.recentCount >= Math.max(2, metrics.previousCount * 2)
  );
}

function isDeclining(metrics: BehavioralMetrics) {
  return (
    metrics.totalCount >= MIN_PAIR_OCCURRENCES &&
    metrics.previousCount >= 2 &&
    metrics.recentCount * 2 <= metrics.previousCount
  );
}

function isStable(metrics: BehavioralMetrics) {
  return (
    metrics.totalCount >= 4 &&
    metrics.monthlySpread >= 3 &&
    metrics.recentCount > 0 &&
    metrics.previousCount > 0 &&
    metrics.recentCount * 2 >= metrics.previousCount &&
    metrics.previousCount * 2 >= metrics.recentCount
  );
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
