import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { NodeContextRelationRepository } from "@/domain/context/node-context-relation-repository";

export class InMemoryNodeContextRelationRepository
  implements NodeContextRelationRepository
{
  private readonly relations = new Map<string, NodeContextRelation>();

  constructor(relations: NodeContextRelation[] = []) {
    relations.forEach((relation) => this.relations.set(relation.id, relation));
  }

  async getByNodeAndContext(
    nodeId: string,
    contextId: string,
  ): Promise<NodeContextRelation | null> {
    return (
      Array.from(this.relations.values()).find(
        (relation) =>
          relation.nodeId === nodeId && relation.contextId === contextId,
      ) ?? null
    );
  }

  async listByNodeId(nodeId: string): Promise<NodeContextRelation[]> {
    return Array.from(this.relations.values()).filter(
      (relation) => relation.nodeId === nodeId,
    );
  }

  async listByContextId(contextId: string): Promise<NodeContextRelation[]> {
    return Array.from(this.relations.values()).filter(
      (relation) => relation.contextId === contextId,
    );
  }

  async listByWorkspace(workspaceId: string): Promise<NodeContextRelation[]> {
    return Array.from(this.relations.values()).filter(
      (relation) => relation.workspaceId === workspaceId,
    );
  }

  async save(
    relation: NodeContextRelation,
  ): Promise<NodeContextRelation> {
    const existingRelation = await this.getByNodeAndContext(
      relation.nodeId,
      relation.contextId,
    );

    if (existingRelation && existingRelation.id !== relation.id) {
      return existingRelation;
    }

    this.relations.set(relation.id, relation);
    return relation;
  }

  async delete(id: string): Promise<void> {
    this.relations.delete(id);
  }
}
