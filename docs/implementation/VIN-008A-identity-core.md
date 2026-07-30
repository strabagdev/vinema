# VIN-008A - Identity Core

## Objetivo

VIN-008A introduce el nucleo minimo de identidad de Vinema:

- registro con email y password;
- login;
- access token firmado y con expiracion;
- consulta de sesion actual;
- workspace personal por usuario;
- proteccion de Push/Pull;
- cliente Auth desacoplado;
- AuthStateEngine observable;
- AccessTokenProvider;
- bridge Auth -> SyncStateEngine.

No incluye UI, React, refresh tokens, SessionStore ni restauracion persistente de sesion.

## Arquitectura

Servidor:

Auth Routes -> IdentityService -> IdentityRepository -> Prisma/PostgreSQL.

Cliente:

AuthClient -> AuthService -> AuthStateEngine.

Integracion:

AuthStateEngine -> AuthSyncStateBridge -> SyncStateEngine.

Sync no importa AuthService. Auth no importa AutomaticSyncOrchestrator.

## User

El modelo persistente `User` incluye:

- `id`
- `email`
- `normalizedEmail`
- `passwordHash`
- `displayName`
- `personalWorkspaceId`
- `createdAt`
- `updatedAt`
- `disabledAt`

`normalizedEmail` es unico.

`passwordHash` nunca se expone en responses.

## Workspace Personal

Cada registro crea transaccionalmente:

1. workspace personal;
2. usuario;
3. membresia OWNER;
4. vinculo `personalWorkspaceId`.

El cliente no decide el workspace del usuario.

## Normalizacion De Email

La normalizacion vive en `server/src/auth/email.ts`.

Politica:

- `trim`
- `lowercase`

Se usa en register, login y busquedas.

## Password

Politica:

- minimo 8 caracteres;
- maximo 512 caracteres;
- sin reglas decorativas de mayusculas/simbolos;
- no se registran passwords;
- no se devuelven passwords.

## Hashing

El hashing vive en `server/src/auth/password.ts`.

Usa `node:crypto` con `scrypt`, salt aleatorio y comparacion con `timingSafeEqual`.

No se implementa algoritmo criptografico propio.

## Access Token

Los access tokens viven en `server/src/auth/access-token.ts`.

Formato:

- JWT compacto firmado con HMAC-SHA256;
- expiracion obligatoria;
- issuer y audience validados.

Claims:

- `sub`
- `workspaceId`
- `iat`
- `exp`
- `iss`
- `aud`

No incluye password, passwordHash, contenidos ni secretos.

## Configuracion

Variables:

- `VINEMA_AUTH_ACCESS_TOKEN_SECRET`
- `VINEMA_AUTH_ISSUER`
- `VINEMA_AUTH_AUDIENCE`
- `VINEMA_AUTH_ACCESS_TOKEN_TTL_SECONDS`

En produccion, el secreto es obligatorio y debe tener longitud suficiente.

## Endpoints

`POST /auth/register`

- responde 201;
- crea usuario y workspace personal;
- emite access token.

`POST /auth/login`

- responde 200;
- usa error generico `INVALID_CREDENTIALS`;
- no revela si el email existe.

`GET /auth/session`

- exige Bearer token;
- valida firma, expiracion, issuer y audience;
- devuelve usuario seguro y workspace.

## AuthContext

El middleware Bearer produce:

- `userId`
- `workspaceId`
- `expiresAt`
- claims validados.

No confia en userId enviado por body, query ni headers.

## Sync Protegido

Push y Pull exigen access token real.

El `workspaceId` del request se compara con `workspaceId` del token.

Si no coincide, responde `WORKSPACE_FORBIDDEN`.

Existe un bypass de API key solo para `NODE_ENV=test` y solo si se inyecta explicitamente en tests antiguos. Produccion no lo configura.

## AuthClient

`src/features/auth/auth-client.ts`

API:

- `register`
- `login`
- `getSession`

No persiste tokens y no depende de React/window/navigator.

## AuthStateEngine

`src/features/auth/auth-state-engine.ts`

Estado:

- `UNKNOWN`
- `AUTHENTICATING`
- `AUTHENTICATED`
- `UNAUTHENTICATED`
- `ERROR`

No guarda access token.

## AuthService

`src/features/auth/auth-service.ts`

Mantiene access token solo en memoria.

API:

- `register`
- `login`
- `getCurrentSession`
- `getAccessToken`
- `isAuthenticated`
- `clearLocalSession`
- `subscribe`

Al recargar la aplicacion, el usuario debe iniciar sesion nuevamente.

## AccessTokenProvider

`src/features/auth/access-token-provider.ts`

Permite inyectar tokens al `SyncClient` sin que Sync importe AuthService.

## Bridge Hacia SyncStateEngine

`src/features/auth/auth-sync-state-bridge.ts`

Traduce estado auth a:

- `AUTHENTICATED`
- `UNAUTHENTICATED`
- `UNKNOWN`

No inicia ni detiene sincronizacion.

## Migracion

Migracion:

`prisma/migrations/20260730090000_vin_008a_identity_core/migration.sql`

Agrega campos de identidad al User existente.

Usuarios legacy se marcan deshabilitados con hash placeholder hasta que sean recreados o gestionados por una fase posterior.

## Tests Y Scripts

Tests:

- `src/tests/auth-api.test.ts`
- `src/tests/auth-client.test.ts`

Scripts:

- `npm run sync:test-api`
- `npm run auth:test-api`

Ambos usan auth real y no imprimen tokens.

## Limitaciones

VIN-008A no incluye:

- refresh token;
- SessionStore;
- logout remoto;
- revocacion;
- restoreSession;
- dispositivos remotos;
- UI;
- React;
- OAuth;
- recuperacion de password;
- verificacion de email.

## Preparacion Para VIN-008B

VIN-008B puede agregar persistencia de sesion, refresh tokens, logout remoto y restauracion controlada sin cambiar el nucleo basico de identidad.
