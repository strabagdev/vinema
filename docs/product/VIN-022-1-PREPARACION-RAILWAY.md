# VIN-022.1 - Preparacion de repositorio y Railway

## Objetivo

Preparar Vinema para mantener desktop, API Fastify y contratos compartidos en
un unico repositorio con npm workspaces, dejando la API lista para desplegarse
en Railway contra PostgreSQL.

## Arquitectura confirmada

La aplicacion desktop sigue siendo Next.js static export + Tauri + IndexedDB.
La API permanece separada en `server/` porque `output: "export"` no soporta
Route Handlers dinamicos como backend runtime.

```text
Desktop -> IndexedDB -> Sync API -> PostgreSQL
```

## Workspaces

El repositorio raiz declara:

```json
{
  "workspaces": ["server", "packages/*"]
}
```

`server` consume `@vinema/sync-contracts` por nombre de paquete. No se duplican
contratos ni se usan imports relativos hacia `packages/sync-contracts`.

## Servidor

Fastify escucha `process.env.PORT ?? 3001` en `0.0.0.0`. Produccion usa
JavaScript compilado con `node dist/index.js`.

Se agrego CORS explicito mediante `VINEMA_ALLOWED_ORIGINS`. Requests sin
`Origin`, como algunos entornos Tauri, se aceptan. `*` queda permitido solo como
opcion temporal para desarrollo privado.

## Prisma

`prisma.config.ts` define schema, migraciones y seed. `DATABASE_URL` vive solo en
variables de entorno.

Las migraciones se versionan en `prisma/migrations/`.

## Railway

Railway debe construir desde la raiz:

```bash
npm ci && npm run db:generate && npm run server:build
```

Pre-deploy:

```bash
npm run db:migrate:deploy
```

Start:

```bash
npm run server:start
```

Healthcheck:

```text
/api/health
```

## Secretos

`.env` y `.env.*` quedan ignorados. `.env.example` se versiona solo con
placeholders vacios.

No se deben guardar credenciales reales, URLs PostgreSQL reales ni API keys en
Git.

## Limitaciones

VIN-022.1 no conecta IndexedDB a la API, no agrega cola de sincronizacion, no
implementa autenticacion final y no ejecuta migraciones contra Railway sin una
credencial valida entregada por entorno seguro.
