import { createVinemaApiServer } from "./http/create-server";
import { prisma } from "./db/prisma";
import { PrismaSyncStore } from "./db/prisma-sync-store";
import { loadAuthTokenConfig } from "./auth/auth-config";
import { PrismaAuthSessionRepository } from "./auth/auth-session-repository";
import { createAuthSessionService } from "./auth/auth-session-service";
import { PrismaDeviceRepository } from "./auth/device-repository";
import { createDeviceService } from "./auth/device-service";
import { createIdentityService } from "./auth/identity-service";
import { PrismaIdentityRepository } from "./auth/identity-repository";
import { createRefreshTokenCodec } from "./auth/refresh-token-codec";

const port = Number(process.env.PORT ?? 8000);
const tokenConfig = loadAuthTokenConfig(process.env);
const identityRepository = new PrismaIdentityRepository(prisma);
const deviceRepository = new PrismaDeviceRepository(prisma);
const deviceService = createDeviceService({
  repository: deviceRepository,
});
const sessionService = createAuthSessionService({
  repository: new PrismaAuthSessionRepository(prisma),
  identityRepository,
  deviceRepository,
  tokenConfig,
  refreshTokenCodec: createRefreshTokenCodec(),
  logger: console,
});
const identityService = createIdentityService({
  repository: identityRepository,
  deviceService,
  sessionService,
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
