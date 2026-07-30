export interface NodeContextRelation {
  id: string;
  workspaceId: string;
  nodeId: string;
  contextId: string;
  relationType?: "CONTEXT" | "CAPTURE_ASSOCIATION";
  relatedNodeId?: string;
  version: number;
  createdAt: string;
}
