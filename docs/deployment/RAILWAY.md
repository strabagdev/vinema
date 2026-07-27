# Railway - Vinema API

## Servicios

Usar el mismo proyecto Railway de Vinema donde vive PostgreSQL. Crear un nuevo
servicio para la API desde este repositorio. No crear un segundo proyecto si la
base PostgreSQL pertenece exclusivamente a Vinema.

## Variables

Configurar en el servicio de API:

```env
NIXPACKS_NODE_VERSION=22
DATABASE_URL=${{Postgres.DATABASE_URL}}
VINEMA_SYNC_API_KEY=<secreto>
VINEMA_SEED_EMAIL=<email>
VINEMA_SEED_WORKSPACE_NAME=Personal
```

Usar la referencia del servicio PostgreSQL de Railway en lugar de copiar
credenciales manualmente. Si Railway ofrece conectividad privada dentro del
proyecto, preferirla sobre URLs publicas.

Vinema requiere Node 22 para construir en Railway. El repositorio incluye
`nixpacks.toml` para ejecutar `npm ci` en fase install con cache npm fuera de
`node_modules`, evitando conflictos con los cache mounts de Nixpacks durante la
fase build.

## Root directory

Configurar Railway para construir desde la raiz del repositorio (`/`), no desde
`server/`. El servidor depende del workspace `@vinema/sync-contracts`, del
`package-lock.json` raiz y del schema Prisma en `prisma/`.

## Build

La instalacion se ejecuta desde `nixpacks.toml`:

```bash
npm ci --cache /tmp/npm-cache
```

Comandos de build recomendados:

```bash
npm run db:generate && npm run server:build && npm run build
```

## Migraciones

En produccion usar:

```bash
npm run db:migrate:deploy
```

No usar `prisma migrate dev` contra produccion.

## Start

```bash
npm run server:start
```

El servidor escucha `PORT` si Railway lo define.

## Healthcheck

Configurar:

```text
/api/health
```

El endpoint no requiere API key y responde 503 si PostgreSQL no esta
disponible.

## CORS

Configurar `VINEMA_ALLOWED_ORIGINS` con una lista separada por comas cuando se
consuma la API desde origen web. Para desarrollo privado puede usarse `*`, pero
es temporal. Tauri puede enviar requests sin `Origin`; esos requests se aceptan.

## Seed

Despues de aplicar migraciones:

```bash
npm run db:seed
```

El seed reutiliza usuario, workspace y membership existentes.

## Dominio y health

Generar un dominio publico para el servicio de API y comprobar:

```bash
curl https://<dominio>/api/health
```

La respuesta debe indicar `status: "ok"` y `database: "connected"` sin exponer
credenciales.

## Prueba de integracion

Con variables locales:

```env
VINEMA_API_URL=https://<dominio>
VINEMA_SYNC_API_KEY=<secreto>
VINEMA_TEST_WORKSPACE_ID=<workspace-id>
```

Ejecutar:

```bash
npm run sync:test-api
```

Tambien existe el alias:

```bash
npm run test:sync-api
```

La prueba crea una captura, un concepto, una relacion, valida pull,
idempotencia y conflicto.

## Notas de seguridad

`VINEMA_SYNC_API_KEY` es temporal. No debe considerarse autenticacion final para
distribucion publica de la aplicacion desktop.
