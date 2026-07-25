import type { Device } from "@/domain/device/device";
import type { Node, NodeOrganizationStatus, NodeType } from "@/domain/node/node";
import type { NodeRepository } from "@/domain/node/node-repository";
import type { Workspace } from "@/domain/workspace/workspace";
import { validateEditableNode } from "@/features/node/node-validation";

export type CreateNodeInput = {
  type: NodeType;
  title: string;
  content: string;
  organizationStatus: NodeOrganizationStatus;
  workspace: Workspace;
  device: Device;
};

export async function createNode(
  repository: NodeRepository,
  input: CreateNodeInput,
): Promise<Node> {
  const validated = validateEditableNode(input);
  const now = new Date().toISOString();
  const node: Node = {
    id: crypto.randomUUID(),
    workspaceId: input.workspace.id,
    type: input.type,
    title: validated.title,
    content: validated.content,
    status: "ACTIVE",
    organizationStatus: input.organizationStatus,
    metadata: {},
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    createdByDeviceId: input.device.id,
    lastModifiedByDeviceId: input.device.id,
  };

  return repository.create(node);
}
