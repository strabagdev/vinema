"use client";

import { Check } from "lucide-react";
import type { ConceptSuggestion } from "@/features/associations/association-types";
import { cn } from "@/lib/cn";

const INITIAL_CONCEPT_LIMIT = 5;
const EXPANDED_CONCEPT_LIMIT = 8;

export function ConceptSuggestionChips({
  suggestions,
  selectedContextIds,
  selectedEmergingCandidateIds,
  expanded,
  onExpandedChange,
  onToggleExisting,
  onToggleEmerging,
}: {
  suggestions: ConceptSuggestion[];
  selectedContextIds: string[];
  selectedEmergingCandidateIds: string[];
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onToggleExisting: (contextId: string) => void;
  onToggleEmerging: (candidateId: string) => void;
}) {
  if (suggestions.length === 0) {
    return null;
  }

  const visibleLimit = expanded ? EXPANDED_CONCEPT_LIMIT : INITIAL_CONCEPT_LIMIT;
  const visibleSuggestions = suggestions.slice(0, visibleLimit);
  const hiddenCount = Math.max(0, suggestions.length - INITIAL_CONCEPT_LIMIT);

  return (
    <section
      className="flex flex-wrap items-center gap-2"
      aria-labelledby="concept-suggestions-heading"
    >
      <h2
        id="concept-suggestions-heading"
        className="mr-1 text-sm font-medium text-zinc-700"
      >
        Conceptos
      </h2>
      {visibleSuggestions.map((suggestion) => {
        const selected =
          suggestion.kind === "existing"
            ? selectedContextIds.includes(suggestion.conceptId)
            : selectedEmergingCandidateIds.includes(suggestion.candidateId);
        const label =
          suggestion.kind === "existing"
            ? suggestion.label
            : suggestion.suggestedLabel;
        const id =
          suggestion.kind === "existing"
            ? suggestion.conceptId
            : suggestion.candidateId;

        return (
          <button
            key={`${suggestion.kind}-${id}`}
            type="button"
            aria-pressed={selected}
            aria-label={
              suggestion.kind === "existing"
                ? `Seleccionar concepto ${suggestion.label}`
                : `Seleccionar concepto ${suggestion.suggestedLabel}, sugerido a partir de ${suggestion.evidenceCaptureIds.length} capturas`
            }
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-full border px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-zinc-400",
              selected
                ? "border-zinc-800 bg-zinc-900 text-white"
                : "border-zinc-200 bg-transparent text-zinc-700 hover:border-zinc-400 hover:text-zinc-950",
            )}
            onClick={() =>
              suggestion.kind === "existing"
                ? onToggleExisting(suggestion.conceptId)
                : onToggleEmerging(suggestion.candidateId)
            }
          >
            {selected ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
            {label}
          </button>
        );
      })}
      {suggestions.length > INITIAL_CONCEPT_LIMIT ? (
        <button
          type="button"
          className="h-8 rounded-full px-2 text-sm text-zinc-500 outline-none hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400"
          onClick={() => onExpandedChange(!expanded)}
        >
          {expanded ? "menos" : `+${hiddenCount}`}
        </button>
      ) : null}
    </section>
  );
}
