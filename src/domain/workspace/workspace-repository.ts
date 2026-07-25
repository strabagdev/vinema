import type { Workspace } from "@/domain/workspace/workspace";

export interface WorkspaceRepository {
  getDefault(): Promise<Workspace | null>;
  saveDefault(workspace: Workspace): Promise<Workspace>;
}
