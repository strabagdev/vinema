import type { Capture } from "@/domain/capture/capture";

export interface CaptureRepository {
  create(capture: Capture): Promise<Capture>;
  update(capture: Capture): Promise<Capture>;
  archive(captureId: string, archivedAt: string): Promise<Capture>;
  findById(id: string): Promise<Capture | null>;
  listActive(): Promise<Capture[]>;
  listInbox(): Promise<Capture[]>;
  listByWorkspace(
    workspaceId: string,
    options?: { includeArchived?: boolean },
  ): Promise<Capture[]>;
}
