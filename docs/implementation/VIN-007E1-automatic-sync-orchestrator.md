# VIN-007E1 - Automatic Sync Orchestrator

## Objetivo

VIN-007E1 introduce un orquestador automatico de sincronizacion para coordinar ciclos manuales existentes sin agregar UI ni automatizacion ligada al navegador.

El ciclo coordinado es:

PushCoordinator -> PullCoordinator.

El orquestador no hace HTTP, no accede a IndexedDB, no manipula outbox, no aplica cambios remotos y no conoce detalles del dominio.

## Arquitectura

La implementacion principal vive en:

`src/features/sync/automatic-sync-orchestrator.ts`

Sus dependencias son inyectadas:

- `PushCoordinator`
- `PullCoordinator`
- `SyncScheduler`
- `clock`
- `logger`
- configuracion

El scheduler abstracto vive en:

`src/features/sync/sync-scheduler.ts`

La implementacion por defecto usa `setTimeout`, no `setInterval`.

## Responsabilidades

El orquestador permite:

- iniciar ciclos automaticos;
- detener ciclos futuros;
- ejecutar sincronizacion inmediata;
- cancelar la ejecucion activa;
- evitar concurrencia;
- exponer estado observable;
- notificar suscriptores;
- registrar eventos sin secretos ni payloads.

## Secuencia Push -> Pull

Cada ciclo ejecuta siempre:

1. Push
2. Pull

Pull no se ejecuta si Push falla.

Esta secuencia publica primero cambios locales y luego recupera cambios remotos, reduciendo conflictos artificiales y manteniendo comportamiento determinista.

## Exclusion Concurrente

Nunca se permite mas de un ciclo activo.

Si `syncNow()` se llama mientras hay una ejecucion activa, devuelve:

`ALREADY_RUNNING`

Ese resultado es un skip de concurrencia, no un fallo. No debe degradar la
salud visible de sincronizacion ni escribirse como `sync_cycle_failed`.

Las solicitudes concurrentes se coalescen: si llega una o mas solicitudes
mientras el ciclo actual esta activo, el orquestador marca una solicitud
pendiente y ejecuta como maximo un ciclo adicional al terminar el ciclo en
curso. No se acumula una cola de ejecuciones.

## Scheduler

El scheduler expone:

- `schedule(callback, delayMs)`
- `cancel(handle)`

El orquestador programa el siguiente ciclo solo despues de finalizar el ciclo actual. Esto evita solapamientos que podrian ocurrir con `setInterval`.

## start

`start()` es idempotente.

Al iniciar:

- marca `started = true`;
- programa un unico timer;
- usa `initialSyncDelayMs` si `runOnStart` es `true`;
- usa `syncIntervalMs` si `runOnStart` es `false`.

Llamar `start()` mas de una vez no crea timers adicionales.

## stop

`stop()` es idempotente.

Al detener:

- cancela timers futuros;
- deja `started = false`;
- no cancela la ejecucion activa.

La cancelacion de una ejecucion activa es responsabilidad de `cancelCurrentRun()`.

## syncNow

`syncNow()` ejecuta un ciclo inmediato sin requerir `start()`.

Si el orquestador ya esta ejecutando un ciclo, devuelve `ALREADY_RUNNING`,
registra `sync_cycle_skipped` con `code = ALREADY_RUNNING` y coalescea una
ejecucion posterior.

Si el orquestador esta iniciado, al finalizar un `syncNow()` se programa el siguiente ciclo automatico.

## cancelCurrentRun

`cancelCurrentRun()` delega cancelacion al coordinador activo:

- si esta en Push, llama `PushCoordinator.cancel()`;
- si esta en Pull, llama `PullCoordinator.cancel()`.

No detiene ciclos futuros si el orquestador sigue iniciado.

## Estado Observable

El estado incluye:

- `started`
- `running`
- `phase`
- `lastRunStartedAt`
- `lastRunFinishedAt`
- `lastSuccessfulSyncAt`
- `nextRunAt`
- `lastError`
- `lastResult`

`getState()` devuelve una copia defensiva para evitar mutaciones externas del estado interno.

## Suscripciones

`subscribe(listener)` registra un listener y devuelve `unsubscribe`.

Errores de listeners se aislan y no rompen el orquestador ni otros listeners.

## Manejo De Errores

El orquestador captura:

- resultados fallidos de Push;
- resultados fallidos de Pull;
- cancelaciones;
- excepciones inesperadas de coordinadores;
- errores del scheduler;
- errores de listeners;
- errores de logger.

Por defecto `continueAfterError = true`, por lo que los ciclos futuros siguen programandose despues de errores.

Si `continueAfterError = false`, el orquestador detiene la programacion futura despues de un error.

## Configuracion

Defaults:

- `syncIntervalMs = 30000`
- `initialSyncDelayMs = 0`
- `runOnStart = true`
- `continueAfterError = true`

## Logging

El logger registra eventos estructurados:

- `orchestrator_started`
- `orchestrator_stopped`
- `sync_cycle_started`
- `push_started`
- `push_finished`
- `pull_started`
- `pull_finished`
- `sync_cycle_completed`
- `sync_cycle_failed`
- `sync_cycle_cancelled`
- `sync_cycle_skipped`
- `sync_follow_up_started`
- `next_sync_scheduled`

No se registran tokens, contenidos de capturas, payloads completos ni secretos.

`sync_cycle_failed` queda reservado para fallos reales. Los skips por
concurrencia usan nivel `debug` y no escriben `lastError`.

## Tests

La suite principal es:

`src/tests/automatic-sync-orchestrator.test.ts`

Cubre:

- start idempotente;
- stop idempotente;
- `runOnStart`;
- `initialSyncDelayMs`;
- secuencia Push -> Pull;
- fallo de Push sin Pull;
- fallo de Pull;
- continuidad despues de error;
- detencion con `continueAfterError = false`;
- exclusion concurrente;
- `syncNow` sin `start`;
- cancelacion de Push;
- cancelacion de Pull;
- limpieza de `running`;
- suscripcion y unsubscribe;
- aislamiento de listeners;
- copia defensiva de estado;
- logging;
- excepciones inesperadas;
- errores del scheduler;
- integracion minima con coordinadores reales.

## Limitaciones

Todavia no existe:

- UI;
- integracion React;
- hooks;
- Context Provider;
- online/offline;
- `navigator.onLine`;
- ciclo de vida de navegador;
- Background Sync;
- Service Worker Sync;
- WebSocket;
- SSE;
- autenticacion;
- resolucion de conflictos.

## Preparacion Para VIN-007E2

VIN-007E1 deja un orquestador desacoplado y testeado.

VIN-007E2 puede integrarlo con UI, providers o eventos de plataforma sin mezclar esas responsabilidades dentro del orquestador.
