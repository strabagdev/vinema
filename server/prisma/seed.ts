import { prisma } from "../src/db/prisma";

async function main() {
  const email = process.env.VINEMA_SEED_EMAIL;
  const workspaceName = process.env.VINEMA_SEED_WORKSPACE_NAME ?? "Personal";

  if (!email) {
    throw new Error("VINEMA_SEED_EMAIL is required for db seed.");
  }

  const user = await prisma.user.upsert({
    where: { email },
    create: { email },
    update: {},
  });
  const existingMembership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id, role: "OWNER" },
    include: { workspace: true },
  });
  const workspace =
    existingMembership?.workspace ??
    (await prisma.workspace.create({
      data: {
        name: workspaceName,
        members: {
          create: {
            userId: user.id,
            role: "OWNER",
          },
        },
      },
    }));

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: user.id,
      },
    },
    create: {
      workspaceId: workspace.id,
      userId: user.id,
      role: "OWNER",
    },
    update: { role: "OWNER" },
  });

  console.log(
    JSON.stringify({
      userId: user.id,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
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
