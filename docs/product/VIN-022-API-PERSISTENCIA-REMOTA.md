# VIN-022 - API y persistencia remota

## Contexto

Vinema mantiene IndexedDB como almacenamiento operativo local. VIN-022 agrega la
primera capa remota durable para sincronizacion incremental mediante una API
HTTP, contratos compartidos, Prisma y PostgreSQL.

La aplicacion local no se conecta a PostgreSQL. La API es el unico punto que
conoce `DATABASE_URL`.

## Auditoria inicial

El repositorio actual es una aplicacion Next.js App Router con `output:
"export"`, React, TypeScript estricto, Vitest, IndexedDB y Tauri. La
documentacion local de Next indica que Route Handlers dependientes de `Request`
no son compatibles con static export. Por eso no se agregaron rutas API dentro
de `src/app/api`.

El proyecto no era monorepo y no tenia Prisma ni configuracion Railway previa.
La estructura elegida mantiene un unico repositorio con una carpeta `server/` y
contratos compartidos en `packages/sync-contracts`.

## Decision de estructura

```text
packages/
  sync-contracts/
server/
  src/
  prisma/
prisma/
src/
```

Esta decision preserva el build estatico de la interfaz y permite desplegar la
API como servicio Node independiente en Railway.

## Entidades remotas

El modelo remoto usa nombres explicitos:

- `Capture`: representa un `Node` local tipo captura/nota.
- `Concept`: representa un `Context` local consolidado.
- `CaptureConcept`: representa una relacion local `node_context_relations`.
- `SyncChange`: registro incremental por workspace.
- `ProcessedMutation`: idempotencia de push.

Tambien existen `User`, `Workspace` y `WorkspaceMember` para aislar datos y
preparar autenticacion futura.

## Contratos

`packages/sync-contracts` define contratos Zod y tipos TypeScript para:

- entidades remotas;
- mutaciones;
- push;
- pull;
- conflictos;
- errores.

Los limites iniciales son:

- 100 mutaciones por push;
- 500 resultados maximos por pull;
- 50.000 caracteres por captura;
- 200 caracteres por etiqueta de concepto.

## API

El servidor Fastify expone:

- `GET /api/health`
- `POST /api/sync/push`
- `GET /api/sync/pull`

`health` es publico y no expone credenciales. `push` y `pull` requieren
`Authorization: Bearer <VINEMA_SYNC_API_KEY>`.

## Push

El push acepta ids UUID generados por el cliente. Cada mutacion incluye
`mutationId`, `entityId`, `baseVersion` y `payload`.

Para mutaciones aceptadas:

1. se escribe la entidad;
2. se incrementa version;
3. se registra `SyncChange`;
4. se registra `ProcessedMutation`.

Si `mutationId` se recibe de nuevo, la respuesta previa se reutiliza sin volver
a mutar datos ni incrementar version.

## Pull

El pull usa cursor incremental basado en `SyncChange.sequence`, serializado como
string por ser `BigInt`. No depende de timestamps.

La respuesta devuelve cambios posteriores al cursor y el estado actual de cada
entidad referenciada.

## Conflictos

Si `baseVersion` no coincide con la version canonica del servidor, el servidor
responde con `VERSION_CONFLICT` y la entidad actual. No sobrescribe datos ni
registra `SyncChange`.

## Archivado

La sincronizacion normal no elimina fisicamente capturas, conceptos ni
relaciones. El borrado se representa con `archivedAt` y genera un cambio
incremental.

## Aislamiento

Todas las lecturas y escrituras se filtran por `workspaceId`. Una relacion
`CaptureConcept` solo se acepta si captura y concepto existen en el mismo
workspace.

## Adaptadores locales

`src/features/sync/sync-mappers.ts` agrega funciones puras para mapear:

- `Node` local a mutacion `Capture`;
- `Context` local a mutacion `Concept`;
- relacion local a mutacion `CaptureConcept`;
- `Capture` remoto a `Node`;
- `Concept` remoto a `Context`.

No ejecutan requests ni modifican IndexedDB.

## Seed

`server/prisma/seed.ts` crea o reutiliza:

- usuario por `VINEMA_SEED_EMAIL`;
- workspace personal;
- membership `OWNER`.

El seed es idempotente y no contiene datos personales en codigo.

## Seguridad temporal

`VINEMA_SYNC_API_KEY` es una proteccion temporal para desarrollo personal. No es
un esquema valido para distribuir una app desktop publica, porque el secreto
puede extraerse del ejecutable. VIN-023 debe reemplazarlo por autenticacion real.

## Validaciones

Se agregaron pruebas para health, autorizacion, push, pull, versionado,
conflictos, idempotencia, conceptos, relaciones, aislamiento, archivado,
validacion y mappers.

La prueba de integracion real esta en `scripts/test-sync-api.ts` y requiere una
API y base reales configuradas por variables de entorno.

## Limitaciones

VIN-022 no implementa sincronizacion automatica desde IndexedDB, cola local,
OAuth, WebSockets, resolucion avanzada de conflictos ni migracion de datos
locales existentes.
