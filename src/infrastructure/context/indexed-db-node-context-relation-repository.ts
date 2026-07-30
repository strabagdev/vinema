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

    const relations = await db.getAll(NODE_CONTEXT_RELATIONS_STORE);
    return relations
      .map(normalizeStoredNodeContextRelation)
      .filter((relation): relation is NodeContextRelation => relation !== null);
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

    const storedRelation = toStoredNodeContextRelation(relation);
    await db.put(NODE_CONTEXT_RELATIONS_STORE, storedRelation);
    return storedRelation;
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

export function normalizeStoredNodeContextRelation(
  value: unknown,
): NodeContextRelation | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Partial<NodeContextRelation>;

  if (
    typeof record.id !== "string" ||
    typeof record.workspaceId !== "string" ||
    typeof record.nodeId !== "string" ||
    typeof record.contextId !== "string" ||
    typeof record.createdAt !== "string" ||
    (record.relationType !== undefined &&
      record.relationType !== "CONTEXT" &&
      record.relationType !== "CAPTURE_ASSOCIATION") ||
    (record.relatedNodeId !== undefined && typeof record.relatedNodeId !== "string")
  ) {
    return null;
  }

  return toStoredNodeContextRelation({
    id: record.id,
    workspaceId: record.workspaceId,
    nodeId: record.nodeId,
    contextId: record.contextId,
    relationType: record.relationType,
    relatedNodeId: record.relatedNodeId,
    version:
      typeof record.version === "number" && record.version > 0
        ? record.version
        : 1,
    createdAt: record.createdAt,
  });
}

export function toStoredNodeContextRelation(
  relation: NodeContextRelation,
): NodeContextRelation {
  return {
    ...relation,
    version: relation.version > 0 ? relation.version : 1,
  };
}
