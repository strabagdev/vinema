import type { PrismaClient } from "@prisma/client";

export type IdentityUserRecord = {
  id: string;
  email: string;
  normalizedEmail: string;
  passwordHash: string;
  displayName: string | null;
  personalWorkspaceId: string;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type IdentityWorkspaceRecord = {
  id: string;
  name: string;
};

export type CreateUserWithWorkspaceInput = {
  email: string;
  normalizedEmail: string;
  passwordHash: string;
  displayName?: string | null;
  workspaceName: string;
};

export interface IdentityRepository {
  findUserByNormalizedEmail(normalizedEmail: string): Promise<IdentityUserRecord | null>;
  findUserById(userId: string): Promise<IdentityUserRecord | null>;
  findWorkspaceById(workspaceId: string): Promise<IdentityWorkspaceRecord | null>;
  createUserWithPersonalWorkspace(
    input: CreateUserWithWorkspaceInput,
  ): Promise<{ user: IdentityUserRecord; workspace: IdentityWorkspaceRecord }>;
}

export class PrismaIdentityRepository implements IdentityRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findUserByNormalizedEmail(normalizedEmail: string) {
    return this.prisma.user.findUnique({ where: { normalizedEmail } });
  }

  async findUserById(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }

  async findWorkspaceById(workspaceId: string) {
    return this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true },
    });
  }

  async createUserWithPersonalWorkspace(input: CreateUserWithWorkspaceInput) {
    return this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: { name: input.workspaceName },
        select: { id: true, name: true },
      });
      const user = await tx.user.create({
        data: {
          email: input.email,
          normalizedEmail: input.normalizedEmail,
          passwordHash: input.passwordHash,
          displayName: input.displayName ?? null,
          personalWorkspaceId: workspace.id,
          memberships: {
            create: {
              workspaceId: workspace.id,
              role: "OWNER",
            },
          },
        },
      });

      return { user, workspace };
    });
  }
}
