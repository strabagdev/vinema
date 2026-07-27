# Vinema

Vinema es una aplicacion personal de conocimiento y notas, local-first y
offline-first. Esta fundacion tecnica deja una misma base de codigo para web,
PWA instalable y escritorio mediante Tauri 2.

## Stack

- Next.js App Router
- React
- TypeScript estricto
- Tailwind CSS
- shadcn/ui
- IndexedDB con fallback a localStorage
- Tauri 2

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm run test
npm run test:run
npm run tauri:dev
npm run tauri:build
```

## Desarrollo

```bash
npm run dev
```

Abrir `http://localhost:3000`.

## Documentacion

- [Constitucion vigente](docs/VIN-000_CONSTITUCION.md)
- [Punto Cero](docs/VIN-000_PUNTO_CERO.md)
- [Auditoria inicial](docs/VIN-000_AUDITORIA_REPOSITORIO.md)
- [Roadmap rector](docs/product/VINEMA_ROADMAP.md)
- [Revision del modelo de recuperacion](docs/product/VIN-007-RECOVERY-MODEL-REVIEW.md)
- [Linea base de recuperacion local](docs/product/VIN-008-RECOVERY-BASELINE.md)
- [Recuperacion y conceptos en tiempo real](docs/product/VIN-020-2-RECUPERACION-Y-CONCEPTOS.md)
- [Auditoria de recuperacion y conceptos](docs/product/VIN-020-3-AUDITORIA-RECUPERACION-CONCEPTOS.md)
- [Conceptos emergentes](docs/product/VIN-021-CONCEPTOS-EMERGENTES.md)
- [Normalizacion de conceptos](docs/product/VIN-021-2-NORMALIZACION-CONCEPTOS.md)
- [API y persistencia remota](docs/product/VIN-022-API-PERSISTENCIA-REMOTA.md)
- [Preparacion Railway](docs/product/VIN-022-1-PREPARACION-RAILWAY.md)
- [Despliegue Railway](docs/deployment/RAILWAY.md)

## Escritorio

```bash
npm run tauri:dev
```

Tauri consume el servidor local en desarrollo y empaqueta `out/` en build.

## Alcance actual

- Shell responsive con sidebar, header y navegacion movil.
- Superficie unica de escritura en `/` e Historial en `/notes`.
- Dispositivo persistente con `getOrCreateDevice()`.
- `StorageAdapter`, `IndexedDbAdapter` y `LocalStorageAdapter`.
- PWA con manifest, icono temporal y service worker.
- Workspace local por defecto.
- Capturar, editar, listar, abrir y archivar contenido local.
- Las capturas no usan titulo editable; su vista previa se deriva del contenido.
- Atajo global desde el App Shell para volver al editor con `Ctrl+Shift+K` o
  `Cmd+Shift+K`.
- Sugerencias locales y explicables de capturas relacionadas.
- Recuperacion en tiempo real separada de conceptos seleccionables.
- Conceptos emergentes confirmables desde patrones de capturas recuperadas.
- Normalizacion historica de conceptos equivalentes o invertidos preservando
  relaciones.
- Gestion minima de areas, proyectos y personas como contextos relacionales.
- Busqueda textual local integrada en la Base de Conocimiento.
- Persistencia local mediante IndexedDB.
- API remota Fastify para sincronizacion incremental con PostgreSQL.

Fuera de alcance: markdown avanzado, tags tradicionales, autenticacion,
realtime automatico, resolucion avanzada de conflictos, IA y busqueda global
remota o semantica.

## API remota

VIN-022 agrega un servidor separado en `server/` para preservar `output:
"export"` y la compatibilidad Tauri del frontend.

Arquitectura:

```text
Desktop -> IndexedDB -> Sync API -> PostgreSQL
```

La aplicacion desktop no usa PostgreSQL local ni despliega un servicio web. La
base operativa offline sigue siendo IndexedDB; PostgreSQL vive detras de la API.

```bash
npm install
npm run server:dev
npm run server:build
npm run server:start
```

Endpoints:

- `GET /api/health`
- `POST /api/sync/push`
- `GET /api/sync/pull`

Variables:

```env
DATABASE_URL=
VINEMA_SYNC_API_KEY=
VINEMA_SEED_EMAIL=
VINEMA_SEED_WORKSPACE_NAME=
VINEMA_ALLOWED_ORIGINS=
PORT=3001
```

Comandos Prisma:

```bash
npm run db:generate
npm run db:migrate:dev
npm run db:migrate:deploy
npm run db:seed
```

Prueba de integracion real:

```env
VINEMA_API_URL=
VINEMA_SYNC_API_KEY=
VINEMA_TEST_WORKSPACE_ID=
```

```bash
npm run sync:test-api
npm run test:sync-api
```

## Railway

Desplegar solo la API. Usar root directory `/` para que Railway tenga acceso a
workspaces, `package-lock.json` raiz y `prisma/schema.prisma`.

Build command:

```bash
npm ci && npm run db:generate && npm run server:build
```

Pre-deploy command:

```bash
npm run db:migrate:deploy
```

Start command:

```bash
npm run server:start
```

Healthcheck:

```text
/api/health
```

## Rutas funcionales

- `/`: Inicio, superficie unica de escritura con borrador local.
- `/notes`: Historial con busqueda textual.
- `/notes?q=<consulta>`: busqueda dentro del Historial.
- `/notes/archive`: Archivo de capturas restaurables.
- `/notes/archive?q=<consulta>`: busqueda dentro del Archivo.
- `/search`: compatibilidad; redirige a `/notes`.
- `/inbox`: compatibilidad; redirige a la captura principal.
- `/notes/new`: compatibilidad; redirige a la captura principal.
- `/notes/detail?nodeId=<id>`: detalle y edicion de captura.
- `/contexts/areas`: listado y creacion de areas.
- `/contexts/projects`: listado y creacion de proyectos contextuales.
- `/contexts/people`: listado y creacion de personas.
- `/contexts/detail?contextId=<id>`: detalle de contexto.

## IndexedDB

Base `vinema`, version 5:

- `key-value`: out-of-line, legado VIN-002 para preservar datos existentes.
- `app_settings`: out-of-line con clave string.
- `devices`: in-line con `keyPath: "id"`.
- `workspaces`: in-line con `keyPath: "id"`.
- `nodes`: in-line con `keyPath: "id"`.
- `contexts`: in-line con `keyPath: "id"`.
- `node_context_relations`: in-line con `keyPath: "id"` e indices
  `by-workspace`, `by-node`, `by-context`, `by-node-and-context`,
  `by-related-node` y `by-relation-type`.

Mientras Vinema use `output: "export"`, los recursos locales creados en
IndexedDB se abren con rutas estaticas y query params. Las notas usan
`/notes/detail?nodeId=<id>` en lugar de segmentos dinamicos de Next.js.

Las capturas historicas que todavia incluyan `title` se leen por compatibilidad.
Si no tienen contenido, ese valor se recupera como contenido; las escrituras
actuales guardan solamente el contenido de la captura.
