import type { Node } from "@/domain/node/node";
import {
  combinations,
  latestEvidenceCaptureIds,
  relationshipKey,
  type CaptureEvidence,
  type ConceptRelationEvidence,
  type PersonalEvidence,
  type TemporalEvidence,
} from "@/features/cognition/personal-evidence";
import type {
  MemoryEvolutionKind,
  MemoryEvolutionSignal,
  MemoryEvolutionStrength,
} from "@/features/cognition/memory-evolution/memory-evolution";
import {
  DEFAULT_DORMANT_DAYS,
  DEFAULT_RECENT_WINDOW_DAYS,
  type EvolutionWindows,
} from "@/features/cognition/memory-evolution/memory-evolution";
import {
  aggregateSemanticStatements,
  type SemanticStatement,
  type SemanticStatementCandidate,
} from "@/features/cognition/semantic-understanding/semantic-statements";
import { getCapturePreview } from "@/features/node/node-display";
import { getContentTimestamp } from "@/features/capture/capture-timestamps";

export type ObservedPatternKind =
  | "RECURRENT_PAIR"
  | "EMERGING_RELATIONSHIP"
  | "DECLINING_RELATIONSHIP"
  | "STABLE_RELATIONSHIP"
  | "RECURRING_CLUSTER";

export type ObservedPatternStrength = "WEAK" | "MEDIUM" | "STRONG";

export interface ObservedPattern {
  id: string;
  kind: ObservedPatternKind;
  conceptIds: string[];
  strength: ObservedPatternStrength;
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

export type TemporalLearningSignal = MemoryEvolutionSignal;
export type ObservedRelation = SemanticStatement;

export interface PersonalLearning {
  observedPatterns: ObservedPattern[];
  temporalSignals: TemporalLearningSignal[];
  observedRelations: ObservedRelation[];
}

export interface CreatePersonalLearningOptions {
  evidence: PersonalEvidence;
  behavioralRecentWindowDays?: number;
  maxObservedPatterns?: number;
  evolutionRecentWindowDays?: number;
  dormantDays?: number;
  maxTemporalSignals?: number;
}

type ObservedRelationshipMetrics = Pick<
  ConceptRelationEvidence,
  | "totalCount"
  | "recentCount"
  | "previousCount"
  | "monthlySpread"
  | "firstSeenAt"
  | "latestActivityAt"
  | "sharedEvidenceNodeIds"
>;

interface PatternBucket {
  conceptIds: string[];
  captures: Map<string, CaptureEvidence>;
}

const DEFAULT_BEHAVIORAL_RECENT_WINDOW_DAYS = 60;
const DEFAULT_MAX_PATTERNS = 24;
const DEFAULT_MAX_SIGNALS = 40;
const MIN_PAIR_OCCURRENCES = 3;
const MIN_CLUSTER_OCCURRENCES = 2;
const MAX_CLUSTER_SIZE = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export function createPersonalLearning({
  evidence,
  behavioralRecentWindowDays = DEFAULT_BEHAVIORAL_RECENT_WINDOW_DAYS,
  maxObservedPatterns = DEFAULT_MAX_PATTERNS,
  evolutionRecentWindowDays = DEFAULT_RECENT_WINDOW_DAYS,
  dormantDays = DEFAULT_DORMANT_DAYS,
  maxTemporalSignals = DEFAULT_MAX_SIGNALS,
}: CreatePersonalLearningOptions): PersonalLearning {
  const behavioralEvidence = evidence.getTemporalEvidence({
    recentWindowDays: behavioralRecentWindowDays,
  });
  const observedPatterns = deriveObservedPatternsFromEvidence({
    evidence,
    relationshipSeries: Array.from(behavioralEvidence.relationshipSeriesByKey.values()),
    windows: behavioralEvidence.windows,
    maxPatterns: maxObservedPatterns,
  });
  const temporalSignals = deriveTemporalSignalsFromEvidence({
    evidence,
    recentWindowDays: evolutionRecentWindowDays,
    dormantDays,
    maxSignals: maxTemporalSignals,
  });
  const observedRelations = deriveObservedRelationsFromPatterns({
    patterns: observedPatterns,
    evidence,
  });

  return {
    observedPatterns,
    temporalSignals,
    observedRelations,
  };
}

export function deriveObservedPatternsFromEvidence({
  evidence,
  relationshipSeries,
  windows,
  maxPatterns = DEFAULT_MAX_PATTERNS,
}: {
  evidence: PersonalEvidence;
  relationshipSeries?: ConceptRelationEvidence[];
  windows?: PersonalEvidence["windows"];
  maxPatterns?: number;
}): ObservedPattern[] {
  if (maxPatterns <= 0) {
    return [];
  }

  const captures = evidence.evidenceCaptures.filter(
    (capture) => capture.conceptIds.length >= 2,
  );

  if (captures.length === 0) {
    return [];
  }

  return [
    ...deriveRelationshipObservations({
      relationshipSeries:
        relationshipSeries ?? Array.from(evidence.relationshipSeriesByKey.values()),
    }),
    ...deriveRecurringClusters({ captures, windows: windows ?? evidence.windows }),
  ]
    .sort(compareObservedPatterns)
    .slice(0, maxPatterns);
}

export function deriveRelationshipObservations({
  relationshipSeries,
}: {
  relationshipSeries: ConceptRelationEvidence[];
}): ObservedPattern[] {
  const patterns: ObservedPattern[] = [];

  for (const series of relationshipSeries) {
    if (series.totalCount < MIN_PAIR_OCCURRENCES) {
      continue;
    }

    patterns.push(
      createObservedPattern({
        kind: "RECURRENT_PAIR",
        conceptIds: series.conceptIds,
        metrics: series,
      }),
    );

    if (isEmerging(series)) {
      patterns.push(
        createObservedPattern({
          kind: "EMERGING_RELATIONSHIP",
          conceptIds: series.conceptIds,
          metrics: series,
        }),
      );
    }

    if (isDeclining(series)) {
      patterns.push(
        createObservedPattern({
          kind: "DECLINING_RELATIONSHIP",
          conceptIds: series.conceptIds,
          metrics: series,
        }),
      );
    }

    if (isStable(series)) {
      patterns.push(
        createObservedPattern({
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
  captures,
  windows,
}: {
  captures: CaptureEvidence[];
  windows: PersonalEvidence["windows"];
}): ObservedPattern[] {
  const buckets = new Map<string, PatternBucket>();

  for (const capture of captures) {
    const maxSize = Math.min(MAX_CLUSTER_SIZE, capture.conceptIds.length);

    for (let size = 3; size <= maxSize; size += 1) {
      for (const conceptIds of combinations(capture.conceptIds, size)) {
        addCaptureToBucket(buckets, conceptIds, capture);
      }
    }
  }

  return Array.from(buckets.values())
    .map((bucket) => {
      const metrics = calculateClusterMetrics({
        captures: Array.from(bucket.captures.values()),
        windows,
      });

      if (metrics.totalCount < MIN_CLUSTER_OCCURRENCES) {
        return null;
      }

      return createObservedPattern({
        kind: "RECURRING_CLUSTER",
        conceptIds: bucket.conceptIds,
        metrics,
      });
    })
    .filter((pattern): pattern is ObservedPattern => pattern !== null);
}

export function deriveTemporalSignalsFromEvidence({
  evidence,
  recentWindowDays = DEFAULT_RECENT_WINDOW_DAYS,
  dormantDays = DEFAULT_DORMANT_DAYS,
  maxSignals = DEFAULT_MAX_SIGNALS,
}: {
  evidence: PersonalEvidence;
  recentWindowDays?: number;
  dormantDays?: number;
  maxSignals?: number;
}): TemporalLearningSignal[] {
  if (maxSignals <= 0) {
    return [];
  }

  const temporalEvidence = evidence.getTemporalEvidence({
    recentWindowDays,
    dormantDays,
  });
  const windows: EvolutionWindows = {
    observedAt: temporalEvidence.windows.observedAt,
    recentStart: temporalEvidence.windows.recentStart,
    previousStart: temporalEvidence.windows.previousStart,
    dormantDays,
  };

  return Array.from(temporalEvidence.conceptSeriesById.values())
    .flatMap((input) =>
      deriveConceptTemporalSignals({
        input,
        windows,
      }),
    )
    .sort(compareTemporalSignals)
    .slice(0, maxSignals);
}

export function deriveConceptTemporalSignals({
  input,
  windows,
}: {
  input: TemporalEvidence;
  windows: EvolutionWindows;
}): TemporalLearningSignal[] {
  const timestamps = input.timestamps;

  if (timestamps.length === 0) {
    return [];
  }

  const latestTimestamp = Math.max(...timestamps);
  const inactiveDays = Math.floor(
    Math.max(0, windows.observedAt.getTime() - latestTimestamp) / DAY_MS,
  );
  const metricsBase = {
    totalMemories: input.evidenceNodeIds.length,
    recentMemories: input.recentEvidenceNodeIds.length,
    previousMemories: input.previousEvidenceNodeIds.length,
    inactiveDays,
    historicalMonthlySpread: input.monthlySpread,
    recentTopConnections: input.recentTopConnections,
    historicalTopConnections: input.historicalTopConnections,
  };
  const signals: TemporalLearningSignal[] = [];
  const firstObservedAt = Math.min(...timestamps);
  const timestampByNodeId = input.timestampByNodeId;

  if (firstObservedAt >= windows.recentStart && input.evidenceNodeIds.length >= 1) {
    signals.push(
      createTemporalSignal({
        kind: "NEW_CONCEPT",
        input,
        windows,
        metrics: metricsBase,
        evidenceNodeIds: latestEvidenceCaptureIds(
          input.recentEvidenceNodeIds,
          timestampByNodeId,
        ),
        strength: input.evidenceNodeIds.length >= 2 ? "MEDIUM" : "WEAK",
      }),
    );
  }

  const revived = isRevived({
    recentNodeIds: input.recentEvidenceNodeIds,
    previousNodeIds: input.previousEvidenceNodeIds,
    historicalNodeIds: input.historicalEvidenceNodeIds,
    timestampsByNodeId: timestampByNodeId,
    windows,
  });

  if (revived) {
    signals.push(
      createTemporalSignal({
        kind: "REVIVED_CONCEPT",
        input,
        windows,
        metrics: metricsBase,
        evidenceNodeIds: latestEvidenceCaptureIds(
          input.recentEvidenceNodeIds,
          timestampByNodeId,
        ),
        strength: input.recentEvidenceNodeIds.length >= 2 ? "STRONG" : "MEDIUM",
      }),
    );
  }

  if (
    input.recentEvidenceNodeIds.length >= 2 &&
    input.previousEvidenceNodeIds.length >= 1 &&
    input.recentEvidenceNodeIds.length >= input.previousEvidenceNodeIds.length * 2
  ) {
    signals.push(
      createTemporalSignal({
        kind: "GROWING_CONCEPT",
        input,
        windows,
        metrics: metricsBase,
        evidenceNodeIds: latestEvidenceCaptureIds(
          input.recentEvidenceNodeIds,
          timestampByNodeId,
        ),
        strength: input.recentEvidenceNodeIds.length >= 4 ? "STRONG" : "MEDIUM",
      }),
    );
  }

  if (
    input.previousEvidenceNodeIds.length >= 2 &&
    input.recentEvidenceNodeIds.length * 2 <=
      input.previousEvidenceNodeIds.length &&
    inactiveDays < windows.dormantDays
  ) {
    signals.push(
      createTemporalSignal({
        kind: "DECLINING_CONCEPT",
        input,
        windows,
        metrics: metricsBase,
        evidenceNodeIds: latestEvidenceCaptureIds(
          input.previousEvidenceNodeIds,
          timestampByNodeId,
        ),
        strength:
          input.previousEvidenceNodeIds.length >= 4 ? "STRONG" : "MEDIUM",
      }),
    );
  }

  if (
    input.evidenceNodeIds.length >= 3 &&
    input.monthlySpread >= 2 &&
    inactiveDays >= windows.dormantDays &&
    input.recentEvidenceNodeIds.length === 0
  ) {
    signals.push(
      createTemporalSignal({
        kind: "DORMANT_CONCEPT",
        input,
        windows,
        metrics: metricsBase,
        evidenceNodeIds: latestEvidenceCaptureIds(
          input.evidenceNodeIds,
          timestampByNodeId,
        ),
        strength: inactiveDays >= windows.dormantDays * 2 ? "STRONG" : "MEDIUM",
      }),
    );
  }

  if (
    input.evidenceNodeIds.length >= 4 &&
    input.monthlySpread >= 3 &&
    input.recentEvidenceNodeIds.length > 0 &&
    input.previousEvidenceNodeIds.length > 0 &&
    !hasExtremeVariation(
      input.recentEvidenceNodeIds.length,
      input.previousEvidenceNodeIds.length,
    )
  ) {
    signals.push(
      createTemporalSignal({
        kind: "STABLE_CONCEPT",
        input,
        windows,
        metrics: metricsBase,
        evidenceNodeIds: latestEvidenceCaptureIds(
          input.evidenceNodeIds,
          timestampByNodeId,
        ),
        strength: input.monthlySpread >= 4 ? "STRONG" : "MEDIUM",
      }),
    );
  }

  if (detectContextShift(input.recentTopConnections, input.historicalTopConnections)) {
    signals.push(
      createTemporalSignal({
        kind: "SHIFTING_CONTEXT",
        input,
        windows,
        metrics: metricsBase,
        evidenceNodeIds: latestEvidenceCaptureIds(
          input.recentEvidenceNodeIds,
          timestampByNodeId,
        ),
        strength: "MEDIUM",
      }),
    );
  }

  return signals;
}

export function deriveObservedRelationsFromPatterns({
  patterns,
  evidence,
}: {
  patterns: ObservedPattern[];
  evidence: PersonalEvidence;
}): ObservedRelation[] {
  return aggregateSemanticStatements(
    patterns
      .filter(shouldCreateObservedRelation)
      .flatMap((pattern) => observedRelationCandidatesForPattern(pattern, evidence)),
  );
}

export function detectContextShift(
  recentTopConnections: string[],
  historicalTopConnections: string[],
) {
  if (recentTopConnections.length < 2 || historicalTopConnections.length < 2) {
    return false;
  }

  const historical = new Set(historicalTopConnections.slice(0, 3));
  const overlap = recentTopConnections.slice(0, 3).filter((connection) =>
    historical.has(connection),
  ).length;

  return overlap === 0;
}

function addCaptureToBucket(
  buckets: Map<string, PatternBucket>,
  conceptIds: string[],
  capture: CaptureEvidence,
) {
  const sortedConceptIds = [...conceptIds].sort();
  const key = relationshipKey(sortedConceptIds);
  const bucket =
    buckets.get(key) ??
    ({
      conceptIds: sortedConceptIds,
      captures: new Map(),
    } satisfies PatternBucket);

  bucket.captures.set(capture.captureId, capture);
  buckets.set(key, bucket);
}

function calculateClusterMetrics({
  captures,
  windows,
}: {
  captures: CaptureEvidence[];
  windows: PersonalEvidence["windows"];
}): ObservedRelationshipMetrics {
  const timestamps = captures.map((capture) => capture.timestamp);
  const monthlySpread = new Set(
    timestamps.map((timestamp) => {
      const date = new Date(timestamp);
      return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`;
    }),
  ).size;

  return {
    totalCount: captures.length,
    recentCount: captures.filter((capture) =>
      capture.timestamp >= windows.recentStart &&
        capture.timestamp <= windows.observedAt.getTime(),
    ).length,
    previousCount: captures.filter((capture) =>
      capture.timestamp >= windows.previousStart &&
        capture.timestamp < windows.recentStart,
    ).length,
    monthlySpread,
    firstSeenAt: timestamps[0] ? new Date(Math.min(...timestamps)) : null,
    latestActivityAt: timestamps[0] ? new Date(Math.max(...timestamps)) : null,
    sharedEvidenceNodeIds: captures
      .sort((first, second) =>
        second.timestamp - first.timestamp ||
        first.captureId.localeCompare(second.captureId),
      )
      .map((capture) => capture.captureId)
      .slice(0, 5),
  };
}

function createObservedPattern({
  kind,
  conceptIds,
  metrics,
}: {
  kind: ObservedPatternKind;
  conceptIds: string[];
  metrics: ObservedRelationshipMetrics;
}): ObservedPattern {
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

function createPatternId(kind: ObservedPatternKind, conceptIds: string[]) {
  return `behavior:${kind.toLocaleLowerCase("en-US")}:${conceptIds.join("+")}`;
}

function calculatePatternStrength(metrics: ObservedRelationshipMetrics) {
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

function isEmerging(metrics: ObservedRelationshipMetrics) {
  return (
    metrics.totalCount >= MIN_PAIR_OCCURRENCES &&
    metrics.recentCount >= 2 &&
    metrics.recentCount >= Math.max(2, metrics.previousCount * 2)
  );
}

function isDeclining(metrics: ObservedRelationshipMetrics) {
  return (
    metrics.totalCount >= MIN_PAIR_OCCURRENCES &&
    metrics.previousCount >= 2 &&
    metrics.recentCount * 2 <= metrics.previousCount
  );
}

function isStable(metrics: ObservedRelationshipMetrics) {
  return (
    metrics.totalCount >= 4 &&
    metrics.monthlySpread >= 3 &&
    metrics.recentCount > 0 &&
    metrics.previousCount > 0 &&
    metrics.recentCount * 2 >= metrics.previousCount &&
    metrics.previousCount * 2 >= metrics.recentCount
  );
}

function compareObservedPatterns(first: ObservedPattern, second: ObservedPattern) {
  const kindDelta = patternKindRank(first.kind) - patternKindRank(second.kind);

  if (kindDelta !== 0) {
    return kindDelta;
  }

  const strengthDelta = patternStrengthRank(second.strength) - patternStrengthRank(first.strength);

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

function patternKindRank(kind: ObservedPatternKind) {
  return [
    "RECURRENT_PAIR",
    "EMERGING_RELATIONSHIP",
    "DECLINING_RELATIONSHIP",
    "STABLE_RELATIONSHIP",
    "RECURRING_CLUSTER",
  ].indexOf(kind);
}

function patternStrengthRank(strength: ObservedPatternStrength) {
  return strength === "STRONG" ? 3 : strength === "MEDIUM" ? 2 : 1;
}

function createTemporalSignal({
  kind,
  input,
  windows,
  metrics,
  evidenceNodeIds,
  strength,
}: {
  kind: MemoryEvolutionKind;
  input: TemporalEvidence;
  windows: EvolutionWindows;
  metrics: MemoryEvolutionSignal["metrics"];
  evidenceNodeIds: string[];
  strength: MemoryEvolutionStrength;
}): TemporalLearningSignal {
  return {
    id: `evolution:${kind.toLocaleLowerCase("en-US")}:${input.conceptId}`,
    kind,
    conceptId: input.conceptId,
    canonicalLabel: input.canonicalLabel,
    strength,
    observedAt: windows.observedAt,
    metrics,
    evidenceNodeIds,
  };
}

function isRevived({
  recentNodeIds,
  previousNodeIds,
  historicalNodeIds,
  timestampsByNodeId,
  windows,
}: {
  recentNodeIds: string[];
  previousNodeIds: string[];
  historicalNodeIds: string[];
  timestampsByNodeId: Map<string, number>;
  windows: EvolutionWindows;
}) {
  if (
    recentNodeIds.length === 0 ||
    previousNodeIds.length > 0 ||
    historicalNodeIds.length < 2
  ) {
    return false;
  }

  const oldestRecent = Math.min(
    ...recentNodeIds.map((nodeId) => timestampsByNodeId.get(nodeId) ?? Infinity),
  );
  const newestHistorical = Math.max(
    ...historicalNodeIds.map((nodeId) => timestampsByNodeId.get(nodeId) ?? 0),
  );

  return oldestRecent - newestHistorical >= windows.dormantDays * DAY_MS;
}

function hasExtremeVariation(recent: number, previous: number) {
  return recent >= previous * 2 || previous >= recent * 2;
}

function compareTemporalSignals(first: TemporalLearningSignal, second: TemporalLearningSignal) {
  const strengthDelta = evolutionStrengthRank(second.strength) - evolutionStrengthRank(first.strength);

  if (strengthDelta !== 0) {
    return strengthDelta;
  }

  const kindDelta = evolutionKindRank(first.kind) - evolutionKindRank(second.kind);

  if (kindDelta !== 0) {
    return kindDelta;
  }

  if (second.metrics.totalMemories !== first.metrics.totalMemories) {
    return second.metrics.totalMemories - first.metrics.totalMemories;
  }

  return first.id.localeCompare(second.id);
}

function evolutionKindRank(kind: MemoryEvolutionKind) {
  return [
    "NEW_CONCEPT",
    "GROWING_CONCEPT",
    "STABLE_CONCEPT",
    "DECLINING_CONCEPT",
    "DORMANT_CONCEPT",
    "REVIVED_CONCEPT",
    "SHIFTING_CONTEXT",
  ].indexOf(kind);
}

function evolutionStrengthRank(strength: MemoryEvolutionStrength) {
  return strength === "STRONG" ? 3 : strength === "MEDIUM" ? 2 : 1;
}

function shouldCreateObservedRelation(pattern: ObservedPattern) {
  return (
    pattern.conceptIds.length === 2 &&
    pattern.strength !== "WEAK" &&
    (pattern.kind === "RECURRENT_PAIR" || pattern.kind === "STABLE_RELATIONSHIP")
  );
}

function observedRelationCandidatesForPattern(
  pattern: ObservedPattern,
  evidence: PersonalEvidence,
): SemanticStatementCandidate[] {
  const [sourceConceptId, targetConceptId] = pattern.conceptIds;
  const source = evidence.conceptsById.get(sourceConceptId);
  const target = evidence.conceptsById.get(targetConceptId);
  const capturesById = new Map(
    evidence.evidenceCaptures.map((capture) => [capture.captureId, capture.capture]),
  );
  const captures = pattern.evidenceNodeIds
    .map((captureId) => capturesById.get(captureId) ?? null)
    .filter((capture): capture is Node => capture !== null)
    .slice(0, 3);

  if (!source || !target || captures.length === 0) {
    return [];
  }

  return captures.map((capture) => ({
    sourceConceptId,
    sourceLabel: source.concept.name,
    relation: "RELATED_TO",
    targetConceptId,
    targetLabel: target.concept.name,
    evidenceLevel: "CONTEXTUAL",
    evidence: {
      nodeId: capture.id,
      excerpt: getCapturePreview(capture.content, { maxLength: 190 }),
      createdAt: new Date(getContentTimestamp(capture)),
      matchedExpression: "asociación contextual recurrente",
    },
  }));
}
