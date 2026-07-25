import type { Workspace } from "@/domain/workspace/workspace";
import type { WorkspaceRepository } from "@/domain/workspace/workspace-repository";
import {
  APP_SETTINGS_STORE,
  WORKSPACES_STORE,
  getVinemaDb,
} from "@/infrastructure/storage/vinema-db";

const DEFAULT_WORKSPACE_KEY = "vinema:default-workspace-id";

export class IndexedDbWorkspaceRepository implements WorkspaceRepository {
  async getDefault(): Promise<Workspace | null> {
    const db = await getVinemaDb();
    const workspaceId = await db.get(APP_SETTINGS_STORE, DEFAULT_WORKSPACE_KEY);

    if (typeof workspaceId !== "string") {
      return null;
    }

    return (await db.get(WORKSPACES_STORE, workspaceId)) ?? null;
  }

  async saveDefault(workspace: Workspace): Promise<Workspace> {
    const db = await getVinemaDb();
    const tx = db.transaction([WORKSPACES_STORE, APP_SETTINGS_STORE], "readwrite");

    await tx.objectStore(WORKSPACES_STORE).put(workspace);
    await tx.objectStore(APP_SETTINGS_STORE).put(workspace.id, DEFAULT_WORKSPACE_KEY);
    await tx.done;

    return workspace;
  }
}
