import type { Context, ContextType } from "@/domain/context/context";
import type { ContextRepository } from "@/domain/context/context-repository";
import type { NodeContextRelation } from "@/domain/context/node-context-relation";
import type { NodeContextRelationRepository } from "@/domain/context/node-context-relation-repository";
import type { Node } from "@/domain/node/node";
import type { NodeRepository } from "@/domain/node/node-repository";

export type ContextRelationRepositories = {
  contextRepository: ContextRepository;
  nodeContextRelationRepository: NodeContextRelationRepository;
  nodeRepository: NodeRepository;
};

export async function attachNodeToContext(
  repositories: ContextRelationRepositories,
  input: { nodeId: string; contextId: string },
): Promise<NodeContextRelation> {
  const node = await repositories.nodeRepository.findById(input.nodeId);
  const context = await repositories.contextRepository.getById(input.contextId);

  if (!node) {
    throw new Error("No se encontro la nota.");
  }

  if (!context) {
    throw new Error("No se encontro el contexto.");
  }

  if (node.workspaceId !== context.workspaceId) {
    throw new Error("La nota y el contexto pertenecen a workspaces distintos.");
  }

  const existingRelation =
    await repositories.nodeContextRelationRepository.getByNodeAndContext(
      node.id,
      context.id,
    );

  if (existingRelation) {
    return existingRelation;
  }

  return repositories.nodeContextRelationRepository.save({
    id: crypto.randomUUID(),
    workspaceId: node.workspaceId,
    nodeId: node.id,
    contextId: context.id,
    createdAt: new Date().toISOString(),
  });
}

export async function detachNodeFromContext(
  repository: NodeContextRelationRepository,
  input: { nodeId: string; contextId: string },
): Promise<void> {
  const relation = await repository.getByNodeAndContext(
    input.nodeId,
    input.contextId,
  );

  if (!relation) {
    return;
  }

  await repository.delete(relation.id);
}

export async function listContextsForNode(
  repositories: Pick<
    ContextRelationRepositories,
    "contextRepository" | "nodeContextRelationRepository"
  >,
  input: {
    nodeId: string;
    type?: ContextType;
    includeArchived?: boolean;
  },
): Promise<Context[]> {
  const relations =
    await repositories.nodeContextRelationRepository.listByNodeId(input.nodeId);
  const contexts = await Promise.all(
    relations.map((relation) =>
      repositories.contextRepository.getById(relation.contextId),
    ),
  );

  return contexts
    .filter((context): context is Context => context !== null)
    .filter((context) => !input.type || context.type === input.type)
    .filter((context) => input.includeArchived || context.archivedAt === null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listNodesForContext(
  repositories: Pick<
    ContextRelationRepositories,
    "nodeContextRelationRepository" | "nodeRepository"
  >,
  input: { contextId: string; includeArchived?: boolean },
): Promise<Node[]> {
  const relations =
    await repositories.nodeContextRelationRepository.listByContextId(
      input.contextId,
    );
  const nodes = await Promise.all(
    relations.map((relation) =>
      repositories.nodeRepository.findById(relation.nodeId),
    ),
  );

  return nodes
    .filter((node): node is Node => node !== null)
    .filter((node) => input.includeArchived || node.status !== "ARCHIVED")
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}
