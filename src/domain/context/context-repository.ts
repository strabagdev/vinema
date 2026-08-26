export type {
  ConceptRepository,
  ListConceptsOptions,
} from "@/domain/concept/concept-repository";

import type {
  ConceptRepository,
  ListConceptsOptions,
} from "@/domain/concept/concept-repository";

/** @deprecated Use ListConceptsOptions. Pending removal after terminology migration. */
export type ListContextsOptions = ListConceptsOptions;

/** @deprecated Use ConceptRepository. Pending removal after terminology migration. */
export type ContextRepository = ConceptRepository;
