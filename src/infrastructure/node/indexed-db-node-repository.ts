import type { Node } from "@/domain/node/node";
import type { NodeRepository } from "@/domain/node/node-repository";
import { NODES_STORE, getVinemaDb } from "@/infrastructure/storage/vinema-db";

function byNewestUpdatedAt(a: Node, b: Node) {
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
}

export class IndexedDbNodeRepository implements NodeRepository {
  async create(node: Node): Promise<Node> {
    const db = await getVinemaDb();
    await db.add(NODES_STORE, toStoredNode(node));
    return node;
  }

  async update(node: Node): Promise<Node> {
    const db = await getVinemaDb();
    await db.put(NODES_STORE, toStoredNode(node));
    return node;
  }

  async archive(captureId: string, archivedAt: string): Promise<Node> {
    const db = await getVinemaDb();
    const existing = normalizeStoredNode(await db.get(NODES_STORE, captureId), {
      includeArchived: true,
    });

    if (!existing || existing.deletedAt !== null) {
      throw new Error("No se encontro la captura.");
    }

    const archivedNode = toArchivedNode(existing, archivedAt);
    await db.put(NODES_STORE, toStoredNode(archivedNode));
    return archivedNode;
  }

  async findById(id: string): Promise<Node | null> {
    const db = await getVinemaDb();
    const node = await db.get(NODES_STORE, id);

    const normalizedNode = normalizeStoredNode(node);

    if (
      !normalizedNode ||
      normalizedNode.deletedAt !== null ||
      normalizedNode.archivedAt
    ) {
      return null;
    }

    return normalizedNode;
  }

  async listActive(): Promise<Node[]> {
    const db = await getVinemaDb();
    const nodes = await db.getAll(NODES_STORE);

    return nodes
      .map((node) => normalizeStoredNode(node))
      .filter((node): node is Node => node !== null)
      .filter(
        (node) =>
          node.deletedAt === null &&
          !node.archivedAt &&
          node.organizationStatus === "ORGANIZED",
      )
      .sort(byNewestUpdatedAt);
  }

  async listInbox(): Promise<Node[]> {
    const db = await getVinemaDb();
    const nodes = await db.getAll(NODES_STORE);

    return nodes
      .map((node) => normalizeStoredNode(node))
      .filter((node): node is Node => node !== null)
      .filter(
        (node) =>
          node.deletedAt === null &&
          !node.archivedAt &&
          node.organizationStatus === "INBOX",
      )
      .sort(byNewestUpdatedAt);
  }

  async listByWorkspace(
    workspaceId: string,
    options: { includeArchived?: boolean } = {},
  ): Promise<Node[]> {
    const db = await getVinemaDb();
    const nodes = await db.getAllFromIndex(NODES_STORE, "by-workspace", workspaceId);

    return nodes
      .map((node) => normalizeStoredNode(node, options))
      .filter((node): node is Node => node !== null)
      .filter((node) => node.deletedAt === null)
      .sort(byNewestUpdatedAt);
  }
}

export function normalizeStoredNode(
  value: unknown,
  options: { includeArchived?: boolean } = {},
): Node | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Partial<Node> & {
    title?: unknown;
    context?: unknown;
  };
  const recoveredContent =
    typeof record.content === "string" && record.content.trim().length > 0
      ? record.content
      : typeof record.title === "string"
        ? record.title
        : record.content;

  if (
    typeof record.id !== "string" ||
    typeof record.workspaceId !== "string" ||
    (record.type !== "NOTE" && record.type !== "IDEA") ||
    typeof recoveredContent !== "string" ||
    typeof record.status !== "string" ||
    (record.organizationStatus !== "INBOX" &&
      record.organizationStatus !== "ORGANIZED") ||
    typeof record.version !== "number" ||
    typeof record.createdAt !== "string" ||
    typeof record.updatedAt !== "string" ||
    typeof record.createdByDeviceId !== "string" ||
    typeof record.lastModifiedByDeviceId !== "string"
  ) {
    return null;
  }

  const archivedAt = typeof record.archivedAt === "string" ? record.archivedAt : null;
  const restoredAt = typeof record.restoredAt === "string" ? record.restoredAt : null;
  const node: Node = {
    id: record.id,
    workspaceId: record.workspaceId,
    type: record.type,
    content: recoveredContent,
    status: archivedAt ? "ARCHIVED" : "ACTIVE",
    organizationStatus: record.organizationStatus,
    metadata:
      typeof record.metadata === "object" && record.metadata !== null
        ? record.metadata
        : {},
    version: record.version,
    createdAt: record.createdAt,
    contentUpdatedAt: record.contentUpdatedAt,
    updatedAt: record.updatedAt,
    deletedAt: typeof record.deletedAt === "string" ? record.deletedAt : null,
    createdByDeviceId: record.createdByDeviceId,
    lastModifiedByDeviceId: record.lastModifiedByDeviceId,
  };

  if (archivedAt) {
    node.archivedAt = archivedAt;
  }

  if (restoredAt) {
    node.restoredAt = restoredAt;
  }

  if (node.archivedAt && !options.includeArchived) {
    return null;
  }

  return node;
}

function toStoredNode(node: Node): Node {
  const cleanNode = { ...node } as Node & {
    title?: unknown;
    context?: unknown;
  };
  delete cleanNode.title;
  delete cleanNode.context;
  return cleanNode;
}

function toArchivedNode(node: Node, archivedAt: string): Node {
  return {
    ...node,
    status: "ARCHIVED",
    archivedAt,
    updatedAt: archivedAt,
    version: node.version + 1,
  };
}
