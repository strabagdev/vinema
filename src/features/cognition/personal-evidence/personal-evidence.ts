import type { Concept } from "@/domain/concept/concept";
import type { CaptureConceptRelation } from "@/domain/concept/capture-concept-relation";
import type { Capture } from "@/domain/capture/capture";
import { getContentTimestamp } from "@/features/capture/capture-timestamps";
import {
  createConceptIdentity,
  normalizeConceptIdentityLabel,
} from "@/features/concepts/concept-identity";

export interface CaptureEvidence {
  capture: Capture;
  captureId: string;
  /** @deprecated Use capture. Pending removal after cognitive terminology migration. */
  node: Capture;
  /** @deprecated Use captureId. Pending removal after cognitive terminology migration. */
  nodeId: string;
  timestamp: number;
  conceptIds: string[];
}

export interface ConceptEvidence {
  concept: Concept;
  /** @deprecated Use concept. Pending removal after cognitive terminology migration. */
  context: Concept;
  conceptId: string;
  canonicalLabel: string;
  identityLabels: Set<string>;
}

export interface TemporalWindows {
  observedAt: Date;
  recentStart: number;
  previousStart: number;
  dormantDays?: number;
}

export interface TemporalCounts {
  totalCount: number;
  recentCount: number;
  previousCount: number;
  historicalCount: number;
  monthlySpread: number;
  firstSeenAt: Date | null;
  latestActivityAt: Date | null;
}

export interface TemporalEvidence extends TemporalCounts {
  conceptId: string;
  canonicalLabel: string;
  evidenceCaptureIds: string[];
  /** @deprecated Use evidenceCaptureIds. Pending removal after cognitive terminology migration. */
  evidenceNodeIds: string[];
  timestamps: number[];
  timestampByCaptureId: Map<string, number>;
  /** @deprecated Use timestampByCaptureId. Pending removal after cognitive terminology migration. */
  timestampByNodeId: Map<string, number>;
  recentEvidenceCaptureIds: string[];
  /** @deprecated Use recentEvidenceCaptureIds. Pending removal after cognitive terminology migration. */
  recentEvidenceNodeIds: string[];
  previousEvidenceCaptureIds: string[];
  /** @deprecated Use previousEvidenceCaptureIds. Pending removal after cognitive terminology migration. */
  previousEvidenceNodeIds: string[];
  historicalEvidenceCaptureIds: string[];
  /** @deprecated Use historicalEvidenceCaptureIds. Pending removal after cognitive terminology migration. */
  historicalEvidenceNodeIds: string[];
  recentTopConnections: string[];
  historicalTopConnections: string[];
}

export interface ConceptRelationEvidence extends TemporalCounts {
  conceptIds: [string, string];
  sharedEvidenceCaptureIds: string[];
  /** @deprecated Use sharedEvidenceCaptureIds. Pending removal after cognitive terminology migration. */
  sharedEvidenceNodeIds: string[];
  timestamps: number[];
}

export interface PersonalEvidence {
  evidenceCaptures: CaptureEvidence[];
  /** @deprecated Use evidenceCaptures. Pending removal after cognitive terminology migration. */
  evidenceNodes: CaptureEvidence[];
  conceptsById: Map<string, ConceptEvidence>;
  conceptSeriesById: Map<string, TemporalEvidence>;
  relationshipSeriesByKey: Map<string, ConceptRelationEvidence>;
  windows: TemporalWindows;
  getTemporalEvidence(options: {
    recentWindowDays: number;
    dormantDays?: number;
  }): Pick<
    PersonalEvidence,
    "conceptSeriesById" | "relationshipSeriesByKey" | "windows"
  >;
}

export interface CreatePersonalEvidenceOptions {
  concepts: Concept[];
  relations: CaptureConceptRelation[];
  captures: Capture[];
  now?: Date;
  recentWindowDays: number;
  dormantDays?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function createPersonalEvidence({
  concepts,
  relations,
  captures,
  now = new Date(),
  recentWindowDays,
  dormantDays,
}: CreatePersonalEvidenceOptions): PersonalEvidence {
  const activeCapturesById = new Map(
    captures
      .filter(isCognitiveEvidenceCapture)
      .map((capture) => [capture.id, capture]),
  );
  const conceptsById = createConceptEvidences(concepts);
  const conceptIdsByCaptureId = getAcceptedConceptIdsByCaptureId({
    relations,
    activeCapturesById,
    conceptsById,
  });
  const evidenceCaptures = createEvidenceCaptures({
    activeCapturesById,
    conceptIdsByCaptureId,
  });
  const temporalCache = new Map<
    string,
    Pick<PersonalEvidence, "conceptSeriesById" | "relationshipSeriesByKey" | "windows">
  >();
  const createTemporalEvidence = (options: {
    recentWindowDays: number;
    dormantDays?: number;
  }) => {
    const cacheKey = `${options.recentWindowDays}:${options.dormantDays ?? ""}`;
    const cached = temporalCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const temporalWindows = createTemporalWindows({
      now,
      recentWindowDays: options.recentWindowDays,
      dormantDays: options.dormantDays,
    });
    const temporal = {
      conceptSeriesById: createConceptSeries({
        evidenceCaptures,
        conceptsById,
        windows: temporalWindows,
      }),
      relationshipSeriesByKey: createRelationshipSeries({
        evidenceCaptures,
        windows: temporalWindows,
      }),
      windows: temporalWindows,
    };
    temporalCache.set(cacheKey, temporal);
    return temporal;
  };
  const defaultTemporal = createTemporalEvidence({ recentWindowDays, dormantDays });

  return {
    evidenceCaptures,
    evidenceNodes: evidenceCaptures,
    conceptsById,
    conceptSeriesById: defaultTemporal.conceptSeriesById,
    relationshipSeriesByKey: defaultTemporal.relationshipSeriesByKey,
    windows: defaultTemporal.windows,
    getTemporalEvidence: createTemporalEvidence,
  };
}

export function createTemporalWindows({
  now,
  recentWindowDays,
  dormantDays,
}: {
  now: Date;
  recentWindowDays: number;
  dormantDays?: number;
}): TemporalWindows {
  const nowMs = now.getTime();

  return {
    observedAt: now,
    recentStart: nowMs - recentWindowDays * DAY_MS,
    previousStart: nowMs - recentWindowDays * 2 * DAY_MS,
    dormantDays,
  };
}

export function isRecent(timestamp: number | undefined, windows: TemporalWindows) {
  return typeof timestamp === "number" &&
    timestamp >= windows.recentStart &&
    timestamp <= windows.observedAt.getTime();
}

export function isPrevious(timestamp: number | undefined, windows: TemporalWindows) {
  return typeof timestamp === "number" &&
    timestamp >= windows.previousStart &&
    timestamp < windows.recentStart;
}

export function isHistorical(timestamp: number | undefined, windows: TemporalWindows) {
  return typeof timestamp === "number" && timestamp < windows.recentStart;
}

export function countMonthlySpread(timestamps: number[]) {
  return new Set(
    timestamps.map((timestamp) => {
      const date = new Date(timestamp);
      return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`;
    }),
  ).size;
}

export function latestEvidenceCaptureIds(
  captureIds: string[],
  timestampByCaptureId: Map<string, number>,
  limit = 5,
) {
  return [...captureIds]
    .sort((first, second) =>
      (timestampByCaptureId.get(second) ?? 0) -
        (timestampByCaptureId.get(first) ?? 0) ||
      first.localeCompare(second),
    )
    .slice(0, limit);
}

export function relationshipKey(conceptIds: string[]) {
  return [...conceptIds].sort().join("+");
}

export function combinations(values: string[], size: number): string[][] {
  if (size <= 0 || values.length < size) {
    return [];
  }

  const result: string[][] = [];

  function visit(start: number, current: string[]) {
    if (current.length === size) {
      result.push(current);
      return;
    }

    for (
      let index = start;
      index <= values.length - (size - current.length);
      index += 1
    ) {
      visit(index + 1, [...current, values[index]]);
    }
  }

  visit(0, []);

  return result;
}

function isCognitiveEvidenceCapture(capture: Capture) {
  return capture.deletedAt === null && !capture.archivedAt;
}

function createConceptEvidences(concepts: Concept[]) {
  const records = new Map<string, ConceptEvidence>();

  for (const concept of concepts) {
    const identity = createConceptIdentity(concept);
    const identityLabels = new Set(
      [
        identity.canonicalLabel,
        ...identity.aliases,
        ...identity.normalizedAliases,
      ]
        .map(normalizeConceptIdentityLabel)
        .filter(Boolean),
    );

    if (identityLabels.size === 0) {
      continue;
    }

    records.set(concept.id, {
      concept,
      context: concept,
      conceptId: concept.id,
      canonicalLabel: identity.canonicalLabel,
      identityLabels,
    });
  }

  return records;
}

function getAcceptedConceptIdsByCaptureId({
  relations,
  activeCapturesById,
  conceptsById,
}: {
  relations: CaptureConceptRelation[];
  activeCapturesById: Map<string, Capture>;
  conceptsById: Map<string, ConceptEvidence>;
}) {
  const conceptIdsByCaptureId = new Map<string, string[]>();
  const identityLabelsByCaptureId = new Map<string, Set<string>>();

  for (const relation of relations) {
    if (
      relation.relationType === "CAPTURE_ASSOCIATION" ||
      !activeCapturesById.has(relation.nodeId)
    ) {
      continue;
    }

    const record = conceptsById.get(relation.contextId);

    if (!record) {
      continue;
    }

    const used = identityLabelsByCaptureId.get(relation.nodeId) ?? new Set<string>();
    const overlaps = Array.from(record.identityLabels).some((label) =>
      used.has(label),
    );

    if (overlaps) {
      continue;
    }

    for (const label of record.identityLabels) {
      used.add(label);
    }

    identityLabelsByCaptureId.set(relation.nodeId, used);
    conceptIdsByCaptureId.set(relation.nodeId, [
      ...(conceptIdsByCaptureId.get(relation.nodeId) ?? []),
      relation.contextId,
    ]);
  }

  return conceptIdsByCaptureId;
}

function createEvidenceCaptures({
  activeCapturesById,
  conceptIdsByCaptureId,
}: {
  activeCapturesById: Map<string, Capture>;
  conceptIdsByCaptureId: Map<string, string[]>;
}) {
  const evidenceCaptures: CaptureEvidence[] = [];

  for (const [captureId, conceptIds] of conceptIdsByCaptureId.entries()) {
    const capture = activeCapturesById.get(captureId);
    const timestamp = capture ? Date.parse(getContentTimestamp(capture)) : Number.NaN;

    if (!capture || conceptIds.length === 0 || !Number.isFinite(timestamp)) {
      continue;
    }

    evidenceCaptures.push({
      capture,
      captureId,
      node: capture,
      nodeId: captureId,
      timestamp,
      conceptIds: [...conceptIds].sort(),
    });
  }

  return evidenceCaptures.sort(
    (first, second) =>
      first.timestamp - second.timestamp ||
      first.captureId.localeCompare(second.captureId),
  );
}

function createConceptSeries({
  evidenceCaptures,
  conceptsById,
  windows,
}: {
  evidenceCaptures: CaptureEvidence[];
  conceptsById: Map<string, ConceptEvidence>;
  windows: TemporalWindows;
}) {
  const captureIdsByConceptId = new Map<string, Set<string>>();
  const timestampByCaptureId = new Map(
    evidenceCaptures.map((evidence) => [evidence.captureId, evidence.timestamp]),
  );
  const connectionsByCaptureId = new Map(
    evidenceCaptures.map((evidence) => [evidence.captureId, evidence.conceptIds]),
  );

  for (const evidence of evidenceCaptures) {
    for (const conceptId of evidence.conceptIds) {
      const captureIds = captureIdsByConceptId.get(conceptId) ?? new Set<string>();
      captureIds.add(evidence.captureId);
      captureIdsByConceptId.set(conceptId, captureIds);
    }
  }

  const seriesByConceptId = new Map<string, TemporalEvidence>();

  for (const [conceptId, captureIds] of captureIdsByConceptId.entries()) {
    const record = conceptsById.get(conceptId);

    if (!record) {
      continue;
    }

    const evidenceCaptureIds = Array.from(captureIds).sort();
    const timestamps = evidenceCaptureIds
      .map((captureId) => timestampByCaptureId.get(captureId))
      .filter((timestamp): timestamp is number => typeof timestamp === "number")
      .sort((first, second) => first - second);
    const recentEvidenceCaptureIds = evidenceCaptureIds.filter((captureId) =>
      isRecent(timestampByCaptureId.get(captureId), windows),
    );
    const previousEvidenceCaptureIds = evidenceCaptureIds.filter((captureId) =>
      isPrevious(timestampByCaptureId.get(captureId), windows),
    );
    const historicalEvidenceCaptureIds = evidenceCaptureIds.filter((captureId) =>
      isHistorical(timestampByCaptureId.get(captureId), windows),
    );
    const counts = temporalCounts({
      evidenceCaptureIds,
      timestamps,
      windows,
    });

    seriesByConceptId.set(conceptId, {
      conceptId,
      canonicalLabel: record.canonicalLabel,
      evidenceCaptureIds,
      evidenceNodeIds: evidenceCaptureIds,
      timestamps,
      timestampByCaptureId,
      timestampByNodeId: timestampByCaptureId,
      recentEvidenceCaptureIds,
      recentEvidenceNodeIds: recentEvidenceCaptureIds,
      previousEvidenceCaptureIds,
      previousEvidenceNodeIds: previousEvidenceCaptureIds,
      historicalEvidenceCaptureIds,
      historicalEvidenceNodeIds: historicalEvidenceCaptureIds,
      recentTopConnections: topConnections({
        captureIds: recentEvidenceCaptureIds,
        connectionsByCaptureId,
        currentConceptId: conceptId,
      }),
      historicalTopConnections: topConnections({
        captureIds: historicalEvidenceCaptureIds,
        connectionsByCaptureId,
        currentConceptId: conceptId,
      }),
      ...counts,
    });
  }

  return seriesByConceptId;
}

function createRelationshipSeries({
  evidenceCaptures,
  windows,
}: {
  evidenceCaptures: CaptureEvidence[];
  windows: TemporalWindows;
}) {
  const buckets = new Map<string, Set<string>>();
  const evidenceByCaptureId = new Map(
    evidenceCaptures.map((evidence) => [evidence.captureId, evidence]),
  );

  for (const evidence of evidenceCaptures) {
    for (const pair of combinations(evidence.conceptIds, 2)) {
      const key = relationshipKey(pair);
      const captureIds = buckets.get(key) ?? new Set<string>();
      captureIds.add(evidence.captureId);
      buckets.set(key, captureIds);
    }
  }

  const seriesByKey = new Map<string, ConceptRelationEvidence>();

  for (const [key, captureIds] of buckets.entries()) {
    const sharedEvidenceCaptureIds = Array.from(captureIds).sort();
    const timestamps = sharedEvidenceCaptureIds
      .map((captureId) => evidenceByCaptureId.get(captureId)?.timestamp)
      .filter((timestamp): timestamp is number => typeof timestamp === "number")
      .sort((first, second) => first - second);

    seriesByKey.set(key, {
      conceptIds: key.split("+") as [string, string],
      sharedEvidenceCaptureIds,
      sharedEvidenceNodeIds: sharedEvidenceCaptureIds,
      timestamps,
      ...temporalCounts({
        evidenceCaptureIds: sharedEvidenceCaptureIds,
        timestamps,
        windows,
      }),
    });
  }

  return seriesByKey;
}

function temporalCounts({
  evidenceCaptureIds,
  timestamps,
  windows,
}: {
  evidenceCaptureIds: string[];
  timestamps: number[];
  windows: TemporalWindows;
}): TemporalCounts {
  return {
    totalCount: evidenceCaptureIds.length,
    recentCount: timestamps.filter((timestamp) => isRecent(timestamp, windows))
      .length,
    previousCount: timestamps.filter((timestamp) => isPrevious(timestamp, windows))
      .length,
    historicalCount: timestamps.filter((timestamp) => isHistorical(timestamp, windows))
      .length,
    monthlySpread: countMonthlySpread(timestamps),
    firstSeenAt: timestamps[0] ? new Date(Math.min(...timestamps)) : null,
    latestActivityAt: timestamps[0] ? new Date(Math.max(...timestamps)) : null,
  };
}

function topConnections({
  captureIds,
  connectionsByCaptureId,
  currentConceptId,
}: {
  captureIds: string[];
  connectionsByCaptureId: Map<string, string[]>;
  currentConceptId: string;
}) {
  const counts = new Map<string, number>();

  for (const captureId of captureIds) {
    const conceptIds = connectionsByCaptureId.get(captureId) ?? [];

    for (const conceptId of conceptIds) {
      if (conceptId === currentConceptId) {
        continue;
      }

      counts.set(conceptId, (counts.get(conceptId) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort(
      ([firstId, firstCount], [secondId, secondCount]) =>
        secondCount - firstCount || firstId.localeCompare(secondId),
    )
    .map(([conceptId]) => conceptId)
    .slice(0, 3);
}
