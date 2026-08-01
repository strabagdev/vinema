# VIN-013D - Complete Memory Inventory

## Principio

Una cuenta representa una unica memoria activa.

El `workspaceId` es un limite tecnico interno. No es una unidad de producto, no se elige en UI y no se administra como contenedor visible.

Vaciar memoria debe dejar a Vinema en un estado funcional equivalente a una cuenta recien creada, conservando identidad, sesion, dispositivo e infraestructura minima.

## Matriz de Datos

| Dato | Ubicacion | Categoria | Es memoria | Exportar | Resetear | Restaurar | Nota |
|---|---|---|---:|---:|---:|---:|---|
| User | PostgreSQL | Identidad y seguridad | No | No | No | No | Cuenta, email y password hash. |
| Workspace | PostgreSQL | Infraestructura | No | No | No | No | Memoria tecnica unica de la cuenta. |
| WorkspaceMember | PostgreSQL | Identidad y seguridad | No | No | No | No | Vinculo usuario-memoria tecnica. |
| Device | PostgreSQL | Identidad y seguridad | No | No | No | No | Dispositivo confiable. |
| AuthSession | PostgreSQL | Identidad y seguridad | No | No | No | No | Sesion y refresh token hash. |
| Capture | PostgreSQL | Memoria primaria | Si | Si | Si | Si | Capturas activas y archivadas. |
| Concept | PostgreSQL | Memoria primaria | Si | Si | Si | Si | Conceptos aceptados activos y archivados. |
| CaptureConcept | PostgreSQL | Memoria primaria | Si | Si | Si | Si | Relaciones captura-concepto. |
| SyncChange | PostgreSQL | Sync | No | No | No | No | Historial tecnico y marcador de reset. |
| ProcessedMutation | PostgreSQL | Sync | No | No | No | No | Idempotencia del push remoto. |
| nodes | IndexedDB | Memoria primaria | Si | Si | Si | Si | Capturas locales. |
| contexts | IndexedDB | Memoria primaria | Si | Si | Si | Si | Conceptos locales. |
| node_context_relations | IndexedDB | Memoria primaria | Si | Si | Si | Si | Relaciones locales. |
| app_settings | IndexedDB | Infraestructura | No | No | Parcial | No | Preferencias; contiene borrador bajo clave dedicada. |
| vinema:capture-draft:v1 | Browser storage | Estado local | No | No | Si | No | Borrador local de captura. |
| key-value | IndexedDB | Infraestructura heredada | No | No | Parcial | No | Store legacy; el borrador tambien se elimina ahi. |
| auth_session | IndexedDB | Identidad y seguridad | No | No | No | No | Sesion local. |
| devices | IndexedDB | Identidad y seguridad | No | No | No | No | Dispositivo local. |
| workspaces | IndexedDB | Infraestructura | No | No | No | No | Workspace tecnico local. |
| sync_mutations | IndexedDB | Sync | No | No | Si | No | Outbox; limpiar evita revivir memoria antigua. |
| sync_metadata | IndexedDB | Sync | No | No | Si | No | Cursores y errores; cursor avanza al reset. |
| association suggestions | Runtime | Derivado | No | No | Si | No | Se reconstruye desde memoria persistida. |
| emergent identity | Runtime | Derivado | No | No | Si | No | Se deriva; no se exporta como titulo. |

## PostgreSQL

El esquema remoto contiene tablas de identidad (`User`, `Device`, `AuthSession`, `WorkspaceMember`), infraestructura (`Workspace`), memoria (`Capture`, `Concept`, `CaptureConcept`) y sync (`SyncChange`, `ProcessedMutation`).

No existen tablas de embeddings, indices semanticos persistidos, caches de recuperacion o sugerencias historicas persistidas.

## IndexedDB

La base `vinema` version 7 contiene:

- `nodes`;
- `contexts`;
- `node_context_relations`;
- `app_settings`;
- `auth_session`;
- `devices`;
- `key-value`;
- `sync_metadata`;
- `sync_mutations`;
- `workspaces`.

La memoria primaria local vive solo en `nodes`, `contexts` y `node_context_relations`.

## Browser Storage

El borrador de captura se guarda mediante la clave:

```text
vinema:capture-draft:v1
```

El adaptador lo elimina tanto de `app_settings` como del store heredado `key-value`.

No se encontro uso persistente de `sessionStorage`, Cache Storage, BroadcastChannel persistente, WebSocket, SSE o Service Worker caches para memoria de usuario.

## Estado Funcional

Las sugerencias conceptuales, "Me recuerda a", identidad emergente, Base de conocimiento y Archivo se derivan desde:

- capturas;
- conceptos;
- relaciones;
- estado archivado.

No tienen almacenamiento persistente propio. Al limpiar memoria primaria e invalidar la UI, quedan vacios.

## Omisiones Del Reset Anterior

VIN-013B ya eliminaba la memoria primaria, outbox, metadata local y borrador. VIN-013D formaliza que no hay otros stores de memoria primaria y agrega una barrera remota para que mutaciones antiguas no revivan datos despues del reset.

## Decision

No se requiere migracion Prisma para VIN-013D.

La barrera de generacion se implementa usando el marcador monotono `workspaceKnowledgeReset` existente y su `occurredAt`. Una mutacion con `updatedAt` anterior o igual al ultimo reset remoto se rechaza con `MEMORY_RESET_CONFLICT`.
