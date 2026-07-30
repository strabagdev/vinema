import { createVinemaApiServer } from "./http/create-server";
import { prisma } from "./db/prisma";
import { PrismaSyncStore } from "./db/prisma-sync-store";
import { loadAuthTokenConfig } from "./auth/auth-config";
import { PrismaDeviceRepository } from "./auth/device-repository";
import { createDeviceService } from "./auth/device-service";
import { createIdentityService } from "./auth/identity-service";
import { PrismaIdentityRepository } from "./auth/identity-repository";

const port = Number(process.env.PORT ?? 8000);
const tokenConfig = loadAuthTokenConfig(process.env);
const deviceService = createDeviceService({
  repository: new PrismaDeviceRepository(prisma),
});
const identityService = createIdentityService({
  repository: new PrismaIdentityRepository(prisma),
  deviceService,
  tokenConfig,
});

const app = createVinemaApiServer({
  store: new PrismaSyncStore(prisma),
  identityService,
  tokenConfig,
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
