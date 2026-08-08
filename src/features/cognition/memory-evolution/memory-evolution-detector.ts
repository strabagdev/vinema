import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import { getContentTimestamp } from "@/features/capture/capture-timestamps";
import { createConceptIdentity, normalizeConceptIdentityLabel } from "@/features/concepts/concept-identity";
import {
  DEFAULT_DORMANT_DAYS,
  DEFAULT_RECENT_WINDOW_DAYS,
  type ConceptEvolutionInput,
  type EvolutionWindows,
  type MemoryEvolutionKind,
  type MemoryEvolutionSignal,
  type MemoryEvolutionStrength,
} from "@/features/cognition/memory-evolution/memory-evolution";

export interface DeriveMemoryEvolutionSignalsOptions {
  contexts: Context[];
  relations: NodeContextRelation[];
  nodes: Node[];
  now?: Date;
  recentWindowDays?: number;
  dormantDays?: number;
  maxSignals?: number;
}

interface ConceptRecord {
  context: Context;
  identityLabels: Set<string>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_SIGNALS = 40;

export function deriveMemoryEvolutionSignals({
  contexts,
  relations,
  nodes,
  now = new Date(),
  recentWindowDays = DEFAULT_RECENT_WINDOW_DAYS,
  dormantDays = DEFAULT_DORMANT_DAYS,
  maxSignals = DEFAULT_MAX_SIGNALS,
}: DeriveMemoryEvolutionSignalsOptions): MemoryEvolutionSignal[] {
  if (maxSignals <= 0) {
    return [];
  }

  const model = createEvolutionModel({ contexts, relations, nodes });
  const windows = createEvolutionWindows({ now, recentWindowDays, dormantDays });

  return Array.from(model.conceptsById.values())
    .flatMap((input) =>
      deriveConceptEvolution({
        input,
        windows,
      }),
    )
    .sort(compareEvolutionSignals)
    .slice(0, maxSignals);
}

export function deriveConceptEvolution({
  input,
  windows,
}: {
  input: ConceptEvolutionInput;
  windows: EvolutionWindows;
}): MemoryEvolutionSignal[] {
  const timestamps = input.memoryIds
    .map((nodeId) => input.timestampsByNodeId.get(nodeId))
    .filter((timestamp): timestamp is number => typeof timestamp === "number")
    .sort((first, second) => first - second);

  if (timestamps.length === 0) {
    return [];
  }

  const recentNodeIds = input.memoryIds.filter((nodeId) =>
    isRecent(input.timestampsByNodeId.get(nodeId), windows),
  );
  const previousNodeIds = input.memoryIds.filter((nodeId) =>
    isPrevious(input.timestampsByNodeId.get(nodeId), windows),
  );
  const historicalNodeIds = input.memoryIds.filter((nodeId) =>
    isHistorical(input.timestampsByNodeId.get(nodeId), windows),
  );
  const latestTimestamp = Math.max(...timestamps);
  const inactiveDays = Math.floor(
    Math.max(0, windows.observedAt.getTime() - latestTimestamp) / DAY_MS,
  );
  const metricsBase = {
    totalMemories: input.memoryIds.length,
    recentMemories: recentNodeIds.length,
    previousMemories: previousNodeIds.length,
    inactiveDays,
    historicalMonthlySpread: countMonthlySpread(timestamps),
    recentTopConnections: topConnections(
      recentNodeIds,
      input.connectionIdsByNodeId,
      input.conceptId,
    ),
    historicalTopConnections: topConnections(
      historicalNodeIds,
      input.connectionIdsByNodeId,
      input.conceptId,
    ),
  };
  const signals: MemoryEvolutionSignal[] = [];
  const firstObservedAt = Math.min(...timestamps);

  if (firstObservedAt >= windows.recentStart && input.memoryIds.length >= 1) {
    signals.push(
      createSignal({
        kind: "NEW_CONCEPT",
        input,
        windows,
        metrics: metricsBase,
        evidenceNodeIds: latestNodeIds(recentNodeIds, input.timestampsByNodeId),
        strength: input.memoryIds.length >= 2 ? "MEDIUM" : "WEAK",
      }),
    );
  }

  const revived = isRevived({
    recentNodeIds,
    previousNodeIds,
    historicalNodeIds,
    timestampsByNodeId: input.timestampsByNodeId,
    windows,
  });

  if (revived) {
    signals.push(
      createSignal({
        kind: "REVIVED_CONCEPT",
        input,
        windows,
        metrics: metricsBase,
        evidenceNodeIds: latestNodeIds(recentNodeIds, input.timestampsByNodeId),
        strength: recentNodeIds.length >= 2 ? "STRONG" : "MEDIUM",
      }),
    );
  }

  if (
    recentNodeIds.length >= 2 &&
    previousNodeIds.length >= 1 &&
    recentNodeIds.length >= previousNodeIds.length * 2
  ) {
    signals.push(
      createSignal({
        kind: "GROWING_CONCEPT",
        input,
        windows,
        metrics: metricsBase,
        evidenceNodeIds: latestNodeIds(recentNodeIds, input.timestampsByNodeId),
        strength: recentNodeIds.length >= 4 ? "STRONG" : "MEDIUM",
      }),
    );
  }

  if (
    previousNodeIds.length >= 2 &&
    recentNodeIds.length * 2 <= previousNodeIds.length &&
    inactiveDays < windows.dormantDays
  ) {
    signals.push(
      createSignal({
        kind: "DECLINING_CONCEPT",
        input,
        windows,
        metrics: metricsBase,
        evidenceNodeIds: latestNodeIds(previousNodeIds, input.timestampsByNodeId),
        strength: previousNodeIds.length >= 4 ? "STRONG" : "MEDIUM",
      }),
    );
  }

  if (
    input.memoryIds.length >= 3 &&
    metricsBase.historicalMonthlySpread >= 2 &&
    inactiveDays >= windows.dormantDays &&
    recentNodeIds.length === 0
  ) {
    signals.push(
      createSignal({
        kind: "DORMANT_CONCEPT",
        input,
        windows,
        metrics: metricsBase,
        evidenceNodeIds: latestNodeIds(input.memoryIds, input.timestampsByNodeId),
        strength: inactiveDays >= windows.dormantDays * 2 ? "STRONG" : "MEDIUM",
      }),
    );
  }

  if (
    input.memoryIds.length >= 4 &&
    metricsBase.historicalMonthlySpread >= 3 &&
    recentNodeIds.length > 0 &&
    previousNodeIds.length > 0 &&
    !hasExtremeVariation(recentNodeIds.length, previousNodeIds.length)
  ) {
    signals.push(
      createSignal({
        kind: "STABLE_CONCEPT",
        input,
        windows,
        metrics: metricsBase,
        evidenceNodeIds: latestNodeIds(input.memoryIds, input.timestampsByNodeId),
        strength: metricsBase.historicalMonthlySpread >= 4 ? "STRONG" : "MEDIUM",
      }),
    );
  }

  if (detectContextShift(metricsBase.recentTopConnections, metricsBase.historicalTopConnections)) {
    signals.push(
      createSignal({
        kind: "SHIFTING_CONTEXT",
        input,
        windows,
        metrics: metricsBase,
        evidenceNodeIds: latestNodeIds(recentNodeIds, input.timestampsByNodeId),
        strength: "MEDIUM",
      }),
    );
  }

  return signals;
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

function createEvolutionModel({
  contexts,
  relations,
  nodes,
}: {
  contexts: Context[];
  relations: NodeContextRelation[];
  nodes: Node[];
}) {
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
  const timestampsByNodeId = new Map<string, number>();
  const connectionIdsByNodeId = new Map<string, string[]>();
  const conceptMemoryIds = new Map<string, Set<string>>();

  for (const [nodeId, conceptIds] of conceptIdsByNodeId.entries()) {
    const node = activeNodesById.get(nodeId);
    const timestamp = node ? Date.parse(getContentTimestamp(node)) : Number.NaN;

    if (!node || !Number.isFinite(timestamp)) {
      continue;
    }

    timestampsByNodeId.set(nodeId, timestamp);
    connectionIdsByNodeId.set(nodeId, conceptIds);

    for (const conceptId of conceptIds) {
      const memoryIds = conceptMemoryIds.get(conceptId) ?? new Set<string>();
      memoryIds.add(nodeId);
      conceptMemoryIds.set(conceptId, memoryIds);
    }
  }

  const conceptsById = new Map<string, ConceptEvolutionInput>();

  for (const [conceptId, memoryIds] of conceptMemoryIds.entries()) {
    const concept = conceptRecords.get(conceptId)?.context;

    if (!concept) {
      continue;
    }

    conceptsById.set(conceptId, {
      conceptId,
      canonicalLabel: concept.name,
      memoryIds: Array.from(memoryIds).sort(),
      timestampsByNodeId,
      connectionIdsByNodeId,
    });
  }

  return { conceptsById };
}

function getConceptRecords(contexts: Context[]) {
  const records = new Map<string, ConceptRecord>();

  for (const context of contexts) {
    const identity = createConceptIdentity(context);
    const identityLabels = new Set(
      [identity.canonicalLabel, ...identity.aliases, ...identity.normalizedAliases]
        .map(normalizeConceptIdentityLabel)
        .filter(Boolean),
    );

    records.set(context.id, { context, identityLabels });
  }

  return records;
}

function getAcceptedConceptIdsByNodeId({
  relations,
  activeNodesById,
  conceptRecords,
}: {
  relations: NodeContextRelation[];
  activeNodesById: Map<string, Node>;
  conceptRecords: Map<string, ConceptRecord>;
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

    const record = conceptRecords.get(relation.contextId);

    if (!record) {
      continue;
    }

    const used = identityLabelsByNodeId.get(relation.nodeId) ?? new Set<string>();
    const overlaps = Array.from(record.identityLabels).some((label) => used.has(label));

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

function createEvolutionWindows({
  now,
  recentWindowDays,
  dormantDays,
}: {
  now: Date;
  recentWindowDays: number;
  dormantDays: number;
}): EvolutionWindows {
  const nowMs = now.getTime();

  return {
    observedAt: now,
    recentStart: nowMs - recentWindowDays * DAY_MS,
    previousStart: nowMs - recentWindowDays * 2 * DAY_MS,
    dormantDays,
  };
}

function createSignal({
  kind,
  input,
  windows,
  metrics,
  evidenceNodeIds,
  strength,
}: {
  kind: MemoryEvolutionKind;
  input: ConceptEvolutionInput;
  windows: EvolutionWindows;
  metrics: MemoryEvolutionSignal["metrics"];
  evidenceNodeIds: string[];
  strength: MemoryEvolutionStrength;
}): MemoryEvolutionSignal {
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

function isRecent(timestamp: number | undefined, windows: EvolutionWindows) {
  return typeof timestamp === "number" && timestamp >= windows.recentStart && timestamp <= windows.observedAt.getTime();
}

function isPrevious(timestamp: number | undefined, windows: EvolutionWindows) {
  return typeof timestamp === "number" && timestamp >= windows.previousStart && timestamp < windows.recentStart;
}

function isHistorical(timestamp: number | undefined, windows: EvolutionWindows) {
  return typeof timestamp === "number" && timestamp < windows.recentStart;
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
  if (recentNodeIds.length === 0 || previousNodeIds.length > 0 || historicalNodeIds.length < 2) {
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

function countMonthlySpread(timestamps: number[]) {
  return new Set(
    timestamps.map((timestamp) => {
      const date = new Date(timestamp);
      return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`;
    }),
  ).size;
}

function topConnections(
  nodeIds: string[],
  connectionIdsByNodeId: Map<string, string[]>,
  currentConceptId: string,
) {
  const counts = new Map<string, number>();

  for (const nodeId of nodeIds) {
    const conceptIds = connectionIdsByNodeId.get(nodeId) ?? [];

    for (const conceptId of conceptIds) {
      if (conceptId === currentConceptId) {
        continue;
      }

      counts.set(conceptId, (counts.get(conceptId) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort(([firstId, firstCount], [secondId, secondCount]) =>
      secondCount - firstCount || firstId.localeCompare(secondId),
    )
    .map(([conceptId]) => conceptId)
    .slice(0, 3);
}

function latestNodeIds(
  nodeIds: string[],
  timestampsByNodeId: Map<string, number>,
) {
  return [...nodeIds]
    .sort((first, second) =>
      (timestampsByNodeId.get(second) ?? 0) - (timestampsByNodeId.get(first) ?? 0) ||
      first.localeCompare(second),
    )
    .slice(0, 5);
}

function hasExtremeVariation(recent: number, previous: number) {
  return recent >= previous * 2 || previous >= recent * 2;
}

function compareEvolutionSignals(first: MemoryEvolutionSignal, second: MemoryEvolutionSignal) {
  const strengthDelta = strengthRank(second.strength) - strengthRank(first.strength);

  if (strengthDelta !== 0) {
    return strengthDelta;
  }

  const kindDelta = kindRank(first.kind) - kindRank(second.kind);

  if (kindDelta !== 0) {
    return kindDelta;
  }

  if (second.metrics.totalMemories !== first.metrics.totalMemories) {
    return second.metrics.totalMemories - first.metrics.totalMemories;
  }

  return first.id.localeCompare(second.id);
}

function kindRank(kind: MemoryEvolutionKind) {
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

function strengthRank(strength: MemoryEvolutionStrength) {
  return strength === "STRONG" ? 3 : strength === "MEDIUM" ? 2 : 1;
}
