import type { Concept, ConceptType } from "@/domain/concept/concept";

export type ListConceptsOptions = {
  workspaceId: string;
  type?: ConceptType;
  includeArchived?: boolean;
};

export interface ConceptRepository {
  getById(id: string): Promise<Concept | null>;
  list(options: ListConceptsOptions): Promise<Concept[]>;
  save(concept: Concept): Promise<Concept>;
}
