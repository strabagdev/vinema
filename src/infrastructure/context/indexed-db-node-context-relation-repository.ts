import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { NodeContextRelationRepository } from "@/domain/context/node-context-relation-repository";
import {
  NODE_CONTEXT_RELATIONS_STORE,
  VinemaDatabaseSchemaError,
  getVinemaDb,
} from "@/infrastructure/storage/vinema-db";

export class IndexedDbNodeContextRelationRepository
  implements NodeContextRelationRepository
{
  async getByNodeAndContext(
    nodeId: string,
    contextId: string,
  ): Promise<NodeContextRelation | null> {
    const relations = await this.listAll();
    return (
      relations.find(
        (relation) =>
          relation.nodeId === nodeId && relation.contextId === contextId,
      ) ?? null
    );
  }

  async listByNodeId(nodeId: string): Promise<NodeContextRelation[]> {
    const relations = await this.listAll();
    return relations.filter((relation) => relation.nodeId === nodeId);
  }

  async listByContextId(contextId: string): Promise<NodeContextRelation[]> {
    const relations = await this.listAll();
    return relations.filter((relation) => relation.contextId === contextId);
  }

  async listByWorkspace(workspaceId: string): Promise<NodeContextRelation[]> {
    const relations = await this.listAll();
    return relations.filter((relation) => relation.workspaceId === workspaceId);
  }

  private async listAll(): Promise<NodeContextRelation[]> {
    const db = await getVinemaDb();
    if (!db.objectStoreNames.contains(NODE_CONTEXT_RELATIONS_STORE)) {
      return [];
    }

    return db.getAll(NODE_CONTEXT_RELATIONS_STORE);
  }

  async save(
    relation: NodeContextRelation,
  ): Promise<NodeContextRelation> {
    const db = await getVinemaDb();
    if (!db.objectStoreNames.contains(NODE_CONTEXT_RELATIONS_STORE)) {
      throw new VinemaDatabaseSchemaError(
        `Cannot save relation because IndexedDB store "${NODE_CONTEXT_RELATIONS_STORE}" is missing.`,
        { missingStores: [NODE_CONTEXT_RELATIONS_STORE] },
      );
    }

    await db.put(NODE_CONTEXT_RELATIONS_STORE, relation);
    return relation;
  }

  async delete(id: string): Promise<void> {
    const db = await getVinemaDb();
    if (!db.objectStoreNames.contains(NODE_CONTEXT_RELATIONS_STORE)) {
      throw new VinemaDatabaseSchemaError(
        `Cannot delete relation because IndexedDB store "${NODE_CONTEXT_RELATIONS_STORE}" is missing.`,
        { missingStores: [NODE_CONTEXT_RELATIONS_STORE] },
      );
    }

    await db.delete(NODE_CONTEXT_RELATIONS_STORE, id);
  }
}
