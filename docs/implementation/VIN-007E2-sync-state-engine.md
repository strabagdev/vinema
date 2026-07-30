# VIN-007E2 - Sync State Engine

## Objetivo

VIN-007E2 crea un motor central y observable para representar el estado actual de sincronizacion de Vinema.

El engine consolida informacion proveniente de:

- AutomaticSyncOrchestrator;
- outbox local;
- conflictos;
- conectividad futura;
- autenticacion futura.

No implementa UI, React, eventos del navegador, login ni sincronizacion automatica nueva.

## Estado Central

El estado vive en memoria y esta tipado como `SyncState`.

Incluye:

- lifecycle: `STOPPED` o `STARTED`;
- phase: `IDLE`, `WAITING`, `PUSHING`, `PULLING`, `SUCCESS`, `ERROR`, `CANCELLED`;
- connectivity: `UNKNOWN`, `ONLINE`, `OFFLINE`;
- authentication: `UNKNOWN`, `AUTHENTICATED`, `UNAUTHENTICATED`;
- conteos de mutaciones pending, processing, failed y conflicts;
- marcas temporales de ejecucion;
- ultimo error observable.

El estado no guarda tokens, payloads, contenido de capturas, informacion personal ni stack traces completos.

## Eventos

Los productores publican eventos tipados `SyncEvent`.

Eventos soportados:

- `ORCHESTRATOR_STARTED`
- `ORCHESTRATOR_STOPPED`
- `SYNC_SCHEDULED`
- `SYNC_STARTED`
- `PUSH_STARTED`
- `PUSH_FINISHED`
- `PULL_STARTED`
- `PULL_FINISHED`
- `SYNC_SUCCEEDED`
- `SYNC_FAILED`
- `SYNC_CANCELLED`
- `OUTBOX_COUNTS_CHANGED`
- `CONFLICT_COUNT_CHANGED`
- `CONNECTIVITY_CHANGED`
- `AUTHENTICATION_CHANGED`
- `ERROR_CLEARED`
- `STATE_RESET`

No hay payload generico `any`.

## Reducer

`reduceSyncState(state, event)` es puro y determinista.

No accede a IndexedDB, no conoce React, no usa el orquestador y no muta el estado recibido.

El switch de eventos usa verificacion exhaustiva de TypeScript.

## Engine

`createSyncStateEngine()` expone:

- `getState()`
- `dispatch(event)`
- `dispatchMany(events)`
- `subscribe(listener)`
- `reset()`

`getState()` devuelve una copia defensiva.

`dispatch()` reduce el estado y solo notifica listeners si el estado cambio.

Errores de listeners se aislan.

## Bridge Con Orquestador

El bridge vive en:

`src/features/sync/orchestrator-sync-state-bridge.ts`

Observa `AutomaticSyncOrchestrator` y publica eventos al `SyncStateEngine`.

La dependencia va en una sola direccion:

Bridge -> Orchestrator + SyncStateEngine.

El orquestador no depende del engine.

## Conteos De Outbox

`IndexedDbSyncOutboxRepository` ahora expone `countByStatus(workspaceId, status)`.

`refreshOutboxState()` lee conteos indexados para:

- `PENDING`
- `PROCESSING`
- `FAILED`
- `CONFLICT`

No carga toda la outbox en memoria.

No hay polling automatico en esta fase.

## Conflictos

Los conflictos se reflejan como conteo mediante `CONFLICT_COUNT_CHANGED`.

No se implementa resolucion de conflictos ni almacenamiento duplicado.

## Conectividad Futura

El engine acepta `CONNECTIVITY_CHANGED` con:

- `UNKNOWN`
- `ONLINE`
- `OFFLINE`

No lee `navigator.onLine` ni registra listeners del navegador.

VIN-007E3 producira esos eventos.

## Autenticacion Futura

El engine acepta `AUTHENTICATION_CHANGED` con:

- `UNKNOWN`
- `AUTHENTICATED`
- `UNAUTHENTICATED`

No importa modulos de autenticacion ni bloquea sincronizacion.

VIN-008 publicara estos eventos posteriormente.

## Selectores

Selectores puros:

- `selectIsSyncing`
- `selectHasPendingChanges`
- `selectHasErrors`
- `selectHasConflicts`
- `selectSyncHealth`

Precedencia de salud:

1. `OFFLINE`
2. `CONFLICT`
3. `ERROR`
4. `SYNCING`
5. `PENDING`
6. `HEALTHY`

## Invariantes

El engine garantiza:

- los conteos negativos se normalizan a cero;
- `SUCCESS` actualiza `lastSuccessfulSyncAt`;
- `ERROR` no borra el ultimo exito;
- un exito posterior limpia `lastError`;
- `CANCELLED` deja phase `CANCELLED`;
- `STOPPED` no implica `OFFLINE`;
- `UNAUTHENTICATED` no implica `ERROR`;
- `OFFLINE` no destruye informacion previa;
- `reset()` vuelve al estado inicial conocido.

## Tests

La suite vive en:

`src/tests/sync-state-engine.test.ts`

Cubre reducer, engine, eventos, bridge, conteos de outbox, conflictos, conectividad, autenticacion, selectores, invariantes y ausencia de dependencias de React/window/navigator.

## Limitaciones

Esto no es event sourcing persistente.

Los eventos actualizan estado observable en memoria y no se guardan historicamente.

No existe todavia productor automatico de eventos de conectividad, ciclo de vida del navegador ni autenticacion.

## Preparacion Para VIN-007E3

VIN-007E3 podra conectar productores de eventos de plataforma, por ejemplo online/offline o visibilidad, sin cambiar la forma del estado central.

## Preparacion Para VIN-008

VIN-008 podra publicar eventos de autenticacion sobre este engine sin acoplar autenticacion a sincronizacion local.
