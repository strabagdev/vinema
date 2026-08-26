import type { CaptureConceptRelation } from "@/domain/concept/capture-concept-relation";

export interface CaptureConceptRelationRepository {
  getByNodeAndContext(
    nodeId: string,
    contextId: string,
  ): Promise<CaptureConceptRelation | null>;
  listByNodeId(nodeId: string): Promise<CaptureConceptRelation[]>;
  listByContextId(contextId: string): Promise<CaptureConceptRelation[]>;
  listByWorkspace(workspaceId: string): Promise<CaptureConceptRelation[]>;
  save(relation: CaptureConceptRelation): Promise<CaptureConceptRelation>;
  delete(id: string): Promise<void>;
}
