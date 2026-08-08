import type { Node } from "@/domain/node/node";
import type { NodeRepository } from "@/domain/node/node-repository";
import { normalizeStoredNode } from "@/infrastructure/node/indexed-db-node-repository";

function byNewestUpdatedAt(a: Node, b: Node) {
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
}

export class InMemoryNodeRepository implements NodeRepository {
  private readonly nodes = new Map<string, Node>();

  constructor(nodes: Node[] = []) {
    nodes.forEach((node) => {
      const normalizedNode = normalizeStoredNode(node);
      if (normalizedNode) {
        this.nodes.set(normalizedNode.id, normalizedNode);
      }
    });
  }

  async create(node: Node): Promise<Node> {
    const normalizedNode = normalizeStoredNode(node) ?? node;
    this.nodes.set(normalizedNode.id, normalizedNode);
    return normalizedNode;
  }

  async update(node: Node): Promise<Node> {
    const normalizedNode = normalizeStoredNode(node) ?? node;
    this.nodes.set(normalizedNode.id, normalizedNode);
    return normalizedNode;
  }

  async findById(id: string): Promise<Node | null> {
    const node = this.nodes.get(id);
    return node && node.deletedAt === null ? node : null;
  }

  async listActive(): Promise<Node[]> {
    return Array.from(this.nodes.values())
      .filter(
        (node) =>
          node.deletedAt === null &&
          node.organizationStatus === "ORGANIZED",
      )
      .sort(byNewestUpdatedAt);
  }

  async listInbox(): Promise<Node[]> {
    return Array.from(this.nodes.values())
      .filter(
        (node) =>
          node.deletedAt === null &&
          node.organizationStatus === "INBOX",
      )
      .sort(byNewestUpdatedAt);
  }

  async listByWorkspace(workspaceId: string): Promise<Node[]> {
    return Array.from(this.nodes.values())
      .filter(
        (node) =>
          node.workspaceId === workspaceId &&
          node.deletedAt === null,
      )
      .sort(byNewestUpdatedAt);
  }
}
