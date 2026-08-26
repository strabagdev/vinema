export type CaptureType = "NOTE" | "IDEA";

export type CaptureStatus = "ACTIVE" | "ARCHIVED";

export type CaptureOrganizationStatus = "INBOX" | "ORGANIZED";

export interface Capture {
  id: string;
  workspaceId: string;
  type: CaptureType;
  content: string;
  status: CaptureStatus;
  organizationStatus: CaptureOrganizationStatus;
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
