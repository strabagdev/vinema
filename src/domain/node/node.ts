export type NodeType = "NOTE" | "IDEA";

export type NodeStatus = "ACTIVE" | "ARCHIVED";

export type NodeOrganizationStatus = "INBOX" | "ORGANIZED";

export interface Node {
  id: string;
  workspaceId: string;
  type: NodeType;
  content: string;
  status: NodeStatus;
  organizationStatus: NodeOrganizationStatus;
  metadata: Record<string, unknown>;
  version: number;
  createdAt: string;
  contentUpdatedAt?: string;
  archivedAt?: string | null;
  restoredAt?: string | null;
  updatedAt: string;
  deletedAt: string | null;
  createdByDeviceId: string;
  lastModifiedByDeviceId: string;
}
