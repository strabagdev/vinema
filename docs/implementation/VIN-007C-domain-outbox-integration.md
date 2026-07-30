# VIN-007C - Integracion transaccional del dominio local con la outbox

## Objetivo

VIN-007C conecta las escrituras locales reales de Vinema con la outbox persistente de sincronizacion.

El objetivo no es sincronizar con la API todavia. El objetivo es asegurar que cada cambio local sincronizable deje una `SyncMutation` suficiente, valida y persistida para que VIN-007D pueda enviarla despues.

## Arquitectura elegida

La integracion se implementa mediante repositorios locales sync-aware:

- `IndexedDbLocalSyncNodeRepository`
- `IndexedDbLocalSyncContextRepository`
- `IndexedDbLocalSyncNodeContextRelationRepository`

Estos repositorios implementan las mismas interfaces de dominio que los repositorios IndexedDB existentes. La UI sigue invocando casos de uso de dominio como `createNode`, `updateNode`, `archiveNode`, `createContext` o `attachNodeToContext`.

React no construye `SyncMutation` y no conoce la outbox.

## Contexto local

Cada repositorio sync-aware recibe un `LocalSyncContext` explicito:

```ts
type LocalSyncContext = {
  workspaceId: string;
  deviceId: string;
};
```

Los valores provienen de la identidad local existente de Vinema. No se leen desde variables de entorno, HTTP, Railway ni credenciales.

## Origen de escritura

La capa distingue tres origenes:

- `LOCAL`: persiste dominio y encola mutacion.
- `REMOTE`: persiste dominio sin encolar mutacion.
- `SYSTEM`: persiste dominio sin encolar mutacion, de forma explicita.

Esto deja preparado el limite para aplicar cambios remotos futuros sin crear ciclos:

```text
pull -> persistencia local -> nueva mutacion local -> push
```

## Limite transaccional

Cada escritura local sincronizable usa una transaccion IndexedDB que incluye el store de dominio afectado y `sync_mutations`.

Stores por operacion:

- Node: `nodes`, `sync_mutations`.
- Context: `contexts`, `sync_mutations`.
- Relation: `node_context_relations`, `sync_mutations`.

La secuencia aceptada es:

```text
BEGIN TRANSACTION
  escribir dominio
  escribir sync_mutations
COMMIT
```

Si falla el enqueue o la escritura de dominio, la transaccion se aborta y no queda un registro parcial.

## Operaciones sincronizables

VIN-007C cubre las operaciones reales existentes:

- Crear captura o nodo.
- Editar contenido de captura.
- Convertir IDEA a NOTE.
- Archivar captura.
- Restaurar captura.
- Crear contexto/concepto.
- Editar contexto/concepto.
- Archivar contexto/concepto.
- Restaurar contexto/concepto.
- Crear relacion nodo-contexto.
- Eliminar relacion nodo-contexto.

No se agregan operaciones de producto nuevas.

## Mapeo dominio -> SyncMutation

Se usan los mappers y contratos compartidos de `@vinema/sync-contracts`.

| Dominio local | EntityType remoto | Operation |
| --- | --- | --- |
| `Node` | `capture` | `upsert` |
| `Context` | `concept` | `upsert` |
| `NodeContextRelation` | `captureConcept` | `upsert` |

Archive y restore se representan como snapshot del estado resultante, usando `archivedAt` en el payload.

Eliminar una relacion local se mantiene como eliminacion fisica en IndexedDB, pero la mutacion remota conserva un snapshot `captureConcept` con `archivedAt`.

## Snapshot

VIN-007C adopta snapshot completo del estado resultante, no patches.

Motivos:

- El contrato actual usa `operation: "upsert"`.
- Los payloads ya representan entidades suficientes.
- Es mas simple para aplicacion remota futura.
- Evita ambiguedad entre edit, archive y restore.

## Versionado

`Node` ya tenia `version`.

VIN-007C agrega versionado minimo a:

- `Context`
- `NodeContextRelation`

Los registros historicos sin version se normalizan a `version: 1` al leerlos desde IndexedDB.

Semantica usada:

- CREATE: `baseVersion: null`.
- UPDATE: `baseVersion` igual a la version previa.
- ARCHIVE: `baseVersion` igual a la version previa.
- RESTORE: `baseVersion` igual a la version previa.
- UNLINK de relacion: `baseVersion` igual a la version previa de la relacion.

## Mutation ID

Cada operacion logica genera un unico `mutationId` mediante `MutationIdFactory`.

Produccion usa `crypto.randomUUID()`.

Tests inyectan secuencias deterministas para asociar dominio y outbox sin depender de IDs aleatorios.

## Timestamps

Las mutaciones usan los timestamps del registro de dominio cuando el caso de uso ya los define.

Para desvincular relaciones, donde el modelo local no tenia `updatedAt`, el repositorio recibe un `Clock` inyectable y usa ese timestamp para `archivedAt`, `updatedAt` del payload y `createdAt` del registro de outbox.

## No-op y autosave

La capa sync-aware evita mutaciones triviales:

- Guardar un Node con el mismo estado sincronizable no encola.
- Guardar un Context con el mismo nombre, descripcion y archivo no encola.
- Asociar una relacion existente no duplica ni encola.
- Desvincular una relacion inexistente no encola.

Esto protege el autosave:

- Autosave con cambios reales genera mutacion.
- Autosave seguido de una accion "Listo" sin cambios no crea duplicado.
- Guardados sucesivos con cambios reales generan mutaciones distintas.

VIN-007C no implementa coalescencia ni compactacion de updates.

## Errores

Se agrega `LocalSyncWriteError` con codigos tipados:

- `INVALID_SYNC_CONTEXT`
- `INVALID_MUTATION_ORIGIN`
- `DOMAIN_RECORD_NOT_FOUND`
- `OUTBOX_ENQUEUE_FAILED`
- `ATOMIC_WRITE_FAILED`

Los errores de validacion de `SyncMutation` se propagan como fallos de enqueue y abortan la transaccion.

## Seguridad

Las mutaciones no incluyen:

- API keys.
- Access tokens.
- Sesiones.
- Secretos.
- Datos de UI.
- Borradores temporales no guardados.

VIN-007C no requiere login ni conectividad. Las operaciones locales funcionan offline y dejan mutaciones `PENDING`.

## Exclusiones de alcance

VIN-007C no implementa:

- `SyncCoordinator`.
- `SyncClient`.
- HTTP.
- Push.
- Pull.
- Retry.
- Backoff.
- Polling.
- WebSocket.
- SSE.
- Background Sync.
- Resolucion de conflictos.
- UI de sincronizacion.
- Limpieza de mutaciones confirmadas.

## Relacion con VIN-007D

VIN-007D podra consumir las mutaciones `PENDING` desde `sync_mutations` y enviarlas con el cliente HTTP ya existente.

La via `REMOTE` queda preparada para aplicar cambios descargados sin volver a encolarlos.
