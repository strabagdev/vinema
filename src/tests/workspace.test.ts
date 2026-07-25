import { describe, expect, it } from "vitest";
import type { Workspace } from "@/domain/workspace/workspace";
import type { WorkspaceRepository } from "@/domain/workspace/workspace-repository";
import { getOrCreateDefaultWorkspace } from "@/features/workspace/get-or-create-default-workspace";

class InMemoryWorkspaceRepository implements WorkspaceRepository {
  private workspace: Workspace | null = null;

  async getDefault(): Promise<Workspace | null> {
    return this.workspace;
  }

  async saveDefault(workspace: Workspace): Promise<Workspace> {
    this.workspace = workspace;
    return workspace;
  }
}

describe("getOrCreateDefaultWorkspace", () => {
  it("creates and reuses the local Personal workspace", async () => {
    const repository = new InMemoryWorkspaceRepository();

    const firstWorkspace = await getOrCreateDefaultWorkspace(repository);
    const secondWorkspace = await getOrCreateDefaultWorkspace(repository);

    expect(firstWorkspace.name).toBe("Personal");
    expect(firstWorkspace.id).toEqual(expect.any(String));
    expect(secondWorkspace).toEqual(firstWorkspace);
  });
});
