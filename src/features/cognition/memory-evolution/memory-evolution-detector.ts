import type { Context } from "@/domain/context/context";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { Node } from "@/domain/node/node";
import {
  createMemoryEvidenceModel,
  type ConceptMemorySeries,
  latestEvidenceNodeIds,
  type MemoryEvidenceModel,
} from "@/features/cognition/memory-evidence/memory-evidence-model";
import {
  DEFAULT_DORMANT_DAYS,
  DEFAULT_RECENT_WINDOW_DAYS,
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
  evidenceModel?: MemoryEvidenceModel;
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
  evidenceModel,
}: DeriveMemoryEvolutionSignalsOptions): MemoryEvolutionSignal[] {
  if (maxSignals <= 0) {
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
      dormantDays,
    });
  const windows: EvolutionWindows = {
    observedAt: model.windows.observedAt,
    recentStart: model.windows.recentStart,
    previousStart: model.windows.previousStart,
    dormantDays,
  };

  return Array.from(model.conceptSeriesById.values())
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
  input: ConceptMemorySeries;
  windows: EvolutionWindows;
}): MemoryEvolutionSignal[] {
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
  const signals: MemoryEvolutionSignal[] = [];
  const firstObservedAt = Math.min(...timestamps);
  const timestampByNodeId = input.timestampByNodeId;

  if (firstObservedAt >= windows.recentStart && input.evidenceNodeIds.length >= 1) {
    signals.push(
      createSignal({
        kind: "NEW_CONCEPT",
        input,
        windows,
        metrics: metricsBase,
        evidenceNodeIds: latestEvidenceNodeIds(
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
      createSignal({
        kind: "REVIVED_CONCEPT",
        input,
        windows,
        metrics: metricsBase,
        evidenceNodeIds: latestEvidenceNodeIds(
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
      createSignal({
        kind: "GROWING_CONCEPT",
        input,
        windows,
        metrics: metricsBase,
        evidenceNodeIds: latestEvidenceNodeIds(
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
      createSignal({
        kind: "DECLINING_CONCEPT",
        input,
        windows,
        metrics: metricsBase,
        evidenceNodeIds: latestEvidenceNodeIds(
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
      createSignal({
        kind: "DORMANT_CONCEPT",
        input,
        windows,
        metrics: metricsBase,
        evidenceNodeIds: latestEvidenceNodeIds(
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
      createSignal({
        kind: "STABLE_CONCEPT",
        input,
        windows,
        metrics: metricsBase,
        evidenceNodeIds: latestEvidenceNodeIds(
          input.evidenceNodeIds,
          timestampByNodeId,
        ),
        strength: input.monthlySpread >= 4 ? "STRONG" : "MEDIUM",
      }),
    );
  }

  if (detectContextShift(input.recentTopConnections, input.historicalTopConnections)) {
    signals.push(
      createSignal({
        kind: "SHIFTING_CONTEXT",
        input,
        windows,
        metrics: metricsBase,
        evidenceNodeIds: latestEvidenceNodeIds(
          input.recentEvidenceNodeIds,
          timestampByNodeId,
        ),
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

function createSignal({
  kind,
  input,
  windows,
  metrics,
  evidenceNodeIds,
  strength,
}: {
  kind: MemoryEvolutionKind;
  input: ConceptMemorySeries;
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
