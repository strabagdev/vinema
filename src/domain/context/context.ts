export {
  CONCEPT_TYPES,
  isConceptType,
  normalizeConceptNameForComparison,
} from "@/domain/concept/concept";
export type { Concept, ConceptType } from "@/domain/concept/concept";

import {
  CONCEPT_TYPES,
  isConceptType,
  normalizeConceptNameForComparison,
} from "@/domain/concept/concept";
import type { Concept, ConceptType } from "@/domain/concept/concept";

/** @deprecated Use CONCEPT_TYPES. Pending removal after terminology migration. */
export const CONTEXT_TYPES = CONCEPT_TYPES;

/** @deprecated Use ConceptType. Pending removal after terminology migration. */
export type ContextType = ConceptType;

/** @deprecated Use Concept. Pending removal after terminology migration. */
export type Context = Concept;

/** @deprecated Use isConceptType. Pending removal after terminology migration. */
export const isContextType = isConceptType;

/** @deprecated Use normalizeConceptNameForComparison. Pending removal after terminology migration. */
export const normalizeContextNameForComparison = normalizeConceptNameForComparison;
