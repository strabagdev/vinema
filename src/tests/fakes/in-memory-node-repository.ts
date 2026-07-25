import type { Node } from "@/domain/node/node";
import type { NodeRepository } from "@/domain/node/node-repository";

function byNewestUpdatedAt(a: Node, b: Node) {
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
}

export class InMemoryNodeRepository implements NodeRepository {
  private readonly nodes = new Map<string, Node>();

  constructor(nodes: Node[] = []) {
    nodes.forEach((node) => this.nodes.set(node.id, node));
  }

  async create(node: Node): Promise<Node> {
    this.nodes.set(node.id, node);
    return node;
  }

  async update(node: Node): Promise<Node> {
    this.nodes.set(node.id, node);
    return node;
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
          node.status === "ACTIVE" &&
          node.organizationStatus === "ORGANIZED",
      )
      .sort(byNewestUpdatedAt);
  }

  async listInbox(): Promise<Node[]> {
    return Array.from(this.nodes.values())
      .filter(
        (node) =>
          node.deletedAt === null &&
          node.status === "ACTIVE" &&
          node.organizationStatus === "INBOX",
      )
      .sort(byNewestUpdatedAt);
  }

  async listArchived(): Promise<Node[]> {
    return Array.from(this.nodes.values())
      .filter((node) => node.deletedAt === null && node.status === "ARCHIVED")
      .sort(byNewestUpdatedAt);
  }
}
