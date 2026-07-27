import { createVinemaApiServer } from "./http/create-server";
import { prisma } from "./db/prisma";
import { PrismaSyncStore } from "./db/prisma-sync-store";

const port = Number(process.env.PORT ?? 3001);
const apiKey = process.env.VINEMA_SYNC_API_KEY;

if (!apiKey) {
  throw new Error("VINEMA_SYNC_API_KEY is required to start Vinema API.");
}

const app = createVinemaApiServer({
  store: new PrismaSyncStore(prisma),
  apiKey,
});

app.listen({ host: "0.0.0.0", port }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void app.close().finally(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  });
}
