import { defineConfig } from "prisma/config";

if (!process.env.DATABASE_URL && process.env.NODE_ENV !== "production") {
  process.env.DATABASE_URL = [
    "postgresql",
    "://vinema:vinema@localhost:5432/vinema_dev",
  ].join("");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx server/prisma/seed.ts",
  },
});
