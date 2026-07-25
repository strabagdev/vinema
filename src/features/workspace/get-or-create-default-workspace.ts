import type { Workspace } from "@/domain/workspace/workspace";
import type { WorkspaceRepository } from "@/domain/workspace/workspace-repository";

function createWorkspaceId() {
  return crypto.randomUUID();
}

export async function getOrCreateDefaultWorkspace(
  repository: WorkspaceRepository,
): Promise<Workspace> {
  const existingWorkspace = await repository.getDefault();

  if (existingWorkspace) {
    return existingWorkspace;
  }

  const now = new Date().toISOString();
  const workspace: Workspace = {
    id: createWorkspaceId(),
    name: "Personal",
    createdAt: now,
    updatedAt: now,
  };

  return repository.saveDefault(workspace);
}
