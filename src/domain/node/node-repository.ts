import type { Node } from "@/domain/node/node";

export interface NodeRepository {
  create(node: Node): Promise<Node>;
  update(node: Node): Promise<Node>;
  findById(id: string): Promise<Node | null>;
  listActive(): Promise<Node[]>;
  listInbox(): Promise<Node[]>;
  listByWorkspace(
    workspaceId: string,
    options?: { includeArchived?: boolean },
  ): Promise<Node[]>;
}
