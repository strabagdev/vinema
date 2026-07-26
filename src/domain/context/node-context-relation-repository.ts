import type { NodeContextRelation } from "@/domain/context/node-context-relation";

export interface NodeContextRelationRepository {
  getByNodeAndContext(
    nodeId: string,
    contextId: string,
  ): Promise<NodeContextRelation | null>;
  listByNodeId(nodeId: string): Promise<NodeContextRelation[]>;
  listByContextId(contextId: string): Promise<NodeContextRelation[]>;
  save(relation: NodeContextRelation): Promise<NodeContextRelation>;
  delete(id: string): Promise<void>;
}
