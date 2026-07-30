# VIN-007D3 - End-to-End Synchronization Validation

## Objetivo

VIN-007D3 valida el ciclo completo de sincronizacion manual entre dos dispositivos logicos de Vinema:

Device A -> IndexedDB A -> Outbox A -> PushCoordinator A -> API local en memoria -> PullCoordinator B -> IndexedDB B.

Tambien valida el sentido inverso desde Device B hacia Device A.

Esta fase no introduce sincronizacion automatica, polling, UI, Background Sync, WebSocket, SSE ni resolucion manual de conflictos.

## Entorno

La validacion local usa:

- `fake-indexeddb` para IndexedDB.
- Dos nombres de base explicitos por ejecucion.
- `PushCoordinator` real.
- `PullCoordinator` real.
- `RemoteChangeApplier` real.
- Repositorios locales con outbox real.
- El servicio de sincronizacion del servidor con `InMemorySyncStore`.

La validacion contra API real queda separada en `npm run sync:test-api` y depende de variables locales.

## Arquitectura De Pruebas

El harness vive en `src/tests/e2e-sync-harness.ts`.

Cada ejecucion crea:

- un `workspaceId` unico;
- `deviceId` A unico;
- `deviceId` B unico;
- IndexedDB A independiente;
- IndexedDB B independiente;
- repositorios de dominio por dispositivo;
- outbox por dispositivo;
- metadata por dispositivo;
- coordinadores Push/Pull por dispositivo;
- cliente de sincronizacion apuntando al mismo store remoto en memoria.

## Aislamiento

Las bases locales usan nombres generados por ejecucion con el formato:

- `vinema-e2e-<uuid>-device-a`
- `vinema-e2e-<uuid>-device-b`

El store remoto en memoria acepta unicamente el `workspaceId` generado por la ejecucion.

## Limpieza

Antes y despues de las pruebas se eliminan las bases IndexedDB de los dispositivos de prueba.

La prueba local no requiere cleanup remoto persistente porque el remoto es un store en memoria descartado al finalizar el proceso.

La prueba contra Railway no borra datos ajenos. Si no existe endpoint de cleanup remoto, debe usar un workspace de prueba aislado.

## Escenarios Ejecutados

La suite `src/tests/sync-e2e.test.ts` cubre:

1. A crea captura y B la recibe.
2. B edita captura y A converge.
3. Context sincronizado.
4. Relacion Node-Context sincronizada.
5. Archive de Node.
6. Restore de Node.
7. Archive de Context.
8. Restore de Context.
9. 100 capturas offline.
10. Multiples contextos offline.
11. Multiples relaciones offline.
12. Push en multiples lotes.
13. Pull en multiples lotes.
14. Idempotencia de push.
15. Idempotencia de pull.
16. Persistencia de cursor tras reapertura logica.
17. Deteccion de conflicto.
18. Preservacion de datos locales ante conflicto.
19. Cancelacion de push.
20. Cancelacion de pull.
21. Fallo transitorio de push con recuperacion.
22. Fallo transitorio de pull con recuperacion.
23. Ausencia de outbox generada por cambios remotos.
24. No duplicacion de registros.
25. Cleanup local.

## Criterios De Convergencia

El comparador normaliza y compara:

- Nodes por `id`, `workspaceId`, `content`, `status`, `version`, `archivedAt`.
- Contexts por `id`, `workspaceId`, `name`, `type`, `version`, `archivedAt`.
- NodeContextRelations por `id`, `workspaceId`, `nodeId`, `contextId`, `relationType`, `version`.

Ignora metadata local de dispositivos, timestamps de intentos de sync y estado de outbox.

## Evidencia De No Duplicacion

Los escenarios de idempotencia repiten push y pull sobre datos ya aplicados.

El resultado esperado es:

- un unico Node por identidad logica;
- un unico Context por identidad logica;
- una unica Relation por identidad logica;
- cursor persistido;
- outbox remota vacia.

## Evidencia De Outbox Remota Limpia

Los cambios aplicados por `PullCoordinator` usan `RemoteChangeApplier` y escriben dominio local sin pasar por los repositorios `LOCAL`.

Por eso Device B no genera mutaciones al recibir cambios de Device A, y Device A no genera mutaciones al recibir cambios de Device B.

## Defectos Encontrados

### MutationIdFactory sin binding de Crypto

Durante la primera ejecucion E2E, las escrituras dominio -> outbox fallaban con:

`TypeError: Value of "this" must be of type Crypto`

La causa era que `createLocalSyncRepositories` guardaba `crypto.randomUUID` como funcion suelta. En Node, ese metodo requiere conservar el receptor `crypto`.

Correccion:

`crypto.randomUUID` se reemplazo por `() => crypto.randomUUID()`.

### Orden Logico De Relaciones En Datos De Prueba

Las relaciones dependen de que captura y contexto existan antes de enviarse al servidor.

El harness usa un reloj incremental para que las mutaciones fabricadas por pruebas con dependencias conserven el orden:

Context -> Node -> Relation.

## Limitaciones

La suite local no usa PostgreSQL ni red real. Esa validacion queda cubierta por `npm run sync:test-api` cuando existen credenciales locales.

No existe todavia un endpoint de cleanup remoto especifico para datos E2E. Por eso las pruebas remotas deben usar workspaces aislados.

## Preparacion Para VIN-007E

VIN-007D3 deja validados los coordinadores manuales y la convergencia de dos dispositivos.

VIN-007E puede apoyarse en esta base para decidir cuando ejecutar push/pull automaticamente, pero no debe mezclar esa automatizacion con esta fase.
