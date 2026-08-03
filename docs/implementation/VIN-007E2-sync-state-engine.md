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

## VIN-SYNC-001 - Estado De La Memoria

VIN-SYNC-001 agrega una primera superficie de observabilidad para responder:

`Mi memoria esta realmente sincronizada?`

La implementacion no crea una segunda maquina de sync. Deriva estado desde:

- `SyncStateEngine`;
- `sync_metadata`;
- `sync_mutations`;
- eventos recientes en memoria;
- firma local deterministica de `Node`, `Context` y `NodeContextRelation`.

### Modelo De Observabilidad

El modelo derivado se expresa como `MemorySyncHealth` con estados:

- `SYNCED`;
- `SYNCING`;
- `OFFLINE`;
- `PENDING`;
- `ERROR`;
- `DIVERGED`;
- `UNKNOWN`.

Tambien expone:

- workspace y dispositivo abreviados;
- mutaciones pending, processing, failed y conflict;
- ultimo push, ultimo pull y ultimo exito;
- cursor local;
- cambios enviados, recibidos y aplicados observados en el buffer reciente;
- convergencia `CONFIRMED`, `PENDING`, `DIVERGED` o `UNKNOWN`.

### Eventos Recientes

Se mantiene un historial en memoria, limitado y no persistente, para eventos como:

- escritura local y encolado de outbox;
- push aceptado, fallido o conflictivo;
- pull con cambios;
- cambios aplicados;
- invalidacion de UI;
- offline/online.

Los eventos no incluyen contenido de capturas, tokens, payloads completos ni
secretos. Pueden incluir ids tecnicos de entidad o mutacion para diagnostico.

### Panel Estado De La Memoria

El wordmark del header abre un panel ligero con:

- estado comprensible;
- ultima sincronizacion;
- cambios pendientes y fallidos;
- cursor local;
- accion `Verificar memoria`;
- verificacion de convergencia;
- diagnostico de una captura;
- resumen tecnico seguro copiable.

En offline, `Verificar memoria` no fuerza requests inutiles. Conserva outbox y
comunica que los cambios siguen locales.

### Verificacion De Convergencia

La firma local se calcula con:

- generation/cursor local;
- ids y versiones de capturas activas;
- ids y versiones de conceptos activos;
- ids, versiones y extremos de relaciones.

No usa contenido completo de capturas.

La API actual no expone una firma remota de solo lectura. Por eso la UI no afirma
convergencia remota absoluta salvo que una firma remota sea proporcionada a la
funcion pura de verificacion. Si no hay firma remota, el resultado honesto es
`UNKNOWN` o `PENDING` si quedan mutaciones locales.

### Diagnostico De Captura

El diagnostico local puede ubicar una captura por `nodeId` o fragmento y mostrar
el recorrido:

- Local;
- Outbox;
- Servidor;
- SyncChange;
- Pull;
- Aplicacion local;
- UI.

Los tramos remotos se marcan como `UNKNOWN` cuando no existe evidencia local o
endpoint remoto de lectura segura.

### Politica Real De Conflictos

El servidor compara `baseVersion` contra la version remota actual de la entidad.
Si no coinciden, devuelve conflicto de version. El cliente marca la mutacion como
`CONFLICT` y no hace merge automatico ni sobrescritura silenciosa.

No existe todavia una UI compleja de resolucion de conflictos. VIN-SYNC-001 solo
los hace visibles como estado `DIVERGED`/requiere atencion.

## VIN-SYNC-002 - Memory Reconciliation Engine

VIN-SYNC-002 agrega un reconciliador completo que complementa el flujo incremental
existente.

El motor no reemplaza Push, Pull ni Apply. Antes de llamar al ciclo de sync, revisa
la memoria local para detectar entidades que existen en IndexedDB pero no tienen
una mutacion activa equivalente en `sync_mutations` ni un acknowledgement local
durable que demuestre que esa version local ya fue reconocida.

### Pipeline

El pipeline implementado es:

1. Health check.
2. Detectar divergencia.
3. Buscar entidades locales nunca sincronizadas.
4. Generar mutaciones faltantes.
5. Push completo mediante el coordinador existente.
6. Pull completo mediante el coordinador existente.
7. Aplicar cambios mediante el aplicador existente.
8. Verificar convergencia.
9. Reportar estado final.

### Health Check

El health check observa:

- outbox;
- mutaciones `PENDING`, `PROCESSING`, `FAILED` y `CONFLICT`;
- cursor local;
- workspace;
- device;
- generation derivada del cursor;
- conectividad conocida por `SyncStateEngine`.

Si el estado indica offline, la reconciliacion es solo lectura. No encola
mutaciones ni intenta requests.

### Entidades Huerfanas

El motor revisa:

- `Node` como `capture`;
- `Context` como `concept`;
- `NodeContextRelation` como `captureConcept`.

El criterio corregido no usa solamente la ausencia de outbox. Una entidad requiere
mutacion faltante solo si:

- no tiene mutacion activa y nunca fue reconocida en
  `sync_entity_acknowledgements`; o
- no tiene mutacion activa y su version local supera la version local reconocida.

La deteccion evita duplicar mutaciones pendientes, en proceso, fallidas o en
conflicto.

### Ledger De Acknowledgements

VIN-SYNC-002 agrega el store IndexedDB:

`sync_entity_acknowledgements`

La clave es:

`workspaceId + entityType + entityId`

Cada registro conserva:

- version remota reconocida;
- version local reconocida;
- fecha local reconocida como respaldo para registros antiguos;
- generation/cursor informativo;
- ultimo change id aplicado cuando viene de Pull.

No guarda contenido de capturas, payloads completos, tokens ni secretos.

El ledger se actualiza cuando:

- Push recibe aceptacion del servidor;
- Pull aplica o confirma idempotentemente un cambio remoto.

El ledger se elimina para el workspace durante reset local o reset remoto para no
mezclar generaciones.

### UI

El panel Estado de la memoria reutiliza esta capacidad bajo la accion visible:

`Verificar memoria`

Durante la ejecucion muestra fases humanas:

- `Revisando memoria...`;
- `Reconciliando...`;
- `Actualizando memoria...`;
- `Verificando convergencia...`;
- `Memoria integra`.

El wordmark `VN` incluye un indicador discreto:

- verde: sincronizado;
- ambar: sincronizando o pendiente;
- gris: offline;
- rojo: error o conflicto.

El indicador tiene `aria-label` y tooltip `Estado de la memoria`, por lo que no
depende solo del color.

### Convergencia

La firma local sigue siendo deterministica y no incluye contenido sensible. Como
la API aun no expone una firma remota de solo lectura, el motor no afirma
convergencia absoluta cuando no puede demostrarla.

Estados finales posibles:

- `MEMORY_INTEGRAL`;
- `PENDING_CHANGES`;
- `DIVERGENCE_DETECTED`;
- `CONFLICT`;
- `OFFLINE`.

`MEMORY_INTEGRAL` significa que el ciclo local quedo sin pendientes, fallidas ni
conflictos conocidos despues de reconciliar. No equivale todavia a una prueba
criptografica o remota de igualdad completa entre dispositivos.

## Preparacion Para VIN-007E3

VIN-007E3 podra conectar productores de eventos de plataforma, por ejemplo online/offline o visibilidad, sin cambiar la forma del estado central.

## Preparacion Para VIN-008

VIN-008 podra publicar eventos de autenticacion sobre este engine sin acoplar autenticacion a sincronizacion local.
