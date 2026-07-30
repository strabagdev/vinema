import { prisma } from "../src/db/prisma";
import { normalizeEmail } from "../src/auth/email";
import { hashPassword } from "../src/auth/password";

async function main() {
  const email = process.env.VINEMA_SEED_EMAIL;
  const password = process.env.VINEMA_SEED_PASSWORD;
  const workspaceName = process.env.VINEMA_SEED_WORKSPACE_NAME ?? "Personal";

  if (!email || !password) {
    throw new Error("VINEMA_SEED_EMAIL and VINEMA_SEED_PASSWORD are required for db seed.");
  }

  const normalizedEmail = normalizeEmail(email);
  const passwordHash = await hashPassword(password);

  const result = await prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({ where: { normalizedEmail } });
    if (existingUser) {
      return {
        user: existingUser,
        workspace: await tx.workspace.findUniqueOrThrow({
          where: { id: existingUser.personalWorkspaceId },
        }),
      };
    }

    const workspace = await tx.workspace.create({
      data: { name: workspaceName },
    });
    const user = await tx.user.create({
      data: {
        email: email.trim(),
        normalizedEmail,
        passwordHash,
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

  console.log(
    JSON.stringify({
      userId: result.user.id,
      workspaceId: result.workspace.id,
      workspaceName: result.workspace.name,
    }),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
