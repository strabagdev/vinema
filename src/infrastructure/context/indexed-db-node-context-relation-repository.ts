import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { NodeContextRelationRepository } from "@/domain/context/node-context-relation-repository";
import {
  NODE_CONTEXT_RELATIONS_STORE,
  getVinemaDb,
} from "@/infrastructure/storage/vinema-db";

export class IndexedDbNodeContextRelationRepository
  implements NodeContextRelationRepository
{
  async getByNodeAndContext(
    nodeId: string,
    contextId: string,
  ): Promise<NodeContextRelation | null> {
    const db = await getVinemaDb();
    return (
      (await db.getFromIndex(
        NODE_CONTEXT_RELATIONS_STORE,
        "by-node-and-context",
        [nodeId, contextId],
      )) ?? null
    );
  }

  async listByNodeId(nodeId: string): Promise<NodeContextRelation[]> {
    const db = await getVinemaDb();
    return db.getAllFromIndex(NODE_CONTEXT_RELATIONS_STORE, "by-node", nodeId);
  }

  async listByContextId(contextId: string): Promise<NodeContextRelation[]> {
    const db = await getVinemaDb();
    return db.getAllFromIndex(
      NODE_CONTEXT_RELATIONS_STORE,
      "by-context",
      contextId,
    );
  }

  async save(
    relation: NodeContextRelation,
  ): Promise<NodeContextRelation> {
    const db = await getVinemaDb();
    await db.put(NODE_CONTEXT_RELATIONS_STORE, relation);
    return relation;
  }

  async delete(id: string): Promise<void> {
    const db = await getVinemaDb();
    await db.delete(NODE_CONTEXT_RELATIONS_STORE, id);
  }
}
