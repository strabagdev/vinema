import type { Node } from "@/domain/node/node";
import type { NodeRepository } from "@/domain/node/node-repository";
import { NODES_STORE, getVinemaDb } from "@/infrastructure/storage/vinema-db";

function byNewestUpdatedAt(a: Node, b: Node) {
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
}

export class IndexedDbNodeRepository implements NodeRepository {
  async create(node: Node): Promise<Node> {
    const db = await getVinemaDb();
    await db.add(NODES_STORE, stripLegacyEmbeddedContext(node));
    return node;
  }

  async update(node: Node): Promise<Node> {
    const db = await getVinemaDb();
    await db.put(NODES_STORE, stripLegacyEmbeddedContext(node));
    return node;
  }

  async findById(id: string): Promise<Node | null> {
    const db = await getVinemaDb();
    const node = await db.get(NODES_STORE, id);

    if (!node || node.deletedAt !== null) {
      return null;
    }

    return stripLegacyEmbeddedContext(node);
  }

  async listActive(): Promise<Node[]> {
    const db = await getVinemaDb();
    const nodes = await db.getAll(NODES_STORE);

    return nodes
      .map(stripLegacyEmbeddedContext)
      .filter(
        (node) =>
          node.deletedAt === null &&
          node.status === "ACTIVE" &&
          node.organizationStatus === "ORGANIZED",
      )
      .sort(byNewestUpdatedAt);
  }

  async listInbox(): Promise<Node[]> {
    const db = await getVinemaDb();
    const nodes = await db.getAll(NODES_STORE);

    return nodes
      .map(stripLegacyEmbeddedContext)
      .filter(
        (node) =>
          node.deletedAt === null &&
          node.status === "ACTIVE" &&
          node.organizationStatus === "INBOX",
      )
      .sort(byNewestUpdatedAt);
  }

  async listArchived(): Promise<Node[]> {
    const db = await getVinemaDb();
    const nodes = await db.getAll(NODES_STORE);

    return nodes
      .map(stripLegacyEmbeddedContext)
      .filter((node) => node.deletedAt === null && node.status === "ARCHIVED")
      .sort(byNewestUpdatedAt);
  }
}

function stripLegacyEmbeddedContext(node: Node): Node {
  if (!("context" in node)) {
    return node;
  }

  const nodeWithoutContext = { ...node } as Node & { context?: unknown };
  delete nodeWithoutContext.context;
  return nodeWithoutContext;
}
