import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import { getContentTimestamp } from "@/features/capture/capture-timestamps";
import {
  createConceptIdentity,
  normalizeConceptIdentityLabel,
} from "@/features/concepts/concept-identity";

export interface MemoryEvidenceNode {
  node: Node;
  nodeId: string;
  timestamp: number;
  conceptIds: string[];
}

export interface ConceptEvidenceRecord {
  context: Context;
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

export interface ConceptMemorySeries extends TemporalCounts {
  conceptId: string;
  canonicalLabel: string;
  evidenceNodeIds: string[];
  timestamps: number[];
  timestampByNodeId: Map<string, number>;
  recentEvidenceNodeIds: string[];
  previousEvidenceNodeIds: string[];
  historicalEvidenceNodeIds: string[];
  recentTopConnections: string[];
  historicalTopConnections: string[];
}

export interface RelationshipMemorySeries extends TemporalCounts {
  conceptIds: [string, string];
  sharedEvidenceNodeIds: string[];
  timestamps: number[];
}

export interface MemoryEvidenceModel {
  evidenceNodes: MemoryEvidenceNode[];
  conceptsById: Map<string, ConceptEvidenceRecord>;
  conceptSeriesById: Map<string, ConceptMemorySeries>;
  relationshipSeriesByKey: Map<string, RelationshipMemorySeries>;
  windows: TemporalWindows;
}

export interface CreateMemoryEvidenceModelOptions {
  contexts: Context[];
  relations: NodeContextRelation[];
  nodes: Node[];
  now?: Date;
  recentWindowDays: number;
  dormantDays?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function createMemoryEvidenceModel({
  contexts,
  relations,
  nodes,
  now = new Date(),
  recentWindowDays,
  dormantDays,
}: CreateMemoryEvidenceModelOptions): MemoryEvidenceModel {
  const windows = createTemporalWindows({ now, recentWindowDays, dormantDays });
  const activeNodesById = new Map(
    nodes
      .filter(isCognitiveEvidenceNode)
      .map((node) => [node.id, node]),
  );
  const conceptsById = createConceptEvidenceRecords(contexts);
  const conceptIdsByNodeId = getAcceptedConceptIdsByNodeId({
    relations,
    activeNodesById,
    conceptsById,
  });
  const evidenceNodes = createEvidenceNodes({
    activeNodesById,
    conceptIdsByNodeId,
  });

  return {
    evidenceNodes,
    conceptsById,
    conceptSeriesById: createConceptSeries({
      evidenceNodes,
      conceptsById,
      windows,
    }),
    relationshipSeriesByKey: createRelationshipSeries({
      evidenceNodes,
      windows,
    }),
    windows,
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

export function latestEvidenceNodeIds(
  nodeIds: string[],
  timestampByNodeId: Map<string, number>,
  limit = 5,
) {
  return [...nodeIds]
    .sort((first, second) =>
      (timestampByNodeId.get(second) ?? 0) -
        (timestampByNodeId.get(first) ?? 0) ||
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

function isCognitiveEvidenceNode(node: Node) {
  return node.deletedAt === null && !node.archivedAt;
}

function createConceptEvidenceRecords(contexts: Context[]) {
  const records = new Map<string, ConceptEvidenceRecord>();

  for (const context of contexts) {
    const identity = createConceptIdentity(context);
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

    records.set(context.id, {
      context,
      conceptId: context.id,
      canonicalLabel: identity.canonicalLabel,
      identityLabels,
    });
  }

  return records;
}

function getAcceptedConceptIdsByNodeId({
  relations,
  activeNodesById,
  conceptsById,
}: {
  relations: NodeContextRelation[];
  activeNodesById: Map<string, Node>;
  conceptsById: Map<string, ConceptEvidenceRecord>;
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

    const record = conceptsById.get(relation.contextId);

    if (!record) {
      continue;
    }

    const used = identityLabelsByNodeId.get(relation.nodeId) ?? new Set<string>();
    const overlaps = Array.from(record.identityLabels).some((label) =>
      used.has(label),
    );

    if (overlaps) {
      continue;
    }

    for (const label of record.identityLabels) {
      used.add(label);
    }

    identityLabelsByNodeId.set(relation.nodeId, used);
    conceptIdsByNodeId.set(relation.nodeId, [
      ...(conceptIdsByNodeId.get(relation.nodeId) ?? []),
      relation.contextId,
    ]);
  }

  return conceptIdsByNodeId;
}

function createEvidenceNodes({
  activeNodesById,
  conceptIdsByNodeId,
}: {
  activeNodesById: Map<string, Node>;
  conceptIdsByNodeId: Map<string, string[]>;
}) {
  const evidenceNodes: MemoryEvidenceNode[] = [];

  for (const [nodeId, conceptIds] of conceptIdsByNodeId.entries()) {
    const node = activeNodesById.get(nodeId);
    const timestamp = node ? Date.parse(getContentTimestamp(node)) : Number.NaN;

    if (!node || conceptIds.length === 0 || !Number.isFinite(timestamp)) {
      continue;
    }

    evidenceNodes.push({
      node,
      nodeId,
      timestamp,
      conceptIds: [...conceptIds].sort(),
    });
  }

  return evidenceNodes.sort(
    (first, second) =>
      first.timestamp - second.timestamp ||
      first.nodeId.localeCompare(second.nodeId),
  );
}

function createConceptSeries({
  evidenceNodes,
  conceptsById,
  windows,
}: {
  evidenceNodes: MemoryEvidenceNode[];
  conceptsById: Map<string, ConceptEvidenceRecord>;
  windows: TemporalWindows;
}) {
  const nodeIdsByConceptId = new Map<string, Set<string>>();
  const timestampByNodeId = new Map(
    evidenceNodes.map((evidence) => [evidence.nodeId, evidence.timestamp]),
  );
  const connectionsByNodeId = new Map(
    evidenceNodes.map((evidence) => [evidence.nodeId, evidence.conceptIds]),
  );

  for (const evidence of evidenceNodes) {
    for (const conceptId of evidence.conceptIds) {
      const nodeIds = nodeIdsByConceptId.get(conceptId) ?? new Set<string>();
      nodeIds.add(evidence.nodeId);
      nodeIdsByConceptId.set(conceptId, nodeIds);
    }
  }

  const seriesByConceptId = new Map<string, ConceptMemorySeries>();

  for (const [conceptId, nodeIds] of nodeIdsByConceptId.entries()) {
    const record = conceptsById.get(conceptId);

    if (!record) {
      continue;
    }

    const evidenceNodeIds = Array.from(nodeIds).sort();
    const timestamps = evidenceNodeIds
      .map((nodeId) => timestampByNodeId.get(nodeId))
      .filter((timestamp): timestamp is number => typeof timestamp === "number")
      .sort((first, second) => first - second);
    const recentEvidenceNodeIds = evidenceNodeIds.filter((nodeId) =>
      isRecent(timestampByNodeId.get(nodeId), windows),
    );
    const previousEvidenceNodeIds = evidenceNodeIds.filter((nodeId) =>
      isPrevious(timestampByNodeId.get(nodeId), windows),
    );
    const historicalEvidenceNodeIds = evidenceNodeIds.filter((nodeId) =>
      isHistorical(timestampByNodeId.get(nodeId), windows),
    );
    const counts = temporalCounts({
      evidenceNodeIds,
      timestamps,
      windows,
    });

    seriesByConceptId.set(conceptId, {
      conceptId,
      canonicalLabel: record.canonicalLabel,
      evidenceNodeIds,
      timestamps,
      timestampByNodeId,
      recentEvidenceNodeIds,
      previousEvidenceNodeIds,
      historicalEvidenceNodeIds,
      recentTopConnections: topConnections({
        nodeIds: recentEvidenceNodeIds,
        connectionsByNodeId,
        currentConceptId: conceptId,
      }),
      historicalTopConnections: topConnections({
        nodeIds: historicalEvidenceNodeIds,
        connectionsByNodeId,
        currentConceptId: conceptId,
      }),
      ...counts,
    });
  }

  return seriesByConceptId;
}

function createRelationshipSeries({
  evidenceNodes,
  windows,
}: {
  evidenceNodes: MemoryEvidenceNode[];
  windows: TemporalWindows;
}) {
  const buckets = new Map<string, Set<string>>();
  const evidenceByNodeId = new Map(
    evidenceNodes.map((evidence) => [evidence.nodeId, evidence]),
  );

  for (const evidence of evidenceNodes) {
    for (const pair of combinations(evidence.conceptIds, 2)) {
      const key = relationshipKey(pair);
      const nodeIds = buckets.get(key) ?? new Set<string>();
      nodeIds.add(evidence.nodeId);
      buckets.set(key, nodeIds);
    }
  }

  const seriesByKey = new Map<string, RelationshipMemorySeries>();

  for (const [key, nodeIds] of buckets.entries()) {
    const sharedEvidenceNodeIds = Array.from(nodeIds).sort();
    const timestamps = sharedEvidenceNodeIds
      .map((nodeId) => evidenceByNodeId.get(nodeId)?.timestamp)
      .filter((timestamp): timestamp is number => typeof timestamp === "number")
      .sort((first, second) => first - second);

    seriesByKey.set(key, {
      conceptIds: key.split("+") as [string, string],
      sharedEvidenceNodeIds,
      timestamps,
      ...temporalCounts({
        evidenceNodeIds: sharedEvidenceNodeIds,
        timestamps,
        windows,
      }),
    });
  }

  return seriesByKey;
}

function temporalCounts({
  evidenceNodeIds,
  timestamps,
  windows,
}: {
  evidenceNodeIds: string[];
  timestamps: number[];
  windows: TemporalWindows;
}): TemporalCounts {
  return {
    totalCount: evidenceNodeIds.length,
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
  nodeIds,
  connectionsByNodeId,
  currentConceptId,
}: {
  nodeIds: string[];
  connectionsByNodeId: Map<string, string[]>;
  currentConceptId: string;
}) {
  const counts = new Map<string, number>();

  for (const nodeId of nodeIds) {
    const conceptIds = connectionsByNodeId.get(nodeId) ?? [];

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
