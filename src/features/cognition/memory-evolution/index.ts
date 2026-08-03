export {
  DEFAULT_DORMANT_DAYS,
  DEFAULT_RECENT_WINDOW_DAYS,
  type MemoryEvolutionKind,
  type MemoryEvolutionSignal,
  type MemoryEvolutionStrength,
} from "@/features/cognition/memory-evolution/memory-evolution";
export {
  deriveConceptEvolution,
  deriveMemoryEvolutionSignals,
  detectContextShift,
} from "@/features/cognition/memory-evolution/memory-evolution-detector";
