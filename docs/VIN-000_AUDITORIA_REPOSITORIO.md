# VIN-000 - Auditoria del repositorio

## Stack detectado

Respaldado por `package.json`, `docs/VIN-002-foundation.md` y estructura `src/`.

- Next.js App Router 16.
- React 19.
- TypeScript estricto.
- Tailwind CSS.
- Componentes UI locales inspirados en shadcn/ui.
- IndexedDB mediante `idb`.
- fake-indexeddb para pruebas.
- Tauri 2 configurado para escritorio.
- PWA con `manifest.ts` y `public/sw.js`.

No existen Prisma, migraciones SQL, seeds, server actions, APIs backend ni
autenticacion persistida.

## Estructura

- `src/app`: rutas de aplicacion.
- `src/domain`: entidades y contratos de repositorio.
- `src/features`: casos de uso y hooks.
- `src/infrastructure`: adaptadores IndexedDB, plataforma y repositorios.
- `src/components`: shell, navegacion y UI base.
- `src/tests`: pruebas unitarias y de comportamiento con jsdom/fake-indexeddb.
- `docs`: documentos historicos VIN.
- `docs/product`: documentos rectores y auditoria de recuperacion.

## Componentes principales

- `src/components/app-shell/app-sidebar.tsx`: navegacion principal.
- `src/app/inbox/page.tsx`: captura rapida.
- `src/app/notes/page.tsx`: listado de notas activas.
- `src/app/notes/new/page.tsx`: creacion de nota.
- `src/app/notes/detail/note-detail-client.tsx`: lectura, edicion, autosave,
  archivado y relaciones contextuales.
- `src/app/contexts/context-list-client.tsx`: listados y creacion de contextos.
- `src/app/contexts/detail/context-detail-client.tsx`: detalle, edicion,
  archivado/restauracion y notas relacionadas.

## Modelo de datos

Respaldado por `src/infrastructure/storage/vinema-db.ts`.

IndexedDB `vinema`, version `4`:

- `app_settings`: configuracion local.
- `key-value`: store legado.
- `devices`: instalacion o navegador.
- `workspaces`: workspace local.
- `nodes`: notas e ideas.
- `contexts`: Areas, Proyectos, Personas.
- `node_context_relations`: relaciones entre nodos y contextos.

Indices relevantes:

- `nodes`: `by-updated-at`, `by-workspace`.
- `contexts`: `by-workspace`, `by-type`, `by-archived-at`,
  `by-workspace-and-type`.
- `node_context_relations`: `by-workspace`, `by-node`, `by-context`,
  `by-node-and-context` unico.

## Flujos actuales

### Captura de idea

`src/app/inbox/page.tsx` crea `Node` tipo `IDEA` usando
`src/features/node/create-node.ts`.

### Creacion de nota

`src/app/notes/new/page.tsx` crea `Node` tipo `NOTE`. No exige contexto.

### Edicion de nota

`src/app/notes/detail/note-detail-client.tsx` abre en lectura, entra a edicion
con accion explicita y mantiene autosave de contenido.

### Relaciones

Desde el detalle de nota, los contextos se seleccionan en edicion y se confirman
con `Listo`. Se guardan mediante `attachNodeToContext` y
`detachNodeFromContext`.

### Navegacion por contexto

Las rutas `/contexts/areas`, `/contexts/projects`, `/contexts/people` y
`/contexts/detail?contextId=<id>` permiten consultar contextos y notas
relacionadas.

### Busqueda

No hay busqueda implementada. La unica recuperacion es por listados,
relaciones manuales y recencia.

## Estado de pruebas

`src/tests` cubre:

- dominio de notas;
- rutas de notas y contextos;
- persistencia IndexedDB;
- dominio de contextos y relaciones;
- detalle de nota y detalle de contexto;
- plataforma, storage y workspace.

No hay pruebas de busqueda porque no existe funcionalidad.

## Estado de documentacion

Existen documentos historicos `docs/VIN-000-product-constitution.md` a
`docs/VIN-006-context-management.md`, documentos rectores en `docs/product/` y
esta serie nueva `VIN-000_*`.

Inconsistencias:

- `README.md` fue actualizado para version 4, pero aun describe Vinema como
  "aplicacion personal de conocimiento y notas".
- `docs/VIN-003-local-core.md` documenta IndexedDB version 3, historicamente
  correcto para ese paquete pero no para el estado actual.
- `docs/VIN-005` y `docs/VIN-006` son validos como historia, pero no deben
  orientar el siguiente paso hacia mas tipos de contexto.

## Deuda tecnica

- Falta busqueda textual.
- No existe indice textual ni tokenizacion.
- `Context` aun usa tipos cerrados Area/Proyecto/Persona.
- No hay distincion persistida entre Fuente, Captura y Concepto.
- Las relaciones no tienen tipo, direccion, evidencia ni origen.
- El tiempo existe como metadata, pero no como mecanismo de acceso.

## Codigo posiblemente obsoleto

No hay codigo claramente muerto que deba eliminarse ahora.

Elementos a revisar en fases futuras:

- `ContextType` cerrado si se adopta `Concept`.
- Navegacion lateral centrada en Areas/Proyectos/Personas.
- Textos de README/documentos que priorizan "notas" sobre "acceso".

## Dependencias que condicionan el dominio

- `output: "export"` exige rutas estaticas y query params para entidades locales.
- IndexedDB favorece consultas locales simples, pero no provee busqueda full-text
  directa.
- Tauri/PWA mantienen el principio local-first/offline-first.
