# VIN-007E5 - Runtime Sync Notifications

## Contexto

Vinema ya contaba con sincronizacion autenticada basada en:

- `SyncClient`
- outbox persistente
- `PushCoordinator`
- `PullCoordinator`
- `AutomaticSyncOrchestrator`
- `AuthenticationLifecycle`
- `AuthenticatedSyncLifecycle`

La auditoria se ejecuto despues del commit `9e830d9 fix: enqueue authenticated local mutations`, que corrigio la escritura de mutaciones locales usando el workspace autenticado.

## Comportamiento Encontrado

El orchestrator generico define:

- `DEFAULT_AUTOMATIC_SYNC_INTERVAL_MS`: 30 segundos
- `DEFAULT_INITIAL_SYNC_DELAY_MS`: 0 ms
- `DEFAULT_RUN_ON_START`: `true`
- `DEFAULT_CONTINUE_AFTER_ERROR`: `true`

La composicion autenticada usaba `runOnStart: false`. Eso significa que `start()` no ejecutaba el primer ciclo por si mismo, pero `AuthenticatedSyncLifecycle` llamaba `syncNow()` una vez al entrar en estado `AUTHENTICATED`.

Despues de cada `syncNow()`, el orchestrator reprograma el siguiente ciclo si sigue iniciado. La reprogramacion ocurre tanto despues de exito como despues de errores controlados, salvo que se configure `continueAfterError: false`.

No existe un disparador de sync por `visibilitychange`, `online` u `offline`. El `visibilitychange` existente pertenece al ciclo de refresh de autenticacion, no a sincronizacion de datos.

## Intervalo Real

Antes de esta correccion:

- sync inicial al autenticar/restaurar: inmediato mediante `syncNow()`.
- polling posterior: cada 30 segundos.
- peor caso teorico para push local: hasta 30 segundos si la captura ocurre justo despues de un ciclo.
- peor caso teorico para pull en otro cliente: hasta 30 segundos adicionales.
- peor caso entre dos clientes sin accion manual: cercano a 60 segundos.

Despues de esta correccion:

- sync inicial al autenticar/restaurar: inmediato mediante `syncNow()`.
- polling posterior autenticado: cada 10 segundos.
- peor caso teorico para push local: hasta 10 segundos.
- peor caso teorico para pull en otro cliente: hasta 10 segundos adicionales.
- peor caso entre dos clientes sin SSE: cercano a 20 segundos.

## Necesidad de F5

Antes de esta correccion, `PullCoordinator` aplicaba cambios remotos en IndexedDB, pero la UI no recibia ninguna senal local despues del Pull.

Las vistas principales consultaban IndexedDB al montar, al navegar o ante eventos locales de captura. Por eso una captura recibida por Pull podia existir localmente y aun asi no aparecer en la vista abierta hasta recargar, navegar o provocar otra recarga local.

Clasificacion:

- Pull ocurria.
- Pull aplicaba cambios en IndexedDB.
- La UI no reaccionaba automaticamente.

## Correccion Aplicada

Se agrego un evento local explicito:

```text
RemoteChangeApplier
-> IndexedDB transaction committed
-> SyncDataChangedEvent
-> vistas recargan desde IndexedDB
```

El evento emite informacion minima:

- `workspaceId`
- `entityTypes`
- `changedAt`

No transporta capturas, conceptos, relaciones ni tokens.

Las vistas afectadas se suscriben al evento y recargan desde IndexedDB cuando el workspace y los tipos de entidad coinciden.

## Vistas Actualizadas

Las siguientes superficies reaccionan a cambios remotos sin recargar la pagina:

- superficie principal de captura reciente
- Historial
- Archivo
- detalle de captura
- listado de contextos
- detalle de contexto

IndexedDB sigue siendo la fuente local de verdad.

## Polling vs SSE vs WebSocket

### Polling Actual

Ventajas:

- ya existe;
- funciona offline-first;
- simple de razonar;
- no requiere estado persistente en servidor;
- tolera cortes de conexion.

Desventajas:

- latencia de hasta dos intervalos entre dispositivos;
- consumo innecesario cuando no hay cambios;
- no avisa inmediatamente a otros clientes.

### SSE

SSE encaja bien con Vinema porque el envio de datos ya ocurre por HTTP Push. El servidor solo necesita avisar que un workspace cambio.

Modelo recomendado:

```text
Cliente A
-> POST /api/sync/push
-> PostgreSQL
-> evento SSE workspace_changed
-> Cliente B recibe aviso
-> Cliente B ejecuta Pull HTTP normal
```

El evento SSE deberia transportar solo:

```json
{
  "workspaceId": "workspace-id",
  "cursor": "next-change-cursor",
  "occurredAt": "2026-07-31T12:00:00.000Z"
}
```

Ventajas:

- menor latencia;
- comunicacion unidireccional suficiente;
- mantiene Pull HTTP como mecanismo probado;
- evita enviar payloads sensibles por el canal de notificacion.

Riesgos:

- requiere endpoint autenticado SSE;
- requiere reconexion con backoff;
- requiere considerar rotacion del access token;
- en multiples instancias Railway puede requerir pub/sub externo si el evento se emite desde una instancia distinta a la conexion SSE.

### WebSocket

WebSocket no es necesario para el estado actual. Vinema no requiere edicion colaborativa por caracter ni comunicacion bidireccional persistente. Usarlo ahora aumentaria la complejidad de autenticacion, reconexion, backpressure y mantenimiento sin una necesidad demostrada.

## Decision Adoptada

Para esta fase se adopta:

- Push por HTTP.
- Pull por HTTP.
- polling autenticado de respaldo cada 10 segundos.
- invalidacion local de UI despues de Pull aplicado.
- no implementar SSE todavia.
- no implementar WebSocket.

SSE queda recomendado como siguiente evolucion cuando se aborde notificacion casi en tiempo real entre dispositivos.

## Arquitectura Recomendada Con SSE

```text
Local mutation
-> Outbox
-> Push HTTP
-> PostgreSQL
-> SSE workspace_changed
-> otros clientes reciben aviso
-> syncNow() o pullNow()
-> IndexedDB
-> SyncDataChangedEvent local
-> UI recarga desde IndexedDB
```

Mantener:

- sync inicial al autenticar;
- polling lento como fallback;
- reconexion SSE con backoff;
- deduplicacion por cursor o `changeVersion`;
- bloqueo de pulls simultaneos;
- cierre en logout/dispose.

## Seguridad

El evento local no contiene contenido de capturas ni secretos.

El futuro evento SSE tampoco debe transportar datos completos. Solo debe avisar que existen cambios para un workspace autorizado. Los datos reales deben seguir llegando por Pull HTTP autenticado.

## Limitaciones

La correccion actual no reduce la latencia a tiempo real. Reduce el peor caso teorico mediante polling de 10 segundos y elimina la necesidad de F5 despues de que Pull aplica datos.

La reduccion adicional de latencia requiere implementar SSE o un mecanismo equivalente de notificacion remota.
