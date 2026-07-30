import type {
  CreateUserWithWorkspaceInput,
  IdentityRepository,
  IdentityUserRecord,
  IdentityWorkspaceRecord,
} from "../auth/identity-repository";

export class InMemoryIdentityRepository implements IdentityRepository {
  readonly users = new Map<string, IdentityUserRecord>();
  readonly workspaces = new Map<string, IdentityWorkspaceRecord>();

  async findUserByNormalizedEmail(normalizedEmail: string) {
    return (
      [...this.users.values()].find(
        (user) => user.normalizedEmail === normalizedEmail,
      ) ?? null
    );
  }

  async findUserById(userId: string) {
    return this.users.get(userId) ?? null;
  }

  async findWorkspaceById(workspaceId: string) {
    return this.workspaces.get(workspaceId) ?? null;
  }

  async createUserWithPersonalWorkspace(input: CreateUserWithWorkspaceInput) {
    const now = new Date();
    const workspace: IdentityWorkspaceRecord = {
      id: crypto.randomUUID(),
      name: input.workspaceName,
    };
    const user: IdentityUserRecord = {
      id: crypto.randomUUID(),
      email: input.email,
      normalizedEmail: input.normalizedEmail,
      passwordHash: input.passwordHash,
      displayName: input.displayName ?? null,
      personalWorkspaceId: workspace.id,
      disabledAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.workspaces.set(workspace.id, workspace);
    this.users.set(user.id, user);
    return { user, workspace };
  }

  disableUser(userId: string) {
    const user = this.users.get(userId);
    if (user) {
      this.users.set(userId, { ...user, disabledAt: new Date() });
    }
  }
}
