import type { Node } from "@/domain/node/node";
import type { NodeRepository } from "@/domain/node/node-repository";

export async function listActiveNodes(repository: NodeRepository): Promise<Node[]> {
  const nodes = await repository.listActive();
  return nodes.filter((node) => node.type === "NOTE");
}

export async function listInboxNodes(repository: NodeRepository): Promise<Node[]> {
  return repository.listInbox();
}

export async function listArchivedNodes(repository: NodeRepository): Promise<Node[]> {
  return repository.listArchived();
}
