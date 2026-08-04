import type { ExistingConceptSuggestion } from "@/features/associations/association-types";
import { isSpanishStopword } from "@/features/associations/spanish-stopwords";
import { normalizeConceptIdentityLabel } from "@/features/concepts/concept-identity";

export function getUsefulDetectedAlias(
  suggestion: ExistingConceptSuggestion,
): string | null {
  const alias = suggestion.matchedAlias?.trim();

  if (!alias) {
    return null;
  }

  const normalizedAlias = normalizeConceptIdentityLabel(alias);
  const normalizedLabel = normalizeConceptIdentityLabel(suggestion.label);

  if (
    !normalizedAlias ||
    normalizedAlias === normalizedLabel ||
    createCompactKey(normalizedAlias) === createCompactKey(normalizedLabel)
  ) {
    return null;
  }

  if (!normalizedAlias.includes(" ") && isSpanishStopword(normalizedAlias)) {
    return null;
  }

  if (normalizedAlias.length === 1 && !/^[A-ZÑ]$/u.test(alias)) {
    return null;
  }

  return alias;
}

function createCompactKey(value: string) {
  return value.replace(/\s+/g, "");
}
