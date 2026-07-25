# VIN-003 - Nucleo funcional local

## Objetivo

Implementar la primera funcionalidad real de Vinema: capturar ideas en Inbox,
crear notas, editarlas, listarlas, abrirlas, archivarlas y conservar todo en
almacenamiento local tras recargar.

## Alcance

- Node como modelo interno de conocimiento.
- Workspace local por defecto llamado `Personal`.
- Repositorios independientes del dominio.
- Persistencia local mediante IndexedDB.
- Rutas `/inbox`, `/notes`, `/notes/new` y `/notes/detail?nodeId=<id>`.
- Pruebas unitarias con repositorios en memoria para la logica principal.

## Modelo Node

`Node` soporta por ahora dos tipos:

- `NOTE`: nota organizada.
- `IDEA`: captura rapida de Inbox.

Los estados implementados son:

- `ACTIVE`
- `ARCHIVED`

La organizacion inicial es:

- `INBOX`
- `ORGANIZED`

Cada Node guarda version, timestamps ISO 8601, device creador/modificador,
metadata y `deletedAt`. No se implementa eliminacion definitiva.

## Decisiones

- No se agrego Zod: las validaciones actuales son pequenas y claras con
  funciones puras.
- La UI usa terminos humanos: Nota, Idea e Inbox.
- La logica de negocio vive en `src/features/node/*`.
- Los componentes React usan hooks que llaman casos de uso y repositorios.
- No se instalo estado global; se usa React state y `refresh()` explicito.
- Con `output: "export"`, los recursos locales dinamicos no usan segmentos
  dinamicos de Next.js. El detalle de nota usa la ruta estatica
  `/notes/detail?nodeId=<id>`.

## Flujo de captura

Inbox enfoca automaticamente el textarea. `Ctrl+Enter` o `Cmd+Enter` captura una
idea como Node `IDEA` con `organizationStatus: "INBOX"`. Convertir una idea en
nota actualiza el mismo Node a `NOTE` y `ORGANIZED`, genera titulo desde el
contenido si esta vacio y navega al detalle.

## Persistencia

IndexedDB usa una unica base:

- Nombre: `vinema`
- Version anterior: `1`
- Version nueva: `3`

Stores:

- `key-value`: store legado de VIN-002, retenido para preservar Device.
- `app_settings`: configuracion local nueva, out-of-line con clave string.
- `devices`: reservado para evolucion del device local, in-line con
  `keyPath: "id"`.
- `workspaces`: workspace local por defecto, in-line con `keyPath: "id"`.
- `nodes`: notas e ideas, in-line con `keyPath: "id"`.

La migracion no usa `deleteDatabase`. Al abrir version 3, Vinema inspecciona
`nodes`, `workspaces` y `devices`; si alguno no usa `keyPath: "id"`, preserva
sus registros, elimina solo ese object store, lo recrea con clave in-line y
reinserta los datos. El adaptador de settings lee primero desde `app_settings` y
luego desde `key-value`, por lo que el Device existente se conserva y se
reescribe en el store nuevo al actualizarse.

## Rutas

- `/inbox`: captura rapida, listado de ideas, convertir y archivar.
- `/notes`: listado de notas activas organizadas.
- `/notes/new`: creacion de nota.
- `/notes/detail?nodeId=<id>`: detalle editable y archivado.

## Limitaciones

- SQLite, sincronizacion, autenticacion y backend siguen fuera de alcance.
- No hay papelera ni eliminacion definitiva.
- No hay Markdown avanzado, tags, proyectos, relaciones ni IA.
- En export estatico, `/notes/detail` forma parte del build y lee el `nodeId`
  desde query params, por lo que no depende de generar IDs locales durante build.

## Pruebas

Se agregan pruebas para creacion, validacion, edicion, archivado, restauracion,
workspace por defecto, listados, conversion IDEA a NOTE, persistencia en memoria
y orden por `updatedAt` descendente.

## Siguiente etapa

VIN-004 deberia enfocarse en endurecer el editor local: autosave controlado,
papelera/restauracion visible, mejor recuperacion de recargas profundas en
Tauri/export estatico y preparacion del modelo de cambios para sincronizacion.
