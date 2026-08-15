import type { ConceptMemorySeries } from "@/features/cognition/memory-evidence/memory-evidence-model";

export type MemoryEvolutionKind =
  | "NEW_CONCEPT"
  | "GROWING_CONCEPT"
  | "STABLE_CONCEPT"
  | "DECLINING_CONCEPT"
  | "DORMANT_CONCEPT"
  | "REVIVED_CONCEPT"
  | "SHIFTING_CONTEXT";

export type MemoryEvolutionStrength = "WEAK" | "MEDIUM" | "STRONG";

export interface MemoryEvolutionSignal {
  id: string;
  kind: MemoryEvolutionKind;
  conceptId: string;
  canonicalLabel: string;
  strength: MemoryEvolutionStrength;
  observedAt: Date;
  metrics: {
    totalMemories: number;
    recentMemories: number;
    previousMemories: number;
    inactiveDays: number;
    historicalMonthlySpread: number;
    recentTopConnections: string[];
    historicalTopConnections: string[];
  };
  evidenceNodeIds: string[];
}

export type ConceptEvolutionInput = ConceptMemorySeries;

export interface EvolutionWindows {
  recentStart: number;
  previousStart: number;
  dormantDays: number;
  observedAt: Date;
}

export const DEFAULT_RECENT_WINDOW_DAYS = 30;
export const DEFAULT_DORMANT_DAYS = 90;
